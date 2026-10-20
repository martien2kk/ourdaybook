const config = require('../config/config')
const service = config.APP_MODE === 'cloud' ? require('./cloudService') : require('./mockService')

let ready
function initialize() {
  if (!ready) ready = service.initialize()
  return ready
}

const facade = { initialize }
Object.keys(service).forEach(name => {
  if (name === 'initialize') return
  facade[name] = function wrapped() {
    const args = arguments
    return initialize().then(() => service[name].apply(service, args))
  }
})
// 测试账号重置会删除当前用户文档；完成后必须清除初始化缓存并立即创建全新用户。
facade.debugPermanentDelete = function debugPermanentDelete() {
  return initialize()
    .then(() => {
      if (typeof service.debugPermanentDelete !== 'function') throw new Error('请清缓存并重新编译测试版本')
      return service.debugPermanentDelete()
    })
    .then(result => {
      ready = undefined
      return initialize().then(() => result)
    })
}
module.exports = facade
