function hash(text) {
  let result = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    result ^= text.charCodeAt(i)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}
function createId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
function inviteCode(length) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let value = ''
  for (let i = 0; i < length; i += 1) value += chars[Math.floor(Math.random() * chars.length)]
  return value
}
module.exports = { hash, createId, inviteCode }
