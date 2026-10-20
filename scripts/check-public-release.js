const fs = require('fs')
const path = require('path')
const vm = require('vm')
const {execFileSync} = require('child_process')
const root = path.resolve(__dirname, '..')
const files = execFileSync('git', ['ls-files','--cached','-z'], {cwd:root,encoding:'utf8'}).split('\0').filter(Boolean)
if (!files.length) throw new Error('No tracked release files to inspect')
const failures = []
const privatePaths = /(^|\/)(handoff[^/]*|initial_prompt\.txt|local_test\.md|project\.private\.config\.json|config\.local\.js|\.env(?:\..*)?|[^/]*\.(?:log|pem|key|p12|pfx)|marketing|exports|backups|output|node_modules)(\/|$)/i
const rules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['deployed cloud environment', /\bcloud\d-[a-z0-9-]{8,}\b/i],
  ['real WeChat AppID', /\bwx[0-9a-f]{16}\b/i],
  ['personal machine path', /(?:^|[\s'"`=(])(?:[A-Z]:\\Users\\|\/Users\/|\/home\/)[^\s'"`<>]+/im],
  ['email address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['literal credential', /(?:appsecret|secretkey|api[_-]?key|access[_-]?token|password)\s*[:=]\s*['"][^'"\s]{12,}['"]/i],
  ['Chinese mobile phone', /(?<!\d)1[3-9]\d{9}(?!\d)/],
  ['North American phone', /(?<!\d)(?:\+1[ -]?)?\(?[2-9]\d{2}\)?[ -][2-9]\d{2}[ -]\d{4}(?!\d)/]
]
for (const file of files) {
  if (privatePaths.test(file)) failures.push(`${file}: private file or directory`)
  const data = execFileSync('git',['show',`:${file}`],{cwd:root,maxBuffer:10*1024*1024})
  if (data.includes(0)) {
    if (!/\.(png|jpg)$/i.test(file)) failures.push(`${file}: unexpected binary asset`)
    continue
  }
  const text = data.toString('utf8')
  for (const [kind,pattern] of rules) if (pattern.test(text)) failures.push(`${file}: ${kind}`)
}
const readStaged = file => execFileSync('git',['show',`:${file}`],{cwd:root,encoding:'utf8'})
const project = JSON.parse(readStaged('project.config.json'))
if(project.appid !== 'touristappid') failures.push('project.config.json: must use touristappid')
const sandbox = {module:{exports:{}}}
vm.runInNewContext(readStaged('miniprogram/config/config.js'),sandbox)
const config=sandbox.module.exports
if(config.CLOUD_ENV_ID !== '' || config.APP_MODE !== 'mock' || config.ENABLE_DEBUG_TOOLS !== false) failures.push('Public configuration must use mock mode, no environment ID, and disabled debug tools')
for (const needed of ['LICENSE','ASSETS.md','THIRD_PARTY_NOTICES.md']) if(!files.includes(needed)) failures.push(`Missing ${needed}`)
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log(`PASS: ${files.length} tracked public files checked; no configured production identifiers, common credentials, personal paths, contact details, or private files detected.`)
