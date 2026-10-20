function pad(value) { return String(value).padStart(2, '0') }
function toDateKey(input) {
  const date = input ? new Date(input) : new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}
function monthKey(input) { return (input || toDateKey()).slice(0, 7) }
function formatDateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  return `${toDateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
module.exports = { toDateKey, addDays, monthKey, formatDateTime }
