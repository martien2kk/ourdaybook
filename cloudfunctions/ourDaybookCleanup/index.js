const cloud=require('wx-server-sdk')
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV})
const db=cloud.database()
const _=db.command

const TEMPLATE_ID=String(process.env.REMINDER_TEMPLATE_ID||'').trim()
const EMPTY_SPACE_RETENTION=30*24*60*60*1000
const DELETION_RETENTION=24*60*60*1000
const REMINDER_RETENTION=30*24*60*60*1000
const DELETED_ENTRY_RETENTION=24*60*60*1000
const PENDING_UPLOAD_RETENTION=24*60*60*1000
const USED_UPLOAD_RECORD_RETENTION=7*24*60*60*1000

function timeOf(value){
  if(!value)return 0
  if(value instanceof Date)return value.getTime()
  if(value.$date)return Number(value.$date)
  const parsed=new Date(value).getTime()
  return Number.isFinite(parsed)?parsed:0
}
function today(){return new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10)}
async function count(collection,where){return (await db.collection(collection).where(where).count()).total}
async function markReminder(id,data){return db.collection('reminders').doc(id).update({data:Object.assign({},data,{updatedAt:db.serverDate()})})}
async function deleteCloudFiles(paths){
  const files=Array.from(new Set((paths||[]).filter(path=>String(path||'').startsWith('cloud://'))))
  for(let i=0;i<files.length;i+=50)await cloud.deleteFile({fileList:files.slice(i,i+50)}).catch(()=>{})
}

async function sendReminder(reminder){
  if(!TEMPLATE_ID)throw new Error('REMINDER_TEMPLATE_ID is not configured')
  if(reminder.dateKey!==today()){await markReminder(reminder._id,{status:'cancelled',reason:'expired'});return 'cancelled'}
  let user
  try{user=(await db.collection('users').doc(reminder.openid).get()).data}catch(error){user=null}
  if(!user||user.deletionRequestedAt){await markReminder(reminder._id,{status:'cancelled',reason:user?'account-pending-deletion':'account-missing'});return 'cancelled'}
  const submitted=await db.collection('entries').where({ownerOpenid:reminder.openid,dateKey:reminder.dateKey,deleted:_.neq(true)}).limit(1).get()
  if(submitted.data.length){await markReminder(reminder._id,{status:'cancelled',reason:'already-submitted'});return 'cancelled'}

  await cloud.openapi.subscribeMessage.send({
    touser:reminder.openid,
    templateId:TEMPLATE_ID,
    page:'pages/home/home',
    data:{
      thing1:{value:'完成今天的同日簿记录'},
      date2:{value:reminder.displayTime||`${reminder.dateKey} 20:00`},
      thing5:{value:'今天的一页，还在等你写下。'}
    },
    miniprogramState:'formal',
    lang:'zh_CN'
  })
  await markReminder(reminder._id,{status:'sent',sentAt:db.serverDate()})
  return 'sent'
}

async function sendDueReminders(){
  const due=await db.collection('reminders').where({status:'pending',remindAt:_.lte(new Date())}).limit(100).get()
  const summary={checked:due.data.length,sent:0,cancelled:0,failed:0}
  for(const reminder of due.data){
    try{summary[await sendReminder(reminder)]++}
    catch(error){summary.failed++;await markReminder(reminder._id,{status:'failed',errorMessage:String(error&&error.message?error.message:error).slice(0,300)}).catch(()=>{})}
  }
  return summary
}

async function expireInviteCodes(){
  const result=await db.collection('couples').where({active:true}).limit(100).get()
  let expired=0
  for(const couple of result.data){
    const members=Array.isArray(couple.memberIds)?couple.memberIds:[]
    if(members.length<2&&couple.inviteCode&&timeOf(couple.inviteExpiresAt)&&timeOf(couple.inviteExpiresAt)<=Date.now()){
      await db.collection('couples').doc(couple._id).update({data:{inviteCode:'',inviteExpiresAt:null,updatedAt:db.serverDate()}})
      expired++
    }
  }
  return {checked:result.data.length,expired}
}

