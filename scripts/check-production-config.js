const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const config = require(path.join(root, 'miniprogram/config/config'))
const cloudApiSource = fs.readFileSync(path.join(root, 'cloudfunctions/ourDaybookApi/index.js'), 'utf8')
const failures = []
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
if (!/^wx[0-9a-f]{16}$/i.test(String(project.appid || ''))) failures.push('请在本地 project.config.json 配置自己的正式 AppID')

if (config.APP_MODE !== 'cloud') failures.push(`APP_MODE 必须是 'cloud'，当前是 '${config.APP_MODE}'`)
if (config.ENABLE_MOCK_SWITCHER !== false) failures.push('ENABLE_MOCK_SWITCHER 必须是 false')
if (config.ENABLE_DEBUG_TOOLS !== false) failures.push('ENABLE_DEBUG_TOOLS 必须是 false')
if (config.ENABLE_UNLIMITED_PROMPT_REFRESH !== false) failures.push('ENABLE_UNLIMITED_PROMPT_REFRESH 必须是 false')
if (!/^cloud[\w-]+$/.test(String(config.CLOUD_ENV_ID || ''))) failures.push('CLOUD_ENV_ID 未填写或格式不正确')
if (!/const\s+ENABLE_DEBUG_TOOLS\s*=\s*false\b/.test(cloudApiSource)) failures.push('ourDaybookApi 云函数的 ENABLE_DEBUG_TOOLS 必须是 false')

if (failures.length) {
  console.error('\n[禁止上传] 当前项目仍包含测试配置：')
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`))
  console.error('\n请修正正式配置后再上传。\n')
  process.exit(1)
}

console.log('[上传前检查通过] 当前为云端正式配置。')
