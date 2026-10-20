const cloud = require('wx-server-sdk')
cloud.init({ env:cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const REQUIRED = ['日常','所见','心情']
const OPTIONAL = ['截图','回忆','创意','思念']
const DEFAULT_CATEGORIES = REQUIRED.concat(OPTIONAL)
const PROMPT_TAXONOMY_VERSION = 8
const DEFAULT_PROMPTS = require('./default-prompts')
// 测试版本开启；提交正式审核前必须改回 false 并重新部署云函数。
const ENABLE_DEBUG_TOOLS = false

function now(){return new Date()}
function iso(value){return (value || now()).toISOString()}
function clean(value,max){return String(value == null ? '' : value).trim().slice(0,max)}
function required(value,label,max){const text=clean(value,max);if(!text)throw new Error(`${label}不能为空`);return text}
function dateKey(){const d=new Date(Date.now()+8*3600000);return d.toISOString().slice(0,10)}
function userDateKey(user){const mockDate=ENABLE_DEBUG_TOOLS&&user&&user.settings&&clean(user.settings.mockDate,10);return /^\d{4}-\d{2}-\d{2}$/.test(mockDate)?mockDate:dateKey()}
function monthKey(day){return String(day || dateKey()).slice(0,7)}
function nextDay(day){const value=new Date(`${day}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+1);return value.toISOString().slice(0,10)}
function personalOn(couple,day){return couple.spaceType==='personal'||Boolean(couple.pairingEffectiveDate&&day<couple.pairingEffectiveDate)}
function randomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let out='';for(let i=0;i<6;i++)out+=chars[Math.floor(Math.random()*chars.length)];return out}
const INVITE_TTL=7*24*60*60*1000
const CUSTOM_PROMPT_TTL=7*24*60*60*1000
const CUSTOM_CATEGORY_LIMIT=3
const DELETE_UNDO_TTL=24*60*60*1000
const CLOUD_IMAGE_MAX_SIZE=400*1024
function timeOf(value){if(!value)return 0;if(value instanceof Date)return value.getTime();if(value.$date)return Number(value.$date);const parsed=new Date(value).getTime();return Number.isFinite(parsed)?parsed:0}
function inviteExpiry(couple){return timeOf(couple.inviteExpiresAt)||(timeOf(couple.createdAt)+INVITE_TTL)}
function inviteView(couple){const expires=inviteExpiry(couple),expired=!expires||expires<=Date.now();return Object.assign({},couple,{inviteExpired:expired,inviteExpiresAt:expires?new Date(expires).toISOString():'',inviteExpiresOn:expires?new Date(expires).toISOString().slice(0,10):''})}
function sameMemberSet(left,right){return Array.isArray(left)&&Array.isArray(right)&&left.length===2&&right.length===2&&left.slice().sort().join('|')===right.slice().sort().join('|')}
function reunionFor(source,target){return source&&target&&sameMemberSet(source.archivedMemberIds,target.archivedMemberIds)?{relationId:source.archivedRelationId||target.archivedRelationId,archivedAt:source.archivedAt||target.archivedAt}:null}
async function uniqueInviteCode(){for(let i=0;i<12;i++){const code=randomCode(),found=await db.collection('couples').where({inviteCode:code,active:true}).limit(1).get();if(!found.data.length)return code}throw new Error('邀请码生成繁忙，请稍后重试')}
function publicUser(user){return {id:user._id,nickname:user.nickname||'',avatar:user.avatar||'',city:user.locationVisible===false?'未公开':(user.city||''),locationVisible:user.locationVisible!==false}}
function settingsOf(user){return Object.assign({cardTheme:'minimal',appTheme:'minimal',reminders:false,enabledCategories:DEFAULT_CATEGORIES.slice(),customCategories:[],promptTaxonomyVersion:PROMPT_TAXONOMY_VERSION},user.settings||{})}
function migratePromptSettings(settings){
  if(Number(settings.promptTaxonomyVersion||0)>=PROMPT_TAXONOMY_VERSION)return {settings,changed:false}
  settings.enabledCategories=Array.from(new Set((settings.enabledCategories||[]).concat(DEFAULT_CATEGORIES)))
  settings.promptTaxonomyVersion=PROMPT_TAXONOMY_VERSION
  return {settings,changed:true}
}
async function one(collection,id){try{return (await db.collection(collection).doc(id).get()).data}catch(error){return null}}
async function deleteCloudFiles(paths){
  const files=Array.from(new Set((paths||[]).filter(path=>String(path||'').startsWith('cloud://'))))
  for(let i=0;i<files.length;i+=50)await cloud.deleteFile({fileList:files.slice(i,i+50)}).catch(()=>{})
}
function securityFailure(error,type){
  const detail=String(error&&(error.errMsg||error.message||error.errCode)||error||'')
  if(/87014|risky|review|违规|不合规/i.test(detail))throw new Error(`${type}可能包含不适宜内容，请修改后重试`)
  throw new Error(`${type}安全检测暂时不可用，请稍后重试`)
}
async function checkText(openid,values){
  const content=(values||[]).map(value=>clean(value,500)).filter(Boolean).join('\n').slice(0,2500)
  if(!content)return
  try{
    const response=await cloud.openapi.security.msgSecCheck({openid,scene:2,version:2,content})
    const suggest=response&&response.result&&response.result.suggest
    if(suggest&&suggest!=='pass')throw new Error(`security-${suggest}`)
  }catch(error){securityFailure(error,'文字')}
}
function imageContentType(fileID){
  const extension=(String(fileID||'').match(/\.([a-zA-Z0-9]+)(?:\?|$)/)||[])[1]
  return ({png:'image/png',gif:'image/gif',webp:'image/webp',jpeg:'image/jpeg',jpg:'image/jpeg'})[String(extension||'').toLowerCase()]||'image/jpeg'
}
async function checkImage(fileID){
  if(!String(fileID||'').startsWith('cloud://'))throw new Error('图片来源无效，请重新选择图片')
  try{
    const downloaded=await cloud.downloadFile({fileID})
    const buffer=downloaded&&downloaded.fileContent
    if(!buffer||!buffer.length)throw new Error('empty-image')
    if(buffer.length>CLOUD_IMAGE_MAX_SIZE)throw new Error('image-too-large')
    await cloud.openapi.security.imgSecCheck({media:{contentType:imageContentType(fileID),value:buffer}})
  }catch(error){
    if(/image-too-large/.test(String(error&&error.message)))throw new Error('轻量展示图超过上传限制，请重新选择图片后重试')
    securityFailure(error,'图片')
  }
}
async function registerUpload(openid,event){
  const fileID=clean(event.fileID,600),kind=event.kind==='avatars'?'avatars':'entries'
  if(!fileID.startsWith('cloud://'))throw new Error('上传文件无效')
  const result=await db.collection('pendingUploads').add({data:{openid,fileID,kind,status:'pending',createdAt:db.serverDate(),updatedAt:db.serverDate()}})
  return {id:result._id,fileID}
}
async function consumeUpload(openid,fileID){
  if(!String(fileID||'').startsWith('cloud://'))return
  const result=await db.collection('pendingUploads').where({openid,fileID,status:'pending'}).limit(20).get()
  for(const item of result.data)await db.collection('pendingUploads').doc(item._id).update({data:{status:'used',usedAt:db.serverDate(),updatedAt:db.serverDate()}})
}
async function me(openid){return one('users',openid)}
async function purgeUserData(openid,user,removeEmptySpace){
  if(user&&user.coupleId){
    const couple=await one('couples',user.coupleId)
    if(couple){
      const ids=(couple.memberIds||[]).filter(id=>id!==openid)
      if(removeEmptySpace&&ids.length===0){
        await db.collection('dailyTasks').where({coupleId:couple._id}).remove()
        await db.collection('meetings').where({coupleId:couple._id}).remove()
        await db.collection('couples').doc(couple._id).remove()
      }else{
        await db.collection('couples').doc(couple._id).update({data:{memberIds:ids,active:ids.length>0,updatedAt:db.serverDate()}})
      }
    }
  }
  const owned=await db.collection('entries').where({ownerOpenid:openid}).limit(1000).get()
  const files=owned.data.map(entry=>entry.imagePath).concat(user&&user.avatar?[user.avatar]:[])
  await Promise.all(owned.data.map(entry=>db.collection('entries').doc(entry._id).remove()))
  const meetings=await db.collection('meetings').where({creatorOpenid:openid}).limit(1000).get()
  await Promise.all(meetings.data.map(meeting=>db.collection('meetings').doc(meeting._id).remove()))
  await db.collection('reminders').where({openid}).remove()
  const pending=await db.collection('pendingUploads').where({openid}).limit(1000).get()
  await deleteCloudFiles(pending.data.filter(item=>item.status==='pending').map(item=>item.fileID))
  for(const item of pending.data)await db.collection('pendingUploads').doc(item._id).remove()
  await deleteCloudFiles(files)
  await db.collection('users').doc(openid).remove()
}
async function ensureUser(openid){
  let user=await me(openid)
  const deletionAt=user&&timeOf(user.deletionRequestedAt)
  if(deletionAt&&Date.now()-deletionAt>=DELETE_UNDO_TTL){await purgeUserData(openid,user);user=null}
  if(user){
    const migrated=migratePromptSettings(settingsOf(user))
    if(migrated.changed){
      user.settings=migrated.settings
      await db.collection('users').doc(openid).update({data:{settings:user.settings,updatedAt:db.serverDate()}})
    }
    return user
  }
  user={_id:openid,nickname:'',avatar:'',city:'',anniversary:'',locationVisible:true,theme:'minimal',onboarded:false,coupleId:'',settings:settingsOf({}),createdAt:db.serverDate(),updatedAt:db.serverDate()}
  try{await db.collection('users').add({data:user})}catch(error){user=await me(openid);if(!user)throw error}
  return user
}
async function requireCouple(user){if(!user.coupleId)throw new Error('请先创建或加入双人空间');const couple=await one('couples',user.coupleId);if(!couple||!couple.active||!couple.memberIds.includes(user._id))throw new Error('双人空间不存在或已失效');return couple}
async function usersFor(ids){if(!ids.length)return [];return (await db.collection('users').where({_id:_.in(ids)}).get()).data}
async function entriesFor(coupleId,day){return (await db.collection('entries').where({coupleId,dateKey:day,deleted:_.neq(true)}).get()).data}
async function withTemporaryUrls(entries){
  const copies=entries.filter(Boolean).map(entry=>Object.assign({},entry))
  const fileIDs=copies.map(entry=>entry.imagePath).filter(path=>String(path||'').startsWith('cloud://'))
  if(!fileIDs.length)return copies
  const result=await cloud.getTempFileURL({fileList:Array.from(new Set(fileIDs))})
  const urls={}
  ;(result.fileList||[]).forEach(file=>{if(file.fileID&&file.tempFileURL)urls[file.fileID]=file.tempFileURL})
  copies.forEach(entry=>{if(urls[entry.imagePath])entry.imagePath=urls[entry.imagePath]})
  return copies
}
function entryId(coupleId,day,openid){return `${coupleId}_${day}_${openid}`}
function taskId(coupleId,day){return `${coupleId}_${day}`}
function allPrompts(user){return DEFAULT_PROMPTS.filter(p=>p.enabled!==false).concat(user.customPrompts||[])}
function promptPool(user){
  const settings=settingsOf(user);const enabled=settings.enabledCategories||REQUIRED
  return allPrompts(user).filter(p=>enabled.includes(p.category))
}
const DAILY_REFRESH_LIMIT=3
function taskOptions(task,pool){
  const stored=Array.isArray(task&&task.promptOptions)?task.promptOptions.filter(item=>item&&item.id):[]
  if(stored.length)return stored
  const byId={};(pool||[]).forEach(prompt=>{byId[prompt.id]=prompt})
  const options=taskPromptIds(task).map(id=>byId[id]).filter(Boolean)
  if(task&&task.prompt&&!options.some(prompt=>prompt.id===task.prompt.id))options.push(task.prompt)
  return options.length?options:[task.prompt].filter(Boolean)
}
function taskView(task,pool){
  const refreshCount=Number(task.refreshCount||0)
  const promptOptions=taskOptions(task,pool)
  let currentPromptIndex=Number.isInteger(task.currentPromptIndex)?task.currentPromptIndex:promptOptions.findIndex(prompt=>prompt.id===task.promptId)
  if(currentPromptIndex<0||currentPromptIndex>=promptOptions.length)currentPromptIndex=Math.max(0,promptOptions.length-1)
  const prompt=promptOptions[currentPromptIndex]||task.prompt
  const refreshAvailable=refreshCount<DAILY_REFRESH_LIMIT
  const nextAction=currentPromptIndex<promptOptions.length-1?'existing':refreshAvailable?'new':'cycle'
  return Object.assign({},task,{promptId:prompt.id,prompt,promptOptions,currentPromptIndex,promptPosition:currentPromptIndex+1,promptCount:promptOptions.length,refreshCount,refreshRemaining:Math.max(0,DAILY_REFRESH_LIMIT-refreshCount),refreshAvailable,switchAvailable:refreshAvailable||promptOptions.length>1,nextAction})
}
async function taskHistory(coupleId){return (await db.collection('dailyTasks').where({coupleId}).limit(1000).get()).data}
function taskPromptIds(task){return Array.from(new Set([].concat(task&&task.promptHistory||[],task&&task.promptId||[]).filter(Boolean)))}
function choosePrompt(pool,coupleId,day,usedIds,salt){
  let candidates=pool.filter(prompt=>!usedIds.has(prompt.id))
  if(!candidates.length)candidates=pool.slice()
  let sum=0
  for(const ch of `${coupleId}:${day}:${salt||0}`)sum=(sum*31+ch.charCodeAt(0))>>>0
  return candidates[sum%candidates.length]
}
async function status(user,couple,day){
  const entries=await entriesFor(couple._id,day);const mine=entries.find(e=>e.ownerOpenid===user._id)||null
  const partnerId=couple.memberIds.find(id=>id!==user._id);const partner=partnerId?await one('users',partnerId):null
  const storedTheirs=partnerId?entries.find(e=>e.ownerOpenid===partnerId)||null:null
  const sharingActive=Boolean(couple.pairingEffectiveDate&&userDateKey(user)>=couple.pairingEffectiveDate&&day<couple.pairingEffectiveDate)
  const partnerShares=Boolean(partner&&settingsOf(partner).sharePrePairRecords)
  const theirs=storedTheirs&&(storedTheirs.visibility!=='private'||(sharingActive&&partnerShares))?storedTheirs:null
  const personal=Boolean(mine&&(mine.recordMode==='personal'||mine.visibility==='private'))
  const sharedHistorical=Boolean(theirs&&theirs.visibility==='private')
  const restoredPair=Boolean(mine&&theirs&&mine.recordMode==='pair'&&theirs.recordMode==='pair')
  const pairPending=Boolean(couple.spaceType==='pair'&&couple.pairingEffectiveDate&&day<couple.pairingEffectiveDate&&!restoredPair)
  const personalSpace=personalOn(couple,day)&&!restoredPair,spaceType=personalSpace?'personal':'pair'
  const unlocked=Boolean(personal||sharedHistorical||(mine&&theirs))
  let myEntry=mine
  let partnerEntry=unlocked&&theirs?Object.assign({},theirs):null
  if(mine){
    const visible=await withTemporaryUrls(unlocked&&theirs?[mine,theirs]:[mine])
    myEntry=visible[0]
    if(unlocked&&theirs)partnerEntry=visible[1]
  }
  if(partnerEntry&&partner&&partner.locationVisible===false)partnerEntry.city='未公开'
  return {dateKey:day,hasSubmitted:Boolean(mine),partnerSubmitted:Boolean(theirs),unlocked,mode:sharedHistorical?'sharedPersonal':pairPending?'pairPending':personal||spaceType==='personal'?'personal':'pair',spaceType,myEntry,partner:partner?publicUser(partner):null,partnerEntry}
}
async function currentTask(user,couple,day){
  const pool=promptPool(user);if(!pool.length)throw new Error('题库中没有启用的题目')
  const id=taskId(couple._id,day);let task=await one('dailyTasks',id);if(task)return taskView(task,allPrompts(user))
  const history=await taskHistory(couple._id),usedIds=new Set(history.reduce((ids,item)=>ids.concat(taskPromptIds(item)),[]))
  const prompt=choosePrompt(pool,couple._id,day,usedIds,history.length)
  task={_id:id,id,coupleId:couple._id,dateKey:day,promptId:prompt.id,prompt,promptHistory:[prompt.id],promptOptions:[prompt],currentPromptIndex:0,refreshCount:0,createdAt:db.serverDate()}
  try{await db.collection('dailyTasks').add({data:task})}catch(error){task=await one('dailyTasks',id);if(!task)throw error}
  return taskView(task,allPrompts(user))
}
async function refreshTodayTask(openid,event){
  const user=await ensureUser(openid),couple=await requireCouple(user),day=event.dateKey||userDateKey(user),id=taskId(couple._id,day)
  await currentTask(user,couple,day)
  if((await entriesFor(couple._id,day)).length)throw new Error('已有成员提交今天的记录，不能再刷新题目')
  const pool=promptPool(user);if(pool.length<2)throw new Error('当前启用的题目不足，无法刷新')
  const history=await taskHistory(couple._id),usedIds=new Set(history.reduce((ids,item)=>ids.concat(taskPromptIds(item)),[]))
  await db.runTransaction(async transaction=>{
    const latest=(await transaction.collection('dailyTasks').doc(id).get()).data
    const refreshCount=Number(latest.refreshCount||0)
    const submitted=(await transaction.collection('entries').where({coupleId:couple._id,dateKey:day,deleted:false}).limit(1).get()).data
    if(submitted.length)throw new Error('已有成员提交今天的记录，不能再刷新题目')
    const promptOptions=taskOptions(latest,allPrompts(user))
    let currentPromptIndex=Number.isInteger(latest.currentPromptIndex)?latest.currentPromptIndex:promptOptions.findIndex(prompt=>prompt.id===latest.promptId)
    if(currentPromptIndex<0||currentPromptIndex>=promptOptions.length)currentPromptIndex=Math.max(0,promptOptions.length-1)
    let nextIndex=currentPromptIndex+1,nextCount=refreshCount
    if(nextIndex>=promptOptions.length&&refreshCount<DAILY_REFRESH_LIMIT){
      const shownIds=new Set(promptOptions.map(prompt=>prompt.id))
      let candidates=pool.filter(prompt=>!usedIds.has(prompt.id)&&!shownIds.has(prompt.id))
      if(!candidates.length)candidates=pool.filter(prompt=>!shownIds.has(prompt.id))
      if(!candidates.length)throw new Error('当前启用的题目不足，无法继续刷新')
      const prompt=choosePrompt(candidates,couple._id,day,new Set(),`refresh:${refreshCount+1}:${history.length}`)
      promptOptions.push(prompt);nextIndex=promptOptions.length-1;nextCount=refreshCount+1
    }else if(nextIndex>=promptOptions.length)nextIndex=0
    const prompt=promptOptions[nextIndex]
    await transaction.collection('dailyTasks').doc(id).update({data:{promptId:prompt.id,prompt,promptHistory:promptOptions.map(item=>item.id),promptOptions,currentPromptIndex:nextIndex,refreshCount:nextCount,refreshedAt:db.serverDate()}})
  })
  return taskView(await one('dailyTasks',id),allPrompts(user))
}
async function initialize(openid){return ensureUser(openid)}
async function getCurrentUser(openid){return ensureUser(openid)}
async function updateProfile(openid,event){
  const user=await ensureUser(openid),input=event.input||{},patch={updatedAt:db.serverDate()}
  if(input.nickname!==undefined)patch.nickname=required(input.nickname,'昵称',20)
  if(input.city!==undefined)patch.city=clean(input.city,20)
  if(input.anniversary!==undefined)patch.anniversary=clean(input.anniversary,10)
  if(input.avatar!==undefined)patch.avatar=clean(input.avatar,500)
  if(input.locationVisible!==undefined)patch.locationVisible=Boolean(input.locationVisible)
  if(input.theme!==undefined)patch.theme=clean(input.theme,20)||user.theme
  if(input.onboarded!==undefined)patch.onboarded=Boolean(input.onboarded)
  if(input.profileMode!==undefined)patch.profileMode=input.profileMode==='personal'?'personal':'pair'
  const newAvatar=patch.avatar&&patch.avatar!==user.avatar
  try{
    await checkText(openid,[patch.nickname,patch.city])
    if(newAvatar)await checkImage(patch.avatar)
  }catch(error){if(newAvatar)await deleteCloudFiles([patch.avatar]);throw error}
  await db.collection('users').doc(openid).update({data:patch})
  if(newAvatar)await consumeUpload(openid,patch.avatar).catch(()=>{})
  if(patch.avatar&&user.avatar&&patch.avatar!==user.avatar)await deleteCloudFiles([user.avatar])
  return me(openid)
}
async function createCouple(openid){
  const user=await ensureUser(openid);if(user.coupleId){const existing=await one('couples',user.coupleId);if(existing&&existing.active)return inviteView(existing)}
  const code=await uniqueInviteCode(),expiresAt=new Date(Date.now()+INVITE_TTL)
  const result=await db.collection('couples').add({data:{inviteCode:code,inviteExpiresAt:expiresAt,memberIds:[openid],spaceType:'pair',active:true,createdAt:db.serverDate(),updatedAt:db.serverDate()}})
  await db.collection('users').doc(openid).update({data:{coupleId:result._id,updatedAt:db.serverDate()}});return inviteView(await one('couples',result._id))
}
async function createPersonalSpace(openid){
  const user=await ensureUser(openid)
  if(user.coupleId){const existing=await one('couples',user.coupleId);if(existing&&existing.active)return inviteView(existing)}
  const code=await uniqueInviteCode(),expiresAt=new Date(Date.now()+INVITE_TTL)
  const result=await db.collection('couples').add({data:{inviteCode:code,inviteExpiresAt:expiresAt,memberIds:[openid],personalOwnerId:openid,spaceType:'personal',active:true,createdAt:db.serverDate(),updatedAt:db.serverDate()}})
  await db.collection('users').doc(openid).update({data:{coupleId:result._id,updatedAt:db.serverDate()}})
  return inviteView(await one('couples',result._id))
}
async function findInvite(code){const result=await db.collection('couples').where({inviteCode:clean(code,6).toUpperCase(),active:true}).limit(1).get();if(!result.data.length)throw new Error('邀请码无效');const couple=result.data[0];if(inviteExpiry(couple)<=Date.now())throw new Error('邀请码已过期，请让对方重新生成');return couple}
async function previewInvite(openid,event){const user=await ensureUser(openid),couple=await findInvite(event.code);if(couple.memberIds.length>=2&&!couple.memberIds.includes(openid))throw new Error('这个空间已经满员');const creator=await one('users',couple.memberIds[0]),source=user.coupleId?await one('couples',user.coupleId):null,reunion=reunionFor(source,couple);return {coupleId:couple._id,creator:publicUser(creator||{}),reunionAvailable:Boolean(reunion),archivedAt:reunion&&reunion.archivedAt}}
async function joinCouple(openid,event){
  const user=await ensureUser(openid),couple=await findInvite(event.code)
  const originalSource=user.coupleId?await one('couples',user.coupleId):null,reunion=reunionFor(originalSource,couple)
  let mergeEffectiveDate=''
  if(user.coupleId&&user.coupleId!==couple._id){
    const source=await one('couples',user.coupleId)
    // 兼容旧版本创建的单成员空间：旧数据可能仍标记为 pair，但只要双方空间
    // 都有效且各自只有一名成员，就可以按两个个人空间的流程安全合并。
    const canMerge=source&&source.active&&Array.isArray(source.memberIds)&&source.memberIds.length===1&&couple.active&&Array.isArray(couple.memberIds)&&couple.memberIds.length===1
    if(!canMerge)throw new Error('当前空间无法与该空间合并')
    const [owned,tasks]=await Promise.all([
      db.collection('entries').where({coupleId:source._id,ownerOpenid:openid}).limit(1000).get(),
      db.collection('dailyTasks').where({coupleId:source._id}).limit(1000).get()
    ])
    const taskMap={};tasks.data.forEach(task=>{taskMap[task.dateKey]=task})
    for(const entry of owned.data){
      const id=entryId(couple._id,entry.dateKey,openid)
      const data=Object.assign({},entry,{id,coupleId:couple._id,legacyCoupleId:source._id,taskSnapshot:taskMap[entry.dateKey]||entry.taskSnapshot,updatedAt:db.serverDate()})
      delete data._id
      await db.collection('entries').doc(id).set({data})
      if(entry._id!==id)await db.collection('entries').doc(entry._id).remove()
    }
    await db.collection('couples').doc(source._id).update({data:{memberIds:[],active:false,mergedIntoId:couple._id,mergedAt:db.serverDate(),updatedAt:db.serverDate()}})
    mergeEffectiveDate=nextDay(userDateKey(user))
  }
  if(couple.memberIds.length>=2&&!couple.memberIds.includes(openid))throw new Error('这个空间已经满员')
  if(!couple.memberIds.includes(openid)){const data={memberIds:_.push(openid),spaceType:'pair',pairedAt:db.serverDate(),updatedAt:db.serverDate()};if(mergeEffectiveDate)data.pairingEffectiveDate=mergeEffectiveDate;if(reunion&&event.restoreHistory){const requestedAt=iso();data.historyRestore={id:`restore-${Date.now()}-${openid.slice(-6)}`,relationId:reunion.relationId,archivedAt:reunion.archivedAt,approvals:[openid],noticeUnreadFor:couple.memberIds.filter(id=>id!==openid),status:'pending',requestedAt}}await db.collection('couples').doc(couple._id).update({data})}
  await db.collection('users').doc(openid).update({data:{coupleId:couple._id,updatedAt:db.serverDate()}});return one('couples',couple._id)
}
async function renewInvite(openid){const user=await ensureUser(openid),couple=await requireCouple(user);if(couple.memberIds.length>=2)throw new Error('双人空间已满员，无需生成新邀请码');const inviteCode=await uniqueInviteCode(),inviteExpiresAt=new Date(Date.now()+INVITE_TTL);await db.collection('couples').doc(couple._id).update({data:{inviteCode,inviteExpiresAt,updatedAt:db.serverDate()}});return inviteView(await one('couples',couple._id))}
async function getCouple(openid){const user=await ensureUser(openid);if(!user.coupleId)return null;const couple=await one('couples',user.coupleId);if(!couple||!couple.active||!couple.memberIds.includes(openid))return null;const members=await usersFor(couple.memberIds);return Object.assign(inviteView(couple),{members:members.map(publicUser)})}
async function unbindCouple(openid){
  const user=await ensureUser(openid)
  if(!user.coupleId)return createPersonalSpace(openid)
  const source=await one('couples',user.coupleId)
  if(source&&source.spaceType==='personal')return inviteView(source)

  const inviteCode=await uniqueInviteCode(),inviteExpiresAt=new Date(Date.now()+INVITE_TTL),archivedMemberIds=(source&&source.memberIds||[]).slice(),archivedAt=iso(),archivedRelationId=source&&source.archivedRelationId||source&&source._id||''
  const created=await db.collection('couples').add({data:{inviteCode,inviteExpiresAt,memberIds:[openid],personalOwnerId:openid,spaceType:'personal',active:true,archivedMemberIds,archivedAt,archivedRelationId,createdAt:db.serverDate(),updatedAt:db.serverDate()}})
  const personalId=created._id
  try{
    if(source){
      const [owned,tasks,meetings]=await Promise.all([
        db.collection('entries').where({coupleId:source._id,ownerOpenid:openid}).limit(1000).get(),
        db.collection('dailyTasks').where({coupleId:source._id}).limit(1000).get(),
        db.collection('meetings').where({coupleId:source._id,creatorOpenid:openid}).limit(1000).get()
      ])
      const taskMap={};tasks.data.forEach(task=>{taskMap[task.dateKey]=task})
      for(const entry of owned.data){
        const id=entryId(personalId,entry.dateKey,openid)
        const data=Object.assign({},entry,{id,coupleId:personalId,legacyCoupleId:archivedRelationId,recordMode:'personal',visibility:'private',taskSnapshot:entry.taskSnapshot||taskMap[entry.dateKey]||null,updatedAt:db.serverDate()})
        delete data._id
        await db.collection('entries').doc(id).set({data})
      }
      for(const meeting of meetings.data){
        await db.collection('meetings').doc(meeting._id).update({data:{coupleId:personalId,updatedAt:db.serverDate()}})
      }
      const remaining=(source.memberIds||[]).filter(id=>id!==openid)
      const unbindNotice=remaining.length?{id:`unbind-${Date.now()}-${openid.slice(-6)}`,nickname:user.nickname||'对方',createdAt:iso(),unreadFor:remaining}:null
      await db.collection('couples').doc(source._id).update({data:{memberIds:remaining,active:remaining.length>0,spaceType:remaining.length?'personal':source.spaceType,personalOwnerId:remaining[0]||'',archivedMemberIds,archivedAt,archivedRelationId,unbindNotice,pairingEffectiveDate:_.remove(),pairedAt:_.remove(),historyRestore:_.remove(),updatedAt:db.serverDate()}})
      if(remaining.length){
        const retained=await db.collection('entries').where({coupleId:source._id,ownerOpenid:remaining[0]}).limit(1000).get()
        for(const entry of retained.data)await db.collection('entries').doc(entry._id).update({data:{legacyCoupleId:archivedRelationId,recordMode:'personal',visibility:'private',updatedAt:db.serverDate()}})
        await db.collection('users').doc(remaining[0]).update({data:{profileMode:'personal',updatedAt:db.serverDate()}})
      }
    }
    await db.collection('users').doc(openid).update({data:{coupleId:personalId,profileMode:'personal',updatedAt:db.serverDate()}})
    if(source){
      const oldEntries=await db.collection('entries').where({coupleId:source._id,ownerOpenid:openid}).limit(1000).get()
      for(const entry of oldEntries.data)await db.collection('entries').doc(entry._id).remove()
    }
    return inviteView(await one('couples',personalId))
  }catch(error){
    throw error
  }
}
async function respondHistoryRestore(openid,event){
  const user=await ensureUser(openid),couple=await requireCouple(user),request=couple.historyRestore
  if(!request||request.status!=='pending')throw new Error('当前没有等待确认的历史恢复申请')
  if(event.accept===false){const historyRestore=Object.assign({},request,{status:'declined',declinedBy:openid,decidedAt:iso()});await db.collection('couples').doc(couple._id).update({data:{historyRestore,updatedAt:db.serverDate()}});return historyRestore}
  const approvals=Array.from(new Set((request.approvals||[]).concat(openid)))
  if(!couple.memberIds.every(id=>approvals.includes(id))){const historyRestore=Object.assign({},request,{approvals});await db.collection('couples').doc(couple._id).update({data:{historyRestore,updatedAt:db.serverDate()}});return historyRestore}
  const result=await db.collection('entries').where({coupleId:couple._id,legacyCoupleId:request.relationId}).limit(1000).get(),grouped={}
  result.data.forEach(entry=>{(grouped[entry.dateKey]||(grouped[entry.dateKey]=[])).push(entry)})
  for(const items of Object.values(grouped))if(couple.memberIds.every(id=>items.some(item=>item.ownerOpenid===id)))for(const entry of items)await db.collection('entries').doc(entry._id).update({data:{recordMode:'pair',visibility:'shared',updatedAt:db.serverDate()}})
  const historyRestore=Object.assign({},request,{approvals,status:'restored',restoredAt:iso()})
  await db.collection('couples').doc(couple._id).update({data:{historyRestore,updatedAt:db.serverDate()}})
  return historyRestore
}
async function getTodayTask(openid,event){const user=await ensureUser(openid),couple=await requireCouple(user);return currentTask(user,couple,(event.args&&event.args[0])||userDateKey(user))}
async function getTodayStatus(openid,event){const user=await ensureUser(openid),couple=await requireCouple(user);return status(user,couple,(event.args&&event.args[0])||userDateKey(user))}
async function getHomeSnapshot(openid){
  const user=await ensureUser(openid)
  if(!user.onboarded||!user.coupleId)return {user,couple:null,task:null,status:null}
  const storedCouple=await one('couples',user.coupleId)
  if(!storedCouple||!storedCouple.active||!storedCouple.memberIds.includes(openid))return {user,couple:null,task:null,status:null}
  const day=userDateKey(user)
  const [members,task,todayStatus]=await Promise.all([
    usersFor(storedCouple.memberIds),
    currentTask(user,storedCouple,day),
    status(user,storedCouple,day)
  ])
  const couple=Object.assign(inviteView(storedCouple),{members:members.map(publicUser)})
  const notice=storedCouple.unbindNotice
  const pendingNotice=notice&&Array.isArray(notice.unreadFor)&&notice.unreadFor.includes(openid)?{id:notice.id,type:'partner-unbound',nickname:notice.nickname||'对方'}:null
  const restore=storedCouple.historyRestore
  const pendingRestoreNotice=restore&&restore.status==='pending'&&!(restore.approvals||[]).includes(openid)&&(restore.noticeUnreadFor||[]).includes(openid)?{id:restore.id||`restore-${restore.requestedAt}`,type:'history-restore'}:null
  return {user,couple,task:todayStatus.myEntry&&todayStatus.myEntry.taskSnapshot?todayStatus.myEntry.taskSnapshot:task,status:todayStatus,pendingNotice,pendingRestoreNotice}
}
async function acknowledgeNotice(openid,event){
  const user=await ensureUser(openid),couple=await requireCouple(user),notice=couple.unbindNotice
  if(!notice||notice.id!==clean(event.id,100))return true
  const unreadFor=(notice.unreadFor||[]).filter(id=>id!==openid)
  await db.collection('couples').doc(couple._id).update({data:{'unbindNotice.unreadFor':unreadFor,updatedAt:db.serverDate()}})
  return true
}
async function acknowledgeHistoryRestoreNotice(openid,event){const user=await ensureUser(openid),couple=await requireCouple(user),restore=couple.historyRestore;if(!restore||restore.status!=='pending'||(restore.id||`restore-${restore.requestedAt}`)!==clean(event.id,100))return true;const unreadFor=(restore.noticeUnreadFor||[]).filter(id=>id!==openid);await db.collection('couples').doc(couple._id).update({data:{'historyRestore.noticeUnreadFor':unreadFor,updatedAt:db.serverDate()}});return true}
async function saveEntry(openid,event,isUpdate){
  const user=await ensureUser(openid),couple=await requireCouple(user),input=event.input||{},day=input.dateKey||userDateKey(user),id=entryId(couple._id,day,openid),existing=await one('entries',id)
  if(!isUpdate&&existing&&!existing.deleted)throw new Error('今天已经提交过，可使用修改功能')
  if(isUpdate&&!existing)throw new Error('记录不存在')
  const imagePath=clean(input.imagePath||(existing&&existing.imagePath),500);if(!imagePath)throw new Error('请选择一张照片')
  const personal=personalOn(couple,day)
  const selectedTask=await currentTask(user,couple,day),expectedPromptId=clean(input.promptId,100)
  if(expectedPromptId&&selectedTask.promptId!==expectedPromptId)throw new Error('题目刚刚被对方更换，请确认新题目后再提交')
  const taskSnapshot={dateKey:day,promptId:selectedTask.promptId,prompt:selectedTask.prompt}
  const data={id,coupleId:couple._id,ownerOpenid:openid,userId:openid,dateKey:day,imagePath,caption:clean(input.caption,100),city:user.city||'',recordMode:personal?'personal':'pair',visibility:personal?'private':'couple',taskSnapshot,deleted:false,deletedAt:'',updatedAt:db.serverDate()}
  const newImage=!existing||imagePath!==existing.imagePath
  try{
    await checkText(openid,[data.caption])
    if(newImage)await checkImage(imagePath)
    const latestTask=await currentTask(user,couple,day)
    if(latestTask.promptId!==taskSnapshot.promptId)throw new Error('题目刚刚被对方更换，请确认新题目后再提交')
  }catch(error){if(newImage)await deleteCloudFiles([imagePath]);throw error}
  if(input.backfill||(existing&&existing.deleted))data.backfilledAt=db.serverDate()
  if(existing){
    await db.collection('entries').doc(id).update({data})
    if(existing.imagePath&&existing.imagePath!==imagePath)await deleteCloudFiles([existing.imagePath])
  }
  else await db.collection('entries').add({data:Object.assign({_id:id,submittedAt:db.serverDate()},data)})
  if(newImage)await consumeUpload(openid,imagePath).catch(()=>{})
  return status(user,couple,day)
}
async function deleteEntry(openid,event){const user=await ensureUser(openid),couple=await requireCouple(user),day=event.dateKey||userDateKey(user),id=entryId(couple._id,day,openid),entry=await one('entries',id);if(entry){await db.collection('entries').doc(id).remove();if(entry.imagePath)await deleteCloudFiles([entry.imagePath])}return true}
async function unlockToday(openid,event){const result=await getTodayStatus(openid,event);if(!result.unlocked)throw new Error('双方都提交后才能解锁');return result}
async function getMemory(openid,event){
  const user=await ensureUser(openid),couple=await requireCouple(user),day=(event.args&&event.args[0])||userDateKey(user),s=await status(user,couple,day)
  if(!s.unlocked)throw new Error('这一天尚未完成')
  const fallbackTask=await currentTask(user,couple,day)
  if(s.mode==='personal'||s.mode==='pairPending'){const task=s.myEntry&&s.myEntry.taskSnapshot||fallbackTask;return {dateKey:day,task,entries:s.myEntry?[s.myEntry]:[],users:s.myEntry?[publicUser(user)]:[],distance:null,mode:'personal',canDeleteOwn:Boolean(s.myEntry),shareText:'今天，也被我认真收藏了。'}}
  if(s.mode==='sharedPersonal'){
    const entries=[],users=[],entryTasks=[]
    if(s.myEntry){entries.push(s.myEntry);users.push(publicUser(user));entryTasks.push(s.myEntry.taskSnapshot||fallbackTask)}
    if(s.partnerEntry){entries.push(s.partnerEntry);users.push(s.partner);entryTasks.push(s.partnerEntry.taskSnapshot||fallbackTask)}
    const promptTexts=entryTasks.map(item=>String(item&&item.prompt&&item.prompt.text||'').trim().replace(/\s+/g,' '))
    const samePrompt=promptTexts.length===2&&Boolean(promptTexts[0])&&promptTexts[0]===promptTexts[1]
    return {dateKey:day,task:entryTasks[0]||fallbackTask,entryTasks,entries,users,distance:null,mode:samePrompt?'pair':'sharedPersonal',restoredHistorical:true,canDeleteOwn:Boolean(s.myEntry),shareText:samePrompt?'我们共同记住了这一天。':'我们看见了彼此曾经走过的这一天。'}
  }
  return {dateKey:day,task:fallbackTask,entries:[s.myEntry,s.partnerEntry],users:[publicUser(user),s.partner],distance:null,mode:'pair',canDeleteOwn:true,shareText:'我们共同记住了这一天。'}
}
async function allEntries(couple,prefix,openid,currentDay){const entries=(await db.collection('entries').where({coupleId:couple._id,dateKey:db.RegExp({regexp:`^${prefix}`,options:''}),deleted:_.neq(true)}).limit(1000).get()).data,owners=await usersFor(couple.memberIds),shareMap={};owners.forEach(owner=>{shareMap[owner._id]=Boolean(settingsOf(owner).sharePrePairRecords)});const active=Boolean(couple.pairingEffectiveDate&&currentDay>=couple.pairingEffectiveDate);return entries.filter(entry=>entry.visibility!=='private'||entry.ownerOpenid===openid||(active&&entry.dateKey<couple.pairingEffectiveDate&&shareMap[entry.ownerOpenid]))}
function dayStates(entries){const states={};entries.forEach(e=>{const state=states[e.dateKey]||(states[e.dateKey]={count:0,personal:false});state.count+=1;if(e.recordMode==='personal'||e.visibility==='private')state.personal=true});return states}
function bestStreak(days){let best=0,current=0,previous='';days.sort().forEach(day=>{const d=new Date(`${day}T12:00:00`);if(previous){const p=new Date(`${previous}T12:00:00`);current=(d-p===86400000)?current+1:1}else current=1;best=Math.max(best,current);previous=day});return best}
async function getCalendar(openid,event){const user=await ensureUser(openid),couple=await requireCouple(user),currentDate=userDateKey(user),prefix=(event.args&&event.args[0])||monthKey(currentDate),states=dayStates(await allEntries(couple,prefix,openid,currentDate));return Object.keys(states).map(day=>({dateKey:day,status:states[day].personal||states[day].count>=2?'complete':'waiting'}))}
async function getCalendarYear(openid,event){const user=await ensureUser(openid),couple=await requireCouple(user),currentDate=userDateKey(user),year=String((event.args&&event.args[0])||currentDate.slice(0,4));if(!/^\d{4}$/.test(year))throw new Error('年份格式无效');const states=dayStates(await allEntries(couple,year,openid,currentDate)),days=Object.keys(states).sort().map(day=>({dateKey:day,status:states[day].personal||states[day].count>=2?'complete':'waiting'})),complete=days.filter(d=>d.status==='complete').map(d=>d.dateKey);return {year:Number(year),currentDate,days,summary:{complete:complete.length,waiting:days.length-complete.length,bestStreak:bestStreak(complete)}}}
async function getStatistics(openid){const user=await ensureUser(openid),year=await getCalendarYear(openid,{args:[userDateKey(user).slice(0,4)]});return {totalTogether:year.summary.complete,bestStreak:year.summary.bestStreak,currentStreak:0}}
async function getCities(openid){const couple=await getCouple(openid);if(!couple)throw new Error('请先创建或加入双人空间');return {users:couple.members,distance:null}}
async function getPrompts(openid){const user=await ensureUser(openid);return DEFAULT_PROMPTS.concat(user.customPrompts||[])}
async function getPromptOverview(openid){const user=await ensureUser(openid),settings=settingsOf(user),custom=user.customPrompts||[],customCategories=settings.customCategories||[],names=DEFAULT_CATEGORIES.concat(customCategories),last=timeOf(user.lastCustomPromptAt),next=last+CUSTOM_PROMPT_TTL,canAddPrompt=!last||next<=Date.now();return {categories:names.map(name=>({name,enabled:(settings.enabledCategories||REQUIRED).includes(name),required:REQUIRED.includes(name),isCustom:customCategories.includes(name),count:DEFAULT_PROMPTS.filter(p=>p.enabled!==false).concat(custom).filter(p=>p.category===name).length})),customPrompts:custom,canAddCategory:customCategories.length<CUSTOM_CATEGORY_LIMIT,customCategoryLimit:CUSTOM_CATEGORY_LIMIT,canAddPrompt,nextPromptDate:canAddPrompt?'':new Date(next).toISOString().slice(0,10)}}
async function updateUserSettings(openid,mutate){const user=await ensureUser(openid),settings=settingsOf(user);await mutate(settings,user);await db.collection('users').doc(openid).update({data:{settings,customPrompts:user.customPrompts||[],lastCustomPromptAt:user.lastCustomPromptAt||'',updatedAt:db.serverDate()}});return getPromptOverview(openid)}
async function togglePromptCategory(openid,event){return updateUserSettings(openid,settings=>{if(REQUIRED.includes(event.name)&&!event.enabled)throw new Error(`${event.name}是固定开启的基础大类`);settings.enabledCategories=(settings.enabledCategories||REQUIRED).filter(n=>n!==event.name);if(event.enabled)settings.enabledCategories.push(event.name)})}
async function addCustomCategory(openid,event){return updateUserSettings(openid,async settings=>{const name=required(event.name,'大类名称',12),custom=settings.customCategories||[];if(custom.length>=CUSTOM_CATEGORY_LIMIT)throw new Error('最多只能添加 3 个自定义大类');if(DEFAULT_CATEGORIES.concat(custom).includes(name))throw new Error('这个大类已经存在');await checkText(openid,[name]);settings.customCategories=custom.concat(name);settings.enabledCategories=(settings.enabledCategories||REQUIRED).concat(name)})}
async function deleteCustomCategory(openid,event){return updateUserSettings(openid,(settings,user)=>{if(!(settings.customCategories||[]).includes(event.name))throw new Error('内置大类不能删除');if((user.customPrompts||[]).some(p=>p.category===event.name))throw new Error('请先删除该大类中的自定义题目');settings.customCategories=settings.customCategories.filter(n=>n!==event.name);settings.enabledCategories=settings.enabledCategories.filter(n=>n!==event.name)})}
async function addCustomPrompt(openid,event){return updateUserSettings(openid,async (settings,user)=>{const last=timeOf(user.lastCustomPromptAt);if(last&&last+CUSTOM_PROMPT_TTL>Date.now())throw new Error(`每 7 天只能添加一道问题，下次可添加：${new Date(last+CUSTOM_PROMPT_TTL).toISOString().slice(0,10)}`);const input=event.input||{},category=input.category||REQUIRED[0],createdAt=iso(),text=required(input.text,'题目',80);if(!DEFAULT_CATEGORIES.concat(settings.customCategories||[]).includes(category))throw new Error('请选择有效的大类');await checkText(openid,[text]);user.customPrompts=(user.customPrompts||[]).concat({id:`custom-${Date.now()}`,text,category,enabled:true,isCustom:true,createdAt});user.lastCustomPromptAt=createdAt})}
async function updateCustomPrompt(openid,event){return updateUserSettings(openid,async (settings,user)=>{const prompt=(user.customPrompts||[]).find(p=>p.id===event.id);if(!prompt)throw new Error('题目不存在');const input=event.input||{};if(input.text!==undefined){const text=required(input.text,'题目',80);await checkText(openid,[text]);prompt.text=text}if(input.category!==undefined)prompt.category=input.category;if(input.enabled!==undefined)prompt.enabled=Boolean(input.enabled)})}
async function deleteCustomPrompt(openid,event){return updateUserSettings(openid,(settings,user)=>{if(!(user.customPrompts||[]).some(p=>p.id===event.id))throw new Error('题目不存在');user.customPrompts=user.customPrompts.filter(p=>p.id!==event.id)})}
async function deleteAllCustomPrompts(openid){return updateUserSettings(openid,(settings,user)=>{user.customPrompts=[]})}
async function restoreDefaultPrompts(openid){return getPromptOverview(openid)}
async function getSettings(openid){return settingsOf(await ensureUser(openid))}
async function updateSettings(openid,event){const user=await ensureUser(openid),settings=Object.assign(settingsOf(user),event.input||{});if(!ENABLE_DEBUG_TOOLS)delete settings.mockDate;else settings.mockDate=clean(settings.mockDate,10);await db.collection('users').doc(openid).update({data:{settings,updatedAt:db.serverDate()}});return settings}
async function addMeeting(openid,event){const user=await ensureUser(openid),couple=await requireCouple(user),input=event.input||{},data={id:'',coupleId:couple._id,date:required(input.date,'日期',10),city:required(input.city,'城市',30),note:clean(input.note,100),creatorOpenid:openid,createdAt:db.serverDate()};await checkText(openid,[data.city,data.note]);const result=await db.collection('meetings').add({data});await db.collection('meetings').doc(result._id).update({data:{id:result._id}});return Object.assign(data,{_id:result._id,id:result._id})}
async function getMeetings(openid){const user=await ensureUser(openid),couple=await requireCouple(user);return (await db.collection('meetings').where({coupleId:couple._id}).orderBy('date','desc').limit(100).get()).data}
async function deleteMeeting(openid,event){const user=await ensureUser(openid),couple=await requireCouple(user),meeting=await one('meetings',event.id);if(!meeting||meeting.coupleId!==couple._id)throw new Error('相遇记录不存在');await db.collection('meetings').doc(event.id).remove();return true}
function reminderId(openid,day){return `${openid}_${day}`}
const DAILY_REMINDER_TIME='20:00'
const DAILY_REMINDER_OFFSET=-480
function reminderTime(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('提醒日期无效')
  const [year,month,date]=day.split('-').map(Number),[hour,minute]=DAILY_REMINDER_TIME.split(':').map(Number)
  return new Date(Date.UTC(year,month-1,date,hour,minute)+DAILY_REMINDER_OFFSET*60000)
}
async function scheduleReminder(openid,event){
  const user=await ensureUser(openid);await requireCouple(user)
  if(user.deletionRequestedAt)throw new Error('账户正在等待删除，暂时不能预约提醒')
  const input=event.input||{},day=clean(input.dateKey,10),time=DAILY_REMINDER_TIME
  const remindAt=reminderTime(day)
  if(remindAt.getTime()<=Date.now()+60000)throw new Error('提醒时间必须晚于当前时间')
  const id=reminderId(openid,day),data={openid,dateKey:day,time,timezoneOffset:DAILY_REMINDER_OFFSET,displayTime:`${day} ${time}`,remindAt,status:'pending',updatedAt:db.serverDate()}
  const existing=await one('reminders',id)
  if(existing){if(existing.status==='pending')return {dateKey:day,time,status:'pending',displayTime:data.displayTime};throw new Error('每天最多预约一次提醒')}
  await db.collection('reminders').add({data:Object.assign({_id:id,createdAt:db.serverDate()},data)})
  return {dateKey:day,time,status:'pending',displayTime:data.displayTime}
}
async function getReminder(openid,event){const day=clean(event.dateKey||(event.args&&event.args[0]),10);const reminder=day?await one('reminders',reminderId(openid,day)):null;if(!reminder)return null;return {dateKey:reminder.dateKey,time:reminder.time,status:reminder.status,displayTime:reminder.displayTime}}
async function cancelReminder(openid,event){const day=clean(event.dateKey,10),id=reminderId(openid,day),reminder=await one('reminders',id);if(reminder&&reminder.status==='pending')await db.collection('reminders').doc(id).update({data:{status:'cancelled',reason:'user-cancelled',updatedAt:db.serverDate()}});return true}
async function exportUserData(openid){const user=await ensureUser(openid),couple=user.coupleId?await one('couples',user.coupleId):null,entryResult=await db.collection('entries').where({ownerOpenid:openid}).limit(1000).get(),meetingResult=await db.collection('meetings').where({creatorOpenid:openid}).limit(1000).get();return {schemaVersion:1,user,couple:couple?{id:couple._id}:null,entries:entryResult.data,meetings:meetingResult.data,exportedAt:iso()}}
async function importUserData(openid,event){
  const input=event.input
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('备份格式无效')
  if(Number(input.schemaVersion||0)>1)throw new Error('备份来自更高版本，请先升级小程序')
  const current=await ensureUser(openid),source=input.user||{},settings=settingsOf(source)
  settings.customCategories=(settings.customCategories||[]).map(value=>clean(value,12)).filter(Boolean).slice(0,CUSTOM_CATEGORY_LIMIT)
  settings.enabledCategories=(settings.enabledCategories||REQUIRED).filter(name=>DEFAULT_CATEGORIES.concat(settings.customCategories).includes(name))
  REQUIRED.forEach(name=>{if(!settings.enabledCategories.includes(name))settings.enabledCategories.push(name)})
  const customPrompts=(source.customPrompts||[]).slice(0,200).map((prompt,index)=>({id:clean(prompt.id,80)||`custom-import-${Date.now()}-${index}`,text:required(prompt.text,'题目',80),category:DEFAULT_CATEGORIES.concat(settings.customCategories).includes(prompt.category)?prompt.category:REQUIRED[0],enabled:true,isCustom:true,createdAt:clean(prompt.createdAt,40)||iso()}))
  await db.collection('users').doc(openid).update({data:{nickname:clean(source.nickname,20)||current.nickname||'',avatar:clean(source.avatar,500)||current.avatar||'',city:clean(source.city,20),anniversary:clean(source.anniversary,10),locationVisible:source.locationVisible!==false,theme:['minimal','warm','calm','blue'].includes(source.theme)?source.theme:current.theme,settings,customPrompts,lastCustomPromptAt:clean(source.lastCustomPromptAt,40),updatedAt:db.serverDate()}})
  let entryCount=0,meetingCount=0
  if(current.coupleId){
    const sourceOwner=source._id||source.id||openid
    const entries=Array.isArray(input.entries)?input.entries:[]
    for(const entry of entries.slice(0,1000)){
      if(!entry||!entry.dateKey||![sourceOwner,openid].includes(entry.ownerOpenid||entry.userId))continue
      const imagePath=clean(entry.imagePath,600)
      if(!imagePath||imagePath.startsWith('data:'))continue
      const id=entryId(current.coupleId,clean(entry.dateKey,10),openid)
      await db.collection('entries').doc(id).set({data:{id,coupleId:current.coupleId,ownerOpenid:openid,userId:openid,dateKey:clean(entry.dateKey,10),imagePath,caption:clean(entry.caption,100),city:clean(entry.city,20),deleted:false,submittedAt:clean(entry.submittedAt,40)||iso(),updatedAt:db.serverDate()}})
      entryCount+=1
    }
    const meetings=Array.isArray(input.meetings)?input.meetings:[]
    for(const meeting of meetings.slice(0,200)){
      if(!meeting||!meeting.date||![sourceOwner,openid].includes(meeting.creatorOpenid||sourceOwner))continue
      const data={coupleId:current.coupleId,date:clean(meeting.date,10),city:clean(meeting.city,30),note:clean(meeting.note,100),creatorOpenid:openid,createdAt:clean(meeting.createdAt,40)||iso()}
      const existing=await db.collection('meetings').where({coupleId:data.coupleId,creatorOpenid:openid,date:data.date,city:data.city,note:data.note}).limit(1).get()
      if(!existing.data.length){const result=await db.collection('meetings').add({data});await db.collection('meetings').doc(result._id).update({data:{id:result._id}});meetingCount+=1}
    }
  }
  return {users:1,entries:entryCount,prompts:customPrompts.length,meetings:meetingCount}
}
async function clearLocalData(openid){const user=await ensureUser(openid);const requestedAt=new Date();await db.collection('users').doc(openid).update({data:{deletionRequestedAt:requestedAt,updatedAt:db.serverDate()}});return Object.assign({},user,{deletionRequestedAt:requestedAt.toISOString()})}
async function restoreLocalData(openid){const user=await me(openid);if(!user||!user.deletionRequestedAt)throw new Error('没有等待恢复的数据');const requestedAt=timeOf(user.deletionRequestedAt);if(!requestedAt||Date.now()-requestedAt>=DELETE_UNDO_TTL)throw new Error('恢复期限已过，数据已进入永久删除流程');await db.collection('users').doc(openid).update({data:{deletionRequestedAt:'',updatedAt:db.serverDate()}});return Object.assign({},user,{deletionRequestedAt:''})}
async function debugPermanentDelete(openid){if(!ENABLE_DEBUG_TOOLS)throw new Error('仅测试版本支持立即永久删除');const user=await me(openid);if(user)await purgeUserData(openid,user,true);return {deleted:true}}

const handlers={initialize,getCurrentUser,getHomeSnapshot,acknowledgeNotice,acknowledgeHistoryRestoreNotice,registerUpload,updateProfile,createCouple,createPersonalSpace,previewInvite,joinCouple,renewInvite,getCouple,unbindCouple,respondHistoryRestore,getTodayTask,refreshTodayTask,getTodayStatus,submitEntry:(o,e)=>saveEntry(o,e,false),updateEntry:(o,e)=>saveEntry(o,e,true),deleteEntry,unlockToday,getMemory,getCalendar,getCalendarYear,getStatistics,getCities,getPrompts,getPromptOverview,togglePromptCategory,addCustomCategory,deleteCustomCategory,addCustomPrompt,updateCustomPrompt,deleteCustomPrompt,deleteAllCustomPrompts,restoreDefaultPrompts,getSettings,updateSettings,addMeeting,getMeetings,deleteMeeting,scheduleReminder,getReminder,cancelReminder,clearLocalData,restoreLocalData,debugPermanentDelete}

exports.main=async(event)=>{
  try{const openid=cloud.getWXContext().OPENID;if(!openid)throw new Error('无法识别当前微信用户');const handler=handlers[event.action];if(!handler)throw new Error('不支持的云端操作');return {ok:true,data:await handler(openid,event||{})}}
  catch(error){
    console.error('[ourDaybookApi]',{
      action:clean(event&&event.action,50)||'unknown',
      name:clean(error&&error.name,80)||'Error',
      message:clean(error&&error.message,300)||'cloud operation failed'
    })
    return {ok:false,message:error&&error.message?error.message:'云端操作失败'}
  }
}
