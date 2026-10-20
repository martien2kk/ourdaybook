const dataService = require('./services/dataService')
const themeService = require('./utils/theme')
App({
  globalData: { ready: false, calendarRevision: 0, togetherPreload: null },
  async onLaunch() {
    themeService.apply(themeService.getInitialTheme())
    try {
      await dataService.initialize()
      this.globalData.ready = true
    } catch (error) {
      console.error('初始化失败', error && error.message)
      wx.showToast({ title: '云端服务初始化失败', icon: 'none' })
    }
  }
})
