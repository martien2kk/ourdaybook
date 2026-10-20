function publicProfile(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    city: user.locationVisible === false ? '未公开' : user.city,
    locationVisible: user.locationVisible !== false
  }
}
function safeError(error) {
  const message=String(error&&(error.message||error.errMsg)||'')
  if(/privacy|隐私|scope is not declared|authorize/i.test(message))return '请先在公众平台配置并同意用户隐私保护指引'
  if(/auth deny|authorize:fail|permission/i.test(message))return '请在微信设置中允许访问相册或相机'
  return message.replace(/^\w+:fail\s*/i,'')||'操作失败，请重试'
}
module.exports = { publicProfile, safeError }
