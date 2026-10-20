const config=require('../../config/config')
const service=require('../../services/dataService')
const themeService=require('../../utils/theme')
Page({
  data:{mode:config.APP_MODE,env:config.CLOUD_ENV_ID,theme:themeService.getInitialTheme()},
  onLoad(){themeService.apply(this.data.theme)},
  test(){service.initialize().then(()=>wx.showToast({title:'服务可用'})).catch(error=>wx.showModal({title:'尚未配置',content:error.message,showCancel:false}))}
})