async function purgeUser(openid,user){
  if(user.coupleId){
    try{const couple=(await db.collection('couples').doc(user.coupleId).get()).data,ids=(couple.memberIds||[]).filter(id=>id!==openid);await db.collection('couples').doc(couple._id).update({data:{memberIds:ids,active:ids.length>0,updatedAt:db.serverDate()}})}catch(error){}
  }
  const entries=await db.collection('entries').where({ownerOpenid:openid}).limit(1000).get()
  const files=entries.data.map(entry=>entry.imagePath).concat(user.avatar?[user.avatar]:[])
  await Promise.all(entries.data.map(entry=>db.collection('entries').doc(entry._id).remove()))
  await db.collection('meetings').where({creatorOpenid:openid}).remove()
  await db.collection('reminders').where({openid}).remove()
  await deleteCloudFiles(files)
  await db.collection('users').doc(openid).remove()
}

async function purgeExpiredAccounts(){
  const result=await db.collection('users').where({deletionRequestedAt:_.neq('')}).limit(100).get()
  let removed=0
  for(const user of result.data){const requestedAt=timeOf(user.deletionRequestedAt);if(requestedAt&&Date.now()-requestedAt>=DELETION_RETENTION){await purgeUser(user._id,user);removed++}}
  return {checked:result.data.length,removed}
}

async function cleanupEmptySpaces(){
  const cutoff=Date.now()-EMPTY_SPACE_RETENTION
  const result=await db.collection('couples').where({active:false}).limit(100).get()
  let removed=0,archived=0,skipped=0
  for(const couple of result.data){
    const memberIds=Array.isArray(couple.memberIds)?couple.memberIds:[]
    const inactiveSince=timeOf(couple.updatedAt)||timeOf(couple.createdAt)
    if(memberIds.length||!inactiveSince||inactiveSince>cutoff){skipped++;continue}
    if(await count('entries',{coupleId:couple._id})){
      await db.collection('couples').doc(couple._id).update({data:{archived:true,inviteCode:'',inviteExpiresAt:null,archivedAt:db.serverDate()}})
      archived++;continue
    }
    await db.collection('dailyTasks').where({coupleId:couple._id}).remove()
    await db.collection('meetings').where({coupleId:couple._id}).remove()
    await db.collection('couples').doc(couple._id).remove()
    removed++
  }
  return {checked:result.data.length,removed,archived,skipped}
}

async function cleanupOldReminders(){
  const result=await db.collection('reminders').where({status:_.in(['sent','cancelled','failed']),updatedAt:_.lte(new Date(Date.now()-REMINDER_RETENTION))}).remove()
  return {removed:Number(result.stats&&result.stats.removed||0)}
}

async function cleanupDeletedEntries(){
  const result=await db.collection('entries').where({deleted:true,deletedAt:_.lte(new Date(Date.now()-DELETED_ENTRY_RETENTION))}).limit(100).get()
  let removed=0,failed=0
  for(const entry of result.data){
    try{await deleteCloudFiles([entry.imagePath]);await db.collection('entries').doc(entry._id).remove();removed++}
    catch(error){failed++}
  }
  return {checked:result.data.length,removed,failed}
}

async function cleanupPendingUploads(){
  const result=await db.collection('pendingUploads').where({status:'pending',createdAt:_.lte(new Date(Date.now()-PENDING_UPLOAD_RETENTION))}).limit(100).get()
  let removed=0,failed=0
  for(const upload of result.data){
    try{
      const [entries,users]=await Promise.all([
        db.collection('entries').where({imagePath:upload.fileID}).limit(1).get(),
        db.collection('users').where({avatar:upload.fileID}).limit(1).get()
      ])
      if(entries.data.length||users.data.length){
        await db.collection('pendingUploads').doc(upload._id).update({data:{status:'used',usedAt:db.serverDate(),updatedAt:db.serverDate()}})
        continue
      }
      await deleteCloudFiles([upload.fileID]);await db.collection('pendingUploads').doc(upload._id).remove();removed++
    }
    catch(error){failed++}
  }
  const used=await db.collection('pendingUploads').where({status:'used',updatedAt:_.lte(new Date(Date.now()-USED_UPLOAD_RECORD_RETENTION))}).remove()
  return {checked:result.data.length,removed,failed,usedRecordsRemoved:Number(used.stats&&used.stats.removed||0)}
}

exports.main=async()=>({
  ok:true,
  reminders:await sendDueReminders(),
  invites:await expireInviteCodes(),
  accounts:await purgeExpiredAccounts(),
  deletedEntries:await cleanupDeletedEntries(),
  pendingUploads:await cleanupPendingUploads(),
  spaces:await cleanupEmptySpaces(),
  oldReminders:await cleanupOldReminders()
})
