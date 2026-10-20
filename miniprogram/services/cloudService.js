const config = require('../config/config')

let initialized = false

function cloudError(error) {
  const message = error && (error.message || error.errMsg)
  return new Error(String(message || '云端服务暂时不可用，请稍后重试').replace(/^Error:\s*/, ''))
}

async function call(action, data) {
  try {
    const response = await wx.cloud.callFunction({
      name: 'ourDaybookApi',
      data: Object.assign({ action }, data || {})
    })
    const result = response && response.result
    if (!result || result.ok !== true) throw new Error(result && result.message ? result.message : '云函数返回异常')
    return result.data
  } catch (error) {
    throw cloudError(error)
  }
}

async function initialize() {
  if (initialized) return true
  if (!config.CLOUD_ENV_ID) throw new Error('请先配置自己的云开发环境')
  if (!wx.cloud) throw new Error('当前基础库不支持云开发，请升级微信后重试')
  const options = { traceUser: true }
  if (config.CLOUD_ENV_ID) options.env = config.CLOUD_ENV_ID
  wx.cloud.init(options)
  const user = await call('initialize')
  initialized = true
  return user
}

function extension(path) {
  const match = String(path || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
  return match ? match[1].toLowerCase() : 'jpg'
}
function isCloudFile(path) { return String(path || '').startsWith('cloud://') }

function localFileSize(path) {
  try{return Number(wx.getFileSystemManager().statSync(path).size||0)}catch(error){return 0}
}

function compressOnce(path,options) {
  return new Promise(resolve=>{
    let finished=false
    const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);resolve(value||path)}
    const timer=setTimeout(()=>finish(path),12000)
    wx.compressImage(Object.assign({src:path,success(result){finish(result.tempFilePath)},fail(){finish(path)}},options))
  })
}

function imageInfo(path) {
  return new Promise(resolve=>wx.getImageInfo({
    src:path,
    success:resolve,
    fail(){resolve(null)}
  }))
}

async function prepareUploadPath(path) {
  const maxSize=Number(config.CLOUD_IMAGE_MAX_SIZE||400*1024)
  if(typeof wx.compressImage!=='function'||localFileSize(path)<=maxSize)return path
  // 云端仅保存轻量展示图。原始照片仍保留在用户系统相册，不上传也不改写。
  // 每一档都以上一档结果为输入：超大图、PNG 和长截图也会持续缩小，而不是
  // 在尝试几次后要求用户手动裁剪。前几档优先保画质，后几档用于兜底。
  const levels=[
    {quality:82,longEdge:1600},
    {quality:74,longEdge:1440},
    {quality:66,longEdge:1280},
    {quality:58,longEdge:1080},
    {quality:50,longEdge:960},
    {quality:42,longEdge:800},
    {quality:34,longEdge:640},
    {quality:26,longEdge:480}
  ]
  const info=await imageInfo(path)
  // 只限制照片的长边。若同时传入相同的 compressedWidth 和
  // compressedHeight，竖图会被强制压成正方形并产生横向拉伸。
  const portrait=Boolean(info&&info.height>info.width)
  const originalLongEdge=info?Math.max(info.width,info.height):0
  let current=path
  for(const level of levels){
    const target=originalLongEdge?Math.min(originalLongEdge,level.longEdge):level.longEdge
    const options={quality:level.quality}
    if(portrait)options.compressedHeight=target
    else options.compressedWidth=target
    const next=await compressOnce(current,options)
    // 压缩失败时保留上一档结果，避免把有效路径替换成空值。
    if(next)current=next
    const size=localFileSize(current)
    if(size>0&&size<=maxSize)return current
  }
  return current
}

