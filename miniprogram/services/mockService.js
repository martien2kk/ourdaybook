const storage = require('./storageAdapter')
const config = require('../config/config')
const prompts = require('../data/default-prompts')
const demo = require('../data/demo-data')
const { migrate } = require('../utils/migration')
const { toDateKey, monthKey } = require('../utils/date')
const { hash, createId, inviteCode } = require('../utils/id')
const { cleanText, requireText } = require('../utils/validator')
const { publicProfile } = require('../utils/privacy')
const { between } = require('../utils/distance')
const { calculate } = require('../utils/statistics')
const REQUIRED_CATEGORIES = ['日常','所见','心情']
const OPTIONAL_CATEGORIES = ['截图','回忆','创意','思念']
const DEFAULT_CATEGORIES = REQUIRED_CATEGORIES.concat(OPTIONAL_CATEGORIES)
const unlimitedPromptRefresh=()=>config.APP_MODE==='mock'&&config.ENABLE_UNLIMITED_PROMPT_REFRESH===true
const CUSTOM_CATEGORY_LIMIT=3
const CUSTOM_PROMPT_TTL=7*24*60*60*1000
const DELETE_UNDO_TTL=24*60*60*1000
const INVITE_TTL=7*24*60*60*1000
const CATEGORY_MIGRATION={天空:'所见',街景:'所见',趣味:'所见',食物:'日常',穿搭:'日常',心情:'心情',截图:'截图',我们:'回忆'}

