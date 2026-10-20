function migrate(state, version) {
  const next = Object.assign({}, state)
  next.schemaVersion = version
  next.meetings = next.meetings || []
  next.settings = next.settings || {}
  next.settings.enabledCategories = next.settings.enabledCategories || ['日常','所见','心情','截图','回忆','创意','思念']
  next.settings.customCategories = next.settings.customCategories || []
  Object.values(next.users || {}).forEach(user => {
    if (user && user.theme === 'green') user.theme = 'blue'
  })
  return next
}
module.exports = { migrate }
