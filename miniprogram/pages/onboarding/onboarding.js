const service=require('../../services/dataService')
const themeService=require('../../utils/theme')
const share=require('../../utils/share')
Page({
  data:{showCloud:false,theme:'minimal',ready:false,forceOnboarding:false},
  async onLoad(query){
    const forceOnboarding=Boolean(query&&query.mockFresh==='1')
    const user=await service.getCurrentUser()
    themeService.apply(user.theme)
    if(user.onboarded&&!forceOnboarding)return wx.reLaunch({url:'/pages/home/home'})
    this.setData({theme:user.theme,ready:true,forceOnboarding})
  },
  toggleCloud(){this.setData({showCloud:!this.data.showCloud})},
  tour(){wx.navigateTo({url:'/pages/tour/tour'})},
  privacy(){wx.navigateTo({url:'/pages/privacy/privacy'})},
  async start(){
    const user=await service.getCurrentUser()
    wx.redirectTo({url:user.onboarded&&!this.data.forceOnboarding?'/pages/home/home':'/pages/profile/profile?first=1'})
  },
  async startSingle(){
    const user=await service.getCurrentUser()
    wx.redirectTo({url:user.onboarded&&!this.data.forceOnboarding?'/pages/home/home':'/pages/profile/profile?first=1&single=1'})
  },
  onShareAppMessage(){return share.appMessage()},
  onShareTimeline(){return share.timeline()}
})