let state
function clone(value) { return JSON.parse(JSON.stringify(value)) }
function seed() {
  return {
    schemaVersion:config.STORAGE_SCHEMA_VERSION, currentUserId:'A', users:clone(demo.users),
    couples:{}, tasks:{}, entries:{}, prompts:clone(prompts), meetings:[],
    settings:{ mockDate:'', cardTheme:config.DEFAULT_CARD_THEME, appTheme:'minimal', reminders:false,enabledCategories:clone(DEFAULT_CATEGORIES),customCategories:[],promptTaxonomyVersion:8 }
  }
}
function save() { storage.set(state); return state }
function user() { return state.users[state.currentUserId] }
function coupleFor(me) { return me.coupleId ? state.couples[me.coupleId] : null }
function key(coupleId, dateKey) { return `${coupleId}:${dateKey}` }
function entryKey(coupleId, dateKey, userId) { return `${coupleId}:${dateKey}:${userId}` }
function inviteView(couple){const expires=new Date(couple.inviteExpiresAt||new Date(new Date(couple.createdAt).getTime()+INVITE_TTL).toISOString()).getTime();return Object.assign(clone(couple),{inviteExpired:expires<=Date.now(),inviteExpiresAt:new Date(expires).toISOString(),inviteExpiresOn:new Date(expires).toISOString().slice(0,10)})}
function today() { return state.settings.mockDate || toDateKey() }
function nextDay(day){const value=new Date(`${day}T12:00:00`);value.setDate(value.getDate()+1);return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`}
function personalOn(couple,day){return couple.spaceType==='personal'||Boolean(couple.pairingEffectiveDate&&day<couple.pairingEffectiveDate)}
function longestStreak(days){let best=0,run=0,previous='';days.slice().sort().forEach(day=>{const current=new Date(`${day}T12:00:00`),prior=previous&&new Date(`${previous}T12:00:00`);run=prior&&current-prior===86400000?run+1:1;best=Math.max(best,run);previous=day});return best}
function migratePromptTaxonomy(target) {
  if(Number(target.settings.promptTaxonomyVersion||0)>=8)return target
  const previous=target.settings.enabledCategories || []
  const migrated=previous.map(category=>CATEGORY_MIGRATION[category]||category)
  target.settings.enabledCategories=Array.from(new Set(migrated.concat(DEFAULT_CATEGORIES)))
  target.settings.promptTaxonomyVersion=8
  Object.entries(target.tasks || {}).forEach(([taskKey,task])=>{
    const used=Object.values(target.entries || {}).some(entry=>entry.coupleId===task.coupleId&&entry.dateKey===task.dateKey)
    if(!used)delete target.tasks[taskKey]
  })
  ;(target.prompts || []).filter(prompt=>prompt.isCustom).forEach(prompt=>{
    prompt.category=CATEGORY_MIGRATION[prompt.category]||prompt.category
  })
  return target
}
function requireCouple() {
  const couple = coupleFor(user())
  if (!couple) throw new Error('请先创建或加入双人空间')
  return couple
}
function members(couple) { return couple.memberIds.map(id => state.users[id]).filter(Boolean) }
function sameMemberSet(left,right){return Array.isArray(left)&&Array.isArray(right)&&left.length===2&&right.length===2&&left.slice().sort().join('|')===right.slice().sort().join('|')}
function reunionFor(source,target){return source&&target&&sameMemberSet(source.archivedMemberIds,target.archivedMemberIds)?{relationId:source.archivedRelationId||target.archivedRelationId,archivedAt:source.archivedAt||target.archivedAt}:null}
function statusFor(dateKey) {
  const me = user(); const couple = requireCouple()
  const deletedMine = state.entries[entryKey(couple.id,dateKey,me.id)] || null
  const mine = deletedMine && !deletedMine.deleted ? deletedMine : null
  const partnerId = couple.memberIds.find(id => id !== me.id)
  const partner = partnerId ? state.users[partnerId] : null
  const storedTheirs = partnerId ? state.entries[entryKey(couple.id,dateKey,partnerId)] || null : null
  const sharingActive=Boolean(couple.pairingEffectiveDate&&today()>=couple.pairingEffectiveDate&&dateKey<couple.pairingEffectiveDate)
  const partnerShares=Boolean(partner&&partner.settings&&partner.settings.sharePrePairRecords)
  const theirs = storedTheirs && !storedTheirs.deleted && (storedTheirs.visibility!=='private'||(sharingActive&&partnerShares)) ? storedTheirs : null
  const personal=Boolean(mine&&(mine.recordMode==='personal'||mine.visibility==='private'))
  const sharedHistorical=Boolean(theirs&&theirs.visibility==='private')
  const restoredPair=Boolean(mine&&theirs&&mine.recordMode==='pair'&&theirs.recordMode==='pair')
  const pairPending=Boolean(couple.spaceType==='pair'&&couple.pairingEffectiveDate&&dateKey<couple.pairingEffectiveDate&&!restoredPair)
  const personalSpace=personalOn(couple,dateKey)&&!restoredPair
  const unlocked = Boolean(personal||sharedHistorical||(mine && theirs))
  const visiblePartnerEntry=unlocked ? clone(theirs) : null
  if(visiblePartnerEntry && partner && partner.locationVisible===false)visiblePartnerEntry.city='未公开'
  return {
    dateKey, hasSubmitted:Boolean(mine), partnerSubmitted:Boolean(theirs), unlocked,mode:sharedHistorical?'sharedPersonal':pairPending?'pairPending':personal||personalSpace?'personal':'pair',spaceType:personalSpace?'personal':'pair',
    myEntry:mine ? clone(mine) : null,
    partner:partner ? publicProfile(partner) : null,
    partnerEntry:visiblePartnerEntry
  }
}
async function initialize() {
  const stored = storage.get()
  state = stored ? migrate(stored, config.STORAGE_SCHEMA_VERSION) : seed()
  const firstMockUser=state.users&&state.users.A
  if(firstMockUser&&!firstMockUser.onboarded&&firstMockUser.nickname==='小日')firstMockUser.nickname=''
  migratePromptTaxonomy(state)
  const customPrompts=(state.prompts || []).filter(prompt=>prompt.isCustom)
  state.prompts=clone(prompts).concat(customPrompts)
  save()
  return clone(state)
}
async function getCurrentUser() { return clone(user()) }
async function switchMockUser(userId) {
  if (!config.ENABLE_MOCK_SWITCHER) throw new Error('当前配置已关闭模拟用户切换')
  state.currentUserId = userId || (state.currentUserId === 'A' ? 'B' : 'A')
  save(); return getCurrentUser()
}
async function updateProfile(input) {
  const me = user()
  Object.assign(me, {
    nickname:requireText(input.nickname === undefined ? me.nickname : input.nickname,'昵称',20),
    city:cleanText(input.city === undefined ? me.city : input.city,20),
    anniversary:input.anniversary === undefined ? me.anniversary : cleanText(input.anniversary,10),
    avatar:input.avatar === undefined ? me.avatar : String(input.avatar || ''),
    locationVisible:input.locationVisible === undefined ? me.locationVisible : Boolean(input.locationVisible),
    theme:input.theme || me.theme, onboarded:input.onboarded === undefined ? me.onboarded : Boolean(input.onboarded),profileMode:input.profileMode===undefined?(me.profileMode||'pair'):(input.profileMode==='personal'?'personal':'pair')
  })
  save(); return clone(me)
}
async function createCouple() {
  const me = user()
  if (me.coupleId) return clone(state.couples[me.coupleId])
  let code
  do { code = inviteCode(config.INVITE_CODE_LENGTH) } while (Object.values(state.couples).some(c => c.inviteCode === code))
  const couple = { id:createId('couple'),inviteCode:code,inviteExpiresAt:new Date(Date.now()+INVITE_TTL).toISOString(),memberIds:[me.id],spaceType:'pair',createdAt:new Date().toISOString(),active:true }
  state.couples[couple.id] = couple; me.coupleId = couple.id; save()
  return clone(couple)
}
async function createPersonalSpace(){
  const me=user()
  if(me.coupleId)return clone(state.couples[me.coupleId])
  let code
  do{code=inviteCode(config.INVITE_CODE_LENGTH)}while(Object.values(state.couples).some(c=>c.inviteCode===code))
  const couple={id:createId('couple'),inviteCode:code,inviteExpiresAt:new Date(Date.now()+INVITE_TTL).toISOString(),memberIds:[me.id],personalOwnerId:me.id,spaceType:'personal',createdAt:new Date().toISOString(),active:true}
  state.couples[couple.id]=couple;me.coupleId=couple.id;save();return clone(couple)
}
async function previewInvite(code) {
  const couple = Object.values(state.couples).find(c => c.inviteCode === String(code || '').toUpperCase() && c.active)
  if (!couple) throw new Error('邀请码无效')
  if(inviteView(couple).inviteExpired)throw new Error('邀请码已过期，请让对方重新生成')
  if (couple.memberIds.length >= 2 && !couple.memberIds.includes(user().id)) throw new Error('这个空间已经满员')
  const source=coupleFor(user()),reunion=reunionFor(source,couple)
  return { coupleId:couple.id, creator:publicProfile(state.users[couple.memberIds[0]]),reunionAvailable:Boolean(reunion),archivedAt:reunion&&reunion.archivedAt }
}
async function joinCouple(code,options={}) {
  const me = user(); const preview = await previewInvite(code); const couple = state.couples[preview.coupleId]
  const originalSource=me.coupleId&&state.couples[me.coupleId],reunion=reunionFor(originalSource,couple)
  let mergeEffectiveDate=''
  if(me.coupleId&&me.coupleId!==couple.id){
    const source=state.couples[me.coupleId]
    const canMerge=source&&source.active&&Array.isArray(source.memberIds)&&source.memberIds.length===1&&couple.active&&Array.isArray(couple.memberIds)&&couple.memberIds.length===1
    if(!canMerge)throw new Error('当前空间无法与该空间合并')
    Object.keys(state.entries).forEach(oldKey=>{
      const entry=state.entries[oldKey]
      if(entry.coupleId!==source.id||entry.userId!==me.id)return
      const sourceTask=state.tasks[key(source.id,entry.dateKey)]
      const nextKey=entryKey(couple.id,entry.dateKey,me.id)
      state.entries[nextKey]=Object.assign({},entry,{id:nextKey,coupleId:couple.id,legacyCoupleId:source.id,taskSnapshot:sourceTask?clone(sourceTask):entry.taskSnapshot})
      delete state.entries[oldKey]
    })
    source.memberIds=[];source.active=false;source.mergedIntoId=couple.id;source.mergedAt=new Date().toISOString()
    mergeEffectiveDate=nextDay(today())
  }
  if (!couple.memberIds.includes(me.id)){couple.memberIds.push(me.id);couple.spaceType='pair';couple.pairedAt=new Date().toISOString();if(mergeEffectiveDate)couple.pairingEffectiveDate=mergeEffectiveDate}
  if(reunion&&options.restoreHistory){const requestedAt=new Date().toISOString();couple.historyRestore={id:`restore-${Date.now()}`,relationId:reunion.relationId,archivedAt:reunion.archivedAt,approvals:[me.id],noticeUnreadFor:couple.memberIds.filter(id=>id!==me.id),status:'pending',requestedAt}}
  me.coupleId = couple.id; save(); return clone(couple)
}
async function getCouple() {
  const couple = coupleFor(user())
  return couple ? Object.assign(inviteView(couple), { members:members(couple).map(publicProfile) }) : null
}
async function renewInvite(){const couple=requireCouple();if(couple.memberIds.length>=2)throw new Error('双人空间已满员，无需生成新邀请码');let code;do{code=inviteCode(config.INVITE_CODE_LENGTH)}while(Object.values(state.couples).some(item=>item.inviteCode===code&&item.id!==couple.id));couple.inviteCode=code;couple.inviteExpiresAt=new Date(Date.now()+INVITE_TTL).toISOString();save();return inviteView(couple)}
async function unbindCouple() {
  const me = user(); const couple = coupleFor(me)
  if (!couple) return createPersonalSpace()
  if(couple.spaceType==='personal')return clone(couple)
  let code;do{code=inviteCode(config.INVITE_CODE_LENGTH)}while(Object.values(state.couples).some(item=>item.inviteCode===code))
  const archivedMemberIds=couple.memberIds.slice(),archivedAt=new Date().toISOString(),archivedRelationId=couple.archivedRelationId||couple.id
  const personal={id:createId('couple'),inviteCode:code,inviteExpiresAt:new Date(Date.now()+INVITE_TTL).toISOString(),memberIds:[me.id],personalOwnerId:me.id,spaceType:'personal',createdAt:new Date().toISOString(),active:true,archivedMemberIds,archivedAt,archivedRelationId}
  state.couples[personal.id]=personal
  Object.keys(state.entries).forEach(oldKey=>{
    const entry=state.entries[oldKey]
    if(entry.coupleId!==couple.id||entry.userId!==me.id)return
    const sourceTask=state.tasks[key(couple.id,entry.dateKey)]
    const nextKey=entryKey(personal.id,entry.dateKey,me.id)
    state.entries[nextKey]=Object.assign({},entry,{id:nextKey,coupleId:personal.id,legacyCoupleId:archivedRelationId,recordMode:'personal',visibility:'private',taskSnapshot:entry.taskSnapshot||(sourceTask?clone(sourceTask):null)})
    delete state.entries[oldKey]
  })
  state.meetings.forEach(meeting=>{if(meeting.coupleId===couple.id&&(meeting.creatorOpenid===me.id||meeting.userId===me.id))meeting.coupleId=personal.id})
  couple.archivedMemberIds=archivedMemberIds;couple.archivedAt=archivedAt;couple.archivedRelationId=archivedRelationId
  couple.memberIds=couple.memberIds.filter(id=>id!==me.id);if(!couple.memberIds.length)couple.active=false
  if(couple.memberIds.length){
    couple.spaceType='personal';couple.personalOwnerId=couple.memberIds[0]
    delete couple.pairingEffectiveDate
    delete couple.pairedAt
    delete couple.historyRestore
    couple.unbindNotice={id:`unbind-${Date.now()}-${me.id}`,nickname:me.nickname||'对方',createdAt:new Date().toISOString(),unreadFor:couple.memberIds.slice()}
    Object.values(state.entries).filter(entry=>entry.coupleId===couple.id&&entry.userId===couple.memberIds[0]).forEach(entry=>{entry.legacyCoupleId=archivedRelationId;entry.recordMode='personal';entry.visibility='private'})
    if(state.users[couple.memberIds[0]])state.users[couple.memberIds[0]].profileMode='personal'
  }
  me.coupleId=personal.id;me.profileMode='personal'
  save();return clone(personal)
}
async function respondHistoryRestore(accept){
  const me=user(),couple=requireCouple(),request=couple.historyRestore
  if(!request||request.status!=='pending')throw new Error('当前没有等待确认的历史恢复申请')
  if(!accept){couple.historyRestore=Object.assign({},request,{status:'declined',declinedBy:me.id,decidedAt:new Date().toISOString()});save();return clone(couple)}
  const approvals=Array.from(new Set((request.approvals||[]).concat(me.id)))
  if(couple.memberIds.every(id=>approvals.includes(id))){
    const grouped={}
    Object.values(state.entries).filter(entry=>entry.coupleId===couple.id&&entry.legacyCoupleId===request.relationId).forEach(entry=>{(grouped[entry.dateKey]||(grouped[entry.dateKey]=[])).push(entry)})
    Object.values(grouped).filter(items=>couple.memberIds.every(id=>items.some(item=>item.userId===id))).forEach(items=>items.forEach(entry=>{entry.recordMode='pair';entry.visibility='shared'}))
    couple.historyRestore=Object.assign({},request,{approvals,status:'restored',restoredAt:new Date().toISOString()})
  }else couple.historyRestore=Object.assign({},request,{approvals})
  save();return clone(couple)
}
async function getTodayTask(dateKey) {
  const couple = requireCouple(); const day = dateKey || today(); const taskKey = key(couple.id,day)
  if (!state.tasks[taskKey]) {
    const selectedCategories=state.settings.enabledCategories || DEFAULT_CATEGORIES
    const enabled = state.prompts.filter(p => (p.isCustom || p.enabled) && selectedCategories.includes(p.category))
    if (!enabled.length) throw new Error('题库中没有启用的题目')
    const usedIds=new Set(Object.values(state.tasks).filter(task=>task.coupleId===couple.id).reduce((ids,task)=>ids.concat(task.promptHistory||[task.promptId]),[]))
    let candidates = enabled.filter(prompt=>!usedIds.has(prompt.id))
    if (!candidates.length) candidates = enabled
    const selected = candidates[hash(`${couple.id}:${day}`) % candidates.length]
    state.tasks[taskKey] = { id:taskKey,coupleId:couple.id,dateKey:day,promptId:selected.id,prompt:clone(selected),promptHistory:[selected.id],promptOptions:[clone(selected)],currentPromptIndex:0,refreshCount:0,createdAt:new Date().toISOString() }
    save()
  }
  const stored=state.tasks[taskKey],byId={};state.prompts.forEach(prompt=>{byId[prompt.id]=prompt})
  let options=Array.isArray(stored.promptOptions)&&stored.promptOptions.length?stored.promptOptions:(stored.promptHistory||[stored.promptId]).map(id=>byId[id]).filter(Boolean)
  if(!options.length)options=[stored.prompt]
  let index=Number.isInteger(stored.currentPromptIndex)?stored.currentPromptIndex:options.findIndex(prompt=>prompt.id===stored.promptId)
  if(index<0||index>=options.length)index=Math.max(0,options.length-1)
  const result=clone(stored),prompt=options[index],unlimited=unlimitedPromptRefresh();result.promptId=prompt.id;result.prompt=clone(prompt);result.promptOptions=clone(options);result.currentPromptIndex=index;result.promptPosition=index+1;result.promptCount=options.length;result.refreshCount=Number(result.refreshCount||0);result.unlimitedRefresh=unlimited;result.refreshRemaining=unlimited?null:Math.max(0,3-result.refreshCount);result.refreshAvailable=unlimited||result.refreshCount<3;result.switchAvailable=result.refreshAvailable||options.length>1;result.nextAction=index<options.length-1?'existing':result.refreshAvailable?'new':'cycle'
  return result
}
async function refreshTodayTask(dateKey) {
  const couple=requireCouple();const day=dateKey||today();const task=await getTodayTask(day)
  if(Object.values(state.entries).some(entry=>entry.coupleId===couple.id&&entry.dateKey===day))throw new Error('已有成员提交今天的记录，不能再刷新题目')
  const selectedCategories=state.settings.enabledCategories || DEFAULT_CATEGORIES
  const enabled=state.prompts.filter(prompt=>(prompt.isCustom||prompt.enabled)&&selectedCategories.includes(prompt.category))
  if(enabled.length<2)throw new Error('当前启用的题目不足，无法刷新')
  const stored=state.tasks[key(couple.id,day)],promptOptions=clone(task.promptOptions||[task.prompt]),shownIds=new Set(promptOptions.map(prompt=>prompt.id))
  const usedIds=new Set(Object.values(state.tasks).filter(item=>item.coupleId===couple.id).reduce((ids,item)=>ids.concat(item.promptHistory||[item.promptId]),[]))
  let nextIndex=Number(task.currentPromptIndex||0)+1,nextCount=Number(stored.refreshCount||0)
  const unlimited=unlimitedPromptRefresh()
  if(nextIndex>=promptOptions.length&&(unlimited||nextCount<3)){
    let candidates=enabled.filter(prompt=>!usedIds.has(prompt.id)&&!shownIds.has(prompt.id))
    if(!candidates.length)candidates=enabled.filter(prompt=>!shownIds.has(prompt.id))
    if(!candidates.length){
      if(!unlimited)throw new Error('当前启用的题目不足，无法继续刷新')
      nextIndex=0
    }else{
      nextCount+=1
      const selected=candidates[hash(`${couple.id}:${day}:refresh:${nextCount}`) % candidates.length]
      promptOptions.push(clone(selected));nextIndex=promptOptions.length-1
    }
  }else if(nextIndex>=promptOptions.length)nextIndex=0
  const selected=promptOptions[nextIndex]
  stored.promptId=selected.id;stored.prompt=clone(selected);stored.promptHistory=promptOptions.map(prompt=>prompt.id);stored.promptOptions=promptOptions;stored.currentPromptIndex=nextIndex;stored.refreshCount=nextCount;stored.refreshedAt=new Date().toISOString();save()
  return getTodayTask(day)
}
async function getTodayStatus(dateKey) { return statusFor(dateKey || today()) }
async function getHomeSnapshot() {
  const current=await getCurrentUser()
  const couple=await getCouple()
  if(!current.onboarded||!couple)return {user:current,couple:null,task:null,status:null}
  const [task,status]=await Promise.all([getTodayTask(),getTodayStatus()])
  const notice=couple.unbindNotice
  const pendingNotice=notice&&Array.isArray(notice.unreadFor)&&notice.unreadFor.includes(current.id)?{id:notice.id,type:'partner-unbound',nickname:notice.nickname||'对方'}:null
  const restore=couple.historyRestore
  const pendingRestoreNotice=restore&&restore.status==='pending'&&!(restore.approvals||[]).includes(current.id)&&(restore.noticeUnreadFor||[]).includes(current.id)?{id:restore.id||`restore-${restore.requestedAt}`,type:'history-restore'}:null
  return {user:current,couple,task:status.myEntry&&status.myEntry.taskSnapshot?status.myEntry.taskSnapshot:task,status,pendingNotice,pendingRestoreNotice}
}
async function acknowledgeNotice(id){const couple=requireCouple();if(couple.unbindNotice&&couple.unbindNotice.id===id)couple.unbindNotice.unreadFor=(couple.unbindNotice.unreadFor||[]).filter(userId=>userId!==user().id);save();return true}
async function acknowledgeHistoryRestoreNotice(id){const couple=requireCouple(),restore=couple.historyRestore;if(restore&&restore.status==='pending'&&(restore.id||`restore-${restore.requestedAt}`)===id)restore.noticeUnreadFor=(restore.noticeUnreadFor||[]).filter(userId=>userId!==user().id);save();return true}
async function submitEntry(input) {
  const me=user(); const couple=requireCouple(); const day=input.dateKey || today(); const id=entryKey(couple.id,day,me.id)
  const previous=state.entries[id]
  if (previous&&!previous.deleted) throw new Error('今天已经提交过，可使用修改功能')
  if (!input.imagePath) throw new Error('请选择一张照片')
  const task=await getTodayTask(day)
  if(input.promptId&&input.promptId!==task.promptId)throw new Error('题目刚刚被对方更换，请确认新题目后再提交')
  const submittedAt=new Date().toISOString()
  const personal=personalOn(couple,day)
  state.entries[id]={ id,coupleId:couple.id,userId:me.id,dateKey:day,imagePath:String(input.imagePath),caption:cleanText(input.caption,config.MAX_CAPTION_LENGTH),city:me.city,recordMode:personal?'personal':'pair',visibility:personal?'private':'couple',taskSnapshot:{dateKey:day,promptId:task.promptId,prompt:clone(task.prompt)},submittedAt:previous&&previous.submittedAt?previous.submittedAt:submittedAt,updatedAt:submittedAt,backfilledAt:(input.backfill||(previous&&previous.deleted))?submittedAt:'',deleted:false,deletedAt:'' }
  save(); return statusFor(day)
}
async function updateEntry(input) {
  const me=user(); const couple=requireCouple(); const day=input.dateKey || today(); const id=entryKey(couple.id,day,me.id); const entry=state.entries[id]
  if (!entry) throw new Error('记录不存在')
  if (input.imagePath) entry.imagePath=String(input.imagePath)
  entry.caption=cleanText(input.caption,config.MAX_CAPTION_LENGTH); entry.updatedAt=new Date().toISOString(); save()
  return statusFor(day)
}
async function unlockToday(dateKey) {
  const result=statusFor(dateKey || today())
  if (!result.unlocked) throw new Error('双方都提交后才能解锁')
  return result
}
async function deleteEntry(dateKey) {
  const me=user();const couple=requireCouple();delete state.entries[entryKey(couple.id,dateKey||today(),me.id)];save();return true
}
async function getMemory(dateKey) {
  const day=dateKey || today()
  const status=statusFor(day)
  if (!status.unlocked) throw new Error('这一天尚未完成')
  const fallbackTask=await getTodayTask(day),task=status.myEntry&&status.myEntry.taskSnapshot||fallbackTask
  if(status.mode==='personal'||status.mode==='pairPending')return {dateKey:day,task,entries:status.myEntry?[status.myEntry]:[],users:status.myEntry?[publicProfile(user())]:[],distance:null,mode:'personal',canDeleteOwn:Boolean(status.myEntry),shareText:'今天，也被我认真收藏了。'}
  if(status.mode==='sharedPersonal'){
    const entries=[],users=[],entryTasks=[]
    if(status.myEntry){entries.push(status.myEntry);users.push(publicProfile(user()));entryTasks.push(status.myEntry.taskSnapshot||fallbackTask)}
    if(status.partnerEntry){entries.push(status.partnerEntry);users.push(status.partner);entryTasks.push(status.partnerEntry.taskSnapshot||fallbackTask)}
    const promptTexts=entryTasks.map(item=>String(item&&item.prompt&&item.prompt.text||'').trim().replace(/\s+/g,' '))
    const samePrompt=promptTexts.length===2&&Boolean(promptTexts[0])&&promptTexts[0]===promptTexts[1]
    return {dateKey:day,task:entryTasks[0]||fallbackTask,entryTasks,entries,users,distance:null,mode:samePrompt?'pair':'sharedPersonal',restoredHistorical:true,canDeleteOwn:Boolean(status.myEntry),shareText:samePrompt?'我们共同记住了这一天。':'我们看见了彼此曾经走过的这一天。'}
  }
  const distance=between(status.myEntry.city,status.partnerEntry.city)
  return { dateKey:day,task,entries:[status.myEntry,status.partnerEntry],users:[publicProfile(user()),status.partner],distance,mode:'pair',shareText:'我们共同记住了这一天。' }
}
async function getCalendar(month) {
  const couple=requireCouple(); const prefix=month || monthKey(today()); const days={}
  Object.values(state.entries).filter(e=>e.coupleId===couple.id&&!e.deleted&&e.dateKey.startsWith(prefix)&&(e.visibility!=='private'||e.userId===user().id||(couple.pairingEffectiveDate&&today()>=couple.pairingEffectiveDate&&e.dateKey<couple.pairingEffectiveDate&&state.users[e.userId]&&state.users[e.userId].settings&&state.users[e.userId].settings.sharePrePairRecords))).forEach(e=>{const day=days[e.dateKey]||(days[e.dateKey]={count:0,personal:false});day.count+=1;if(e.recordMode==='personal'||e.visibility==='private')day.personal=true})
  return Object.keys(days).map(dateKey=>({dateKey,status:days[dateKey].personal||days[dateKey].count>=2?'complete':'waiting'}))
}
async function getCalendarYear(year) {
  const couple=requireCouple()
  const selectedYear=String(year || today().substring(0,4))
  if(!/^\d{4}$/.test(selectedYear))throw new Error('年份格式无效')
  const counts={}
  Object.values(state.entries)
    .filter(entry=>entry.coupleId===couple.id&&!entry.deleted&&entry.dateKey.startsWith(`${selectedYear}-`)&&(entry.visibility!=='private'||entry.userId===user().id||(couple.pairingEffectiveDate&&today()>=couple.pairingEffectiveDate&&entry.dateKey<couple.pairingEffectiveDate&&state.users[entry.userId]&&state.users[entry.userId].settings&&state.users[entry.userId].settings.sharePrePairRecords)))
    .forEach(entry=>{const day=counts[entry.dateKey]||(counts[entry.dateKey]={count:0,personal:false});day.count+=1;if(entry.recordMode==='personal'||entry.visibility==='private')day.personal=true})
  const days=Object.keys(counts).sort().map(dateKey=>({
    dateKey,
    status:counts[dateKey].personal||counts[dateKey].count>=2?'complete':'waiting'
  }))
  const completeDays=days.filter(day=>day.status==='complete').map(day=>day.dateKey)
  return {
    year:Number(selectedYear),
    currentDate:today(),
    days,
    summary:{
      complete:completeDays.length,
      waiting:days.filter(day=>day.status==='waiting').length,
      bestStreak:longestStreak(completeDays)
    }
  }
}
async function getStatistics(){const year=await getCalendarYear(today().slice(0,4));return {totalTogether:year.summary.complete,bestStreak:year.summary.bestStreak,currentStreak:0}}
async function getCities() {
  const c=requireCouple(); const list=members(c).map(publicProfile)
  return { users:list,distance:list.length===2 ? between(list[0].city,list[1].city) : null }
}
async function getPrompts() { return clone(state.prompts) }
async function getPromptOverview() {
  const customCategories=state.settings.customCategories || []
  const enabledCategories=state.settings.enabledCategories || DEFAULT_CATEGORIES
  const categories=DEFAULT_CATEGORIES.concat(customCategories).map(name=>({
    name,
    enabled:enabledCategories.includes(name),
    required:REQUIRED_CATEGORIES.includes(name),
    isCustom:customCategories.includes(name),
    count:state.prompts.filter(prompt=>prompt.category===name && (prompt.isCustom || prompt.enabled)).length
  }))
  const last=Date.parse(user().lastCustomPromptAt||'')||0
  const next=last+CUSTOM_PROMPT_TTL
  const canAddPrompt=!last||next<=Date.now()
  return {categories,customPrompts:clone(state.prompts.filter(prompt=>prompt.isCustom)),canAddCategory:customCategories.length<CUSTOM_CATEGORY_LIMIT,customCategoryLimit:CUSTOM_CATEGORY_LIMIT,canAddPrompt,nextPromptDate:canAddPrompt?'':new Date(next).toISOString().slice(0,10)}
}
async function togglePromptCategory(name,enabled) {
  const all=DEFAULT_CATEGORIES.concat(state.settings.customCategories || [])
  if(!all.includes(name))throw new Error('分类不存在')
  if(REQUIRED_CATEGORIES.includes(name)&&!enabled)throw new Error(`${name}是固定开启的基础大类`)
  const selected=(state.settings.enabledCategories || DEFAULT_CATEGORIES).filter(category=>category!==name)
  if(enabled)selected.push(name)
  if(!selected.length)throw new Error('至少保留一个启用的大类')
  state.settings.enabledCategories=selected
  save()
  return getPromptOverview()
}
async function addCustomCategory(name) {
  const category=requireText(name,'大类名称',12)
  const all=DEFAULT_CATEGORIES.concat(state.settings.customCategories || [])
  if((state.settings.customCategories||[]).length>=CUSTOM_CATEGORY_LIMIT)throw new Error('最多只能添加 3 个自定义大类')
  if(all.includes(category))throw new Error('这个大类已经存在')
  state.settings.customCategories=(state.settings.customCategories || []).concat(category)
  state.settings.enabledCategories=(state.settings.enabledCategories || DEFAULT_CATEGORIES).concat(category)
  save()
  return getPromptOverview()
}
async function deleteCustomCategory(name) {
  const custom=state.settings.customCategories || []
  if(!custom.includes(name))throw new Error('内置大类不能删除')
  if(state.prompts.some(prompt=>prompt.isCustom && prompt.category===name))throw new Error('请先删除该大类中的自定义题目')
  state.settings.customCategories=custom.filter(category=>category!==name)
  state.settings.enabledCategories=(state.settings.enabledCategories || DEFAULT_CATEGORIES).filter(category=>category!==name)
  save()
  return getPromptOverview()
}
async function addCustomPrompt(input) {
  const last=Date.parse(user().lastCustomPromptAt||'')||0
  if(last&&last+CUSTOM_PROMPT_TTL>Date.now())throw new Error(`每 7 天只能添加一道问题，下次可添加：${new Date(last+CUSTOM_PROMPT_TTL).toISOString().slice(0,10)}`)
  const category=input.category||'趣味'
  if(!DEFAULT_CATEGORIES.concat(state.settings.customCategories || []).includes(category))throw new Error('请选择有效的大类')
  const p={id:createId('custom'),text:requireText(input.text,'题目',80),category,enabled:true,isCustom:true,createdAt:new Date().toISOString()}
  state.prompts.push(p);user().lastCustomPromptAt=p.createdAt;save();return clone(p)
}
async function updateCustomPrompt(id,input) {
  const p=state.prompts.find(item=>item.id===id);if(!p)throw new Error('题目不存在')
  if(input.text!==undefined){if(!p.isCustom)throw new Error('默认题目不能修改文字');p.text=requireText(input.text,'题目',80)}
  if(input.category!==undefined)p.category=input.category
  if(input.enabled!==undefined)p.enabled=Boolean(input.enabled)
  save();return clone(p)
}
async function deleteCustomPrompt(id) {
  const p=state.prompts.find(item=>item.id===id);if(!p)throw new Error('题目不存在')
  if(!p.isCustom)throw new Error('默认题目不能删除，可将其停用')
  state.prompts=state.prompts.filter(item=>item.id!==id);save();return true
}
async function deleteAllCustomPrompts() {
  state.prompts=state.prompts.filter(prompt=>!prompt.isCustom)
  save()
  return true
}
async function restoreDefaultPrompts() {
  const custom=state.prompts.filter(p=>p.isCustom);state.prompts=clone(prompts).concat(custom);save();return getPrompts()
}
async function getSettings(){return Object.assign(clone(state.settings),clone(user().settings||{}))}
async function updateSettings(input){const copy=Object.assign({},input);if(Object.prototype.hasOwnProperty.call(copy,'sharePrePairRecords')){user().settings=Object.assign({},user().settings,{sharePrePairRecords:Boolean(copy.sharePrePairRecords)});delete copy.sharePrePairRecords}Object.assign(state.settings,copy);save();return getSettings()}
async function addMeeting(input){
  const couple=requireCouple()
  const m={id:createId('meeting'),coupleId:couple.id,creatorOpenid:user().id,date:requireText(input.date,'日期',10),city:requireText(input.city,'城市',30),note:cleanText(input.note,100),createdAt:new Date().toISOString()}
  state.meetings.push(m);save();return clone(m)
}
async function getMeetings(){
  const couple=requireCouple()
  return clone(state.meetings).filter(meeting=>!meeting.coupleId || meeting.coupleId===couple.id).sort((a,b)=>b.date.localeCompare(a.date))
}
async function deleteMeeting(id){
  const couple=requireCouple()
  state.meetings=state.meetings.filter(meeting=>meeting.id!==id || (meeting.coupleId && meeting.coupleId!==couple.id))
  save();return true
}
async function scheduleReminder(input){state.reminders=state.reminders||{};const me=user(),id=`${me.id}_${input.dateKey}`,existing=state.reminders[id];if(existing){if(existing.status==='pending')return clone(existing);throw new Error('每天最多预约一次提醒')}state.reminders[id]={id,openid:me.id,dateKey:input.dateKey,time:'20:00',displayTime:`${input.dateKey} 20:00`,status:'pending',createdAt:new Date().toISOString()};save();return clone(state.reminders[id])}
async function getReminder(dateKey){const me=user();return clone((state.reminders||{})[`${me.id}_${dateKey}`]||null)}
async function cancelReminder(dateKey){const me=user(),reminder=(state.reminders||{})[`${me.id}_${dateKey}`];if(reminder&&reminder.status==='pending')reminder.status='cancelled';save();return true}
async function exportUserData(){return clone(state)}
function validateImportState(input) {
  let imported
  try{imported=typeof input==='string'?JSON.parse(input):clone(input)}catch(error){throw new Error('剪贴板内容不是有效的 JSON')}
  if(!imported || typeof imported!=='object' || Array.isArray(imported))throw new Error('备份格式无效')
  if(Number(imported.schemaVersion || 0)>config.STORAGE_SCHEMA_VERSION)throw new Error('备份来自更高版本，请先升级小程序')
  if(!imported.users || typeof imported.users!=='object' || !imported.users.A || !imported.users.B)throw new Error('备份缺少模拟用户 A/B')
  if(!imported.couples || typeof imported.couples!=='object')throw new Error('备份缺少双人空间数据')
  if(!imported.tasks || typeof imported.tasks!=='object')throw new Error('备份缺少每日问题数据')
  if(!imported.entries || typeof imported.entries!=='object')throw new Error('备份缺少每日记录数据')
  if(!Array.isArray(imported.prompts))throw new Error('备份缺少问题数据')
  Object.values(imported.entries).forEach(entry=>{
    if(!entry || typeof entry!=='object')throw new Error('备份中的每日记录格式无效')
    if(String(entry.imagePath || '').startsWith('data:'))throw new Error('备份不能包含 Base64 图片')
  })
  return migrate({
    schemaVersion:Number(imported.schemaVersion || 0),
    currentUserId:imported.currentUserId==='B'?'B':'A',
    users:clone(imported.users),
    couples:clone(imported.couples),
    tasks:clone(imported.tasks),
    entries:clone(imported.entries),
    prompts:clone(imported.prompts),
    meetings:Array.isArray(imported.meetings)?clone(imported.meetings):[],
    settings:imported.settings && typeof imported.settings==='object'?clone(imported.settings):{}
  },config.STORAGE_SCHEMA_VERSION)
}
async function importUserData(input) {
  const imported=migratePromptTaxonomy(validateImportState(input))
  const customPrompts=imported.prompts.filter(prompt=>prompt.isCustom)
  imported.prompts=clone(prompts).concat(customPrompts)
  state=imported
  save()
  return {
    users:Object.keys(state.users).length,
    couples:Object.keys(state.couples).length,
    entries:Object.keys(state.entries).length,
    prompts:state.prompts.length
  }
}
async function clearLocalData(){const me=user();me.deletionRequestedAt=new Date().toISOString();save();return clone(me)}
async function restoreLocalData(){const me=user();if(!me.deletionRequestedAt)throw new Error('没有等待恢复的数据');if(Date.now()-new Date(me.deletionRequestedAt).getTime()>=DELETE_UNDO_TTL)throw new Error('恢复期限已过，数据已进入永久删除流程');me.deletionRequestedAt='';save();return clone(me)}
async function debugPermanentDelete(){if(!config.ENABLE_DEBUG_TOOLS)throw new Error('仅测试版本支持立即永久删除');state=seed();save();return {deleted:true}}
module.exports={initialize,getCurrentUser,getHomeSnapshot,acknowledgeNotice,acknowledgeHistoryRestoreNotice,switchMockUser,updateProfile,createCouple,createPersonalSpace,previewInvite,joinCouple,renewInvite,getCouple,unbindCouple,respondHistoryRestore,getTodayTask,refreshTodayTask,getTodayStatus,submitEntry,updateEntry,unlockToday,getMemory,getCalendar,getCalendarYear,getStatistics,getCities,getPrompts,getPromptOverview,togglePromptCategory,addCustomCategory,deleteCustomCategory,addCustomPrompt,updateCustomPrompt,deleteCustomPrompt,deleteAllCustomPrompts,restoreDefaultPrompts,getSettings,updateSettings,deleteEntry,addMeeting,getMeetings,deleteMeeting,scheduleReminder,getReminder,cancelReminder,exportUserData,importUserData,clearLocalData,restoreLocalData,debugPermanentDelete}
