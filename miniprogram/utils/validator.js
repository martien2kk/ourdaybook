function cleanText(value, max) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max)
}
function requireText(value, label, max) {
  const text = cleanText(value, max)
  if (!text) throw new Error(`请填写${label}`)
  return text
}
function validateImage(file) {
  if (!file || !file.path) throw new Error('请选择一张照片')
  const ext = (file.path.split('.').pop() || '').toLowerCase()
  if (ext && !['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) throw new Error('仅支持常见图片格式')
  return true
}
module.exports = { cleanText, requireText, validateImage }
