const { addDays } = require('./date')
function calculate(entries, users) {
  const both = {}
  Object.values(entries).forEach(e => {
    both[e.dateKey] = both[e.dateKey] || new Set()
    both[e.dateKey].add(e.userId)
  })
  const complete = Object.keys(both).filter(k => both[k].size >= users.length).sort()
  let best = 0; let run = 0; let previous = ''
  complete.forEach(key => {
    run = previous && addDays(previous, 1) === key ? run + 1 : 1
    best = Math.max(best, run); previous = key
  })
  return { totalTogether: complete.length, currentStreak: run, bestStreak: best }
}
module.exports = { calculate }
