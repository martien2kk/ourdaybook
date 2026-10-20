const cities = require('../data/city-coordinates')
function rad(n) { return n * Math.PI / 180 }
function between(cityA, cityB) {
  const a = cities[cityA]; const b = cities[cityB]
  if (!a || !b) return null
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)))
}
module.exports = { between }