async function uploadImage(path, kind) {
  if (!path || isCloudFile(path)) return path
  const uploadPath=await prepareUploadPath(path)
  const uploadSize=localFileSize(uploadPath)
  const maxSize=Number(config.CLOUD_IMAGE_MAX_SIZE||400*1024)
  if(!uploadSize||uploadSize>maxSize)throw new Error('图片压缩失败，请重新选择该图片或换一种常见图片格式后重试')
  const cloudPath = `private/${kind || 'entries'}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension(uploadPath)}`
  try {
    const result = await wx.cloud.uploadFile({ cloudPath, filePath: uploadPath })
    try{await call('registerUpload',{fileID:result.fileID,kind:kind||'entries'})}
    catch(error){await wx.cloud.deleteFile({fileList:[result.fileID]}).catch(()=>{});throw error}
    return result.fileID
  } catch (error) {
    throw cloudError(error)
  }
}

async function updateProfile(input) {
  const payload = Object.assign({}, input)
  if (payload.avatar) payload.avatar = await uploadImage(payload.avatar, 'avatars')
  return call('updateProfile', { input: payload })
}
async function writeEntry(action, input) {
  const payload = Object.assign({}, input)
  if (payload.imagePath) payload.imagePath = await uploadImage(payload.imagePath, 'entries')
  return call(action, { input: payload })
}

const simple = {
  getCurrentUser:'getCurrentUser', createCouple:'createCouple', getCouple:'getCouple',
  getHomeSnapshot:'getHomeSnapshot',
  unbindCouple:'unbindCouple', getTodayTask:'getTodayTask', getTodayStatus:'getTodayStatus',
  unlockToday:'unlockToday', getMemory:'getMemory', getCalendar:'getCalendar',
  getCalendarYear:'getCalendarYear', getStatistics:'getStatistics', getCities:'getCities',
  getPrompts:'getPrompts', getPromptOverview:'getPromptOverview', getSettings:'getSettings',
  getMeetings:'getMeetings', clearLocalData:'clearLocalData', restoreLocalData:'restoreLocalData',
  restoreDefaultPrompts:'restoreDefaultPrompts'
}
const api = { initialize, updateProfile }
Object.keys(simple).forEach(name => {
  api[name] = function () {
    return call(simple[name], { args:Array.prototype.slice.call(arguments) })
  }
})
api.previewInvite = code => call('previewInvite', { code })
api.acknowledgeNotice = id => call('acknowledgeNotice', { id })
api.acknowledgeHistoryRestoreNotice = id => call('acknowledgeHistoryRestoreNotice', { id })
api.createPersonalSpace = () => call('createPersonalSpace')
api.joinCouple = (code,options={}) => call('joinCouple', { code,restoreHistory:Boolean(options.restoreHistory) })
api.respondHistoryRestore = accept => call('respondHistoryRestore', { accept:Boolean(accept) })
api.renewInvite = () => call('renewInvite')
api.refreshTodayTask = dateKey => call('refreshTodayTask', { dateKey })
api.submitEntry = input => writeEntry('submitEntry', input)
api.updateEntry = input => writeEntry('updateEntry', input)
api.deleteEntry = dateKey => call('deleteEntry', { dateKey })
api.togglePromptCategory = (name, enabled) => call('togglePromptCategory', { name, enabled })
api.addCustomCategory = name => call('addCustomCategory', { name })
api.deleteCustomCategory = name => call('deleteCustomCategory', { name })
api.addCustomPrompt = input => call('addCustomPrompt', { input })
api.updateCustomPrompt = (id, input) => call('updateCustomPrompt', { id, input })
api.deleteCustomPrompt = id => call('deleteCustomPrompt', { id })
api.deleteAllCustomPrompts = () => call('deleteAllCustomPrompts')
api.updateSettings = input => call('updateSettings', { input })
api.addMeeting = input => call('addMeeting', { input })
api.deleteMeeting = id => call('deleteMeeting', { id })
api.scheduleReminder = input => call('scheduleReminder', { input })
api.getReminder = dateKey => call('getReminder', { dateKey })
api.cancelReminder = dateKey => call('cancelReminder', { dateKey })
api.debugPermanentDelete = async () => {
  const result = await call('debugPermanentDelete')
  initialized = false
  return result
}
api.switchMockUser = () => Promise.reject(new Error('云端版以当前微信账号登录，不能切换模拟用户'))

module.exports = api
