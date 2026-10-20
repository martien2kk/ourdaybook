const config = require('../config/config')
const { validateImage } = require('../utils/validator')
function normalizeFile(file) {
  if (!file) return null
  return {
    path:file.path || file.tempFilePath || '',
    size:Number(file.size || 0)
  }
}
function persist(file) {
  const normalized=normalizeFile(file)
  validateImage(normalized)
  // 云端版提交时会立即将临时文件上传到云存储，无需再保存到本机。
  // 这也避免使用已经被基础库标记为废弃的 wx.saveFile。
  if(config.APP_MODE==='cloud')return Promise.resolve(Object.assign({},normalized,{temporary:true}))
  return new Promise(resolve => wx.saveFile({
    tempFilePath:normalized.path,
    success(saved) { resolve({ path:saved.savedFilePath, size:normalized.size }) },
    fail() { resolve({ path:normalized.path, size:normalized.size, temporary:true }) }
  }))
}
function isCancel(error) {
  return Boolean(error && error.errMsg && error.errMsg.toLowerCase().includes('cancel'))
}
function isPrivacyError(error){return /privacy|隐私|scope is not declared|authorize/i.test(String(error&&(error.errMsg||error.message)||''))}
function chooseImageFallback() {
  return new Promise((resolve,reject)=>wx.chooseImage({
    count:1,
    sizeType:['compressed'],
    sourceType:['album','camera'],
    success(result) {
      persist({ path:result.tempFilePaths[0],size:result.tempFiles && result.tempFiles[0] ? result.tempFiles[0].size : 0 }).then(resolve).catch(reject)
    },
    fail(error) { if(isCancel(error))resolve(null);else reject(error) }
  }))
}
function choose() {
  if (typeof wx.chooseMedia !== 'function') return chooseImageFallback()
  return new Promise((resolve, reject) => wx.chooseMedia({
    count:1, mediaType:['image'], sourceType:['album','camera'], sizeType:['compressed'],
    success(result) {
      persist(result.tempFiles[0]).then(resolve).catch(reject)
    },
    fail(error) {
      if(isCancel(error))resolve(null)
      else if(isPrivacyError(error))reject(error)
      else if(typeof wx.chooseImage==='function')chooseImageFallback().then(resolve).catch(reject)
      else reject(error)
    }
  }))
}
function remove(path) {
  if (!path || !path.includes('store')) return Promise.resolve()
  return new Promise(resolve => wx.removeSavedFile({ filePath:path, complete:resolve }))
}
module.exports = { choose, persist, remove, normalizeFile, MAX_IMAGE_SIZE:config.MAX_IMAGE_SIZE }
