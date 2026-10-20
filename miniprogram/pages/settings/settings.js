const service=require('../../services/dataService')
const themeService=require('../../utils/theme')
const share=require('../../utils/share')
const {safeError}=require('../../utils/privacy')
const config=require('../../config/config')
const mockOnboarding=require('../../utils/mockOnboarding')
const LATEST_ANNOUNCEMENT='2026-08-17-v1.1.4'

function deletionView(user){
  const requestedAt=user&&user.deletionRequestedAt
  if(!requestedAt)return {deletionPending:false,deletionDeadline:''}
  const deadline=new Date(new Date(requestedAt).getTime()+24*60*60*1000)
  if(!Number.isFinite(deadline.getTime()))return {deletionPending:false,deletionDeadline:''}
  const pad=value=>String(value).padStart(2,'0')
  return {
    deletionPending:deadline.getTime()>Date.now(),
    deletionDeadline:`${deadline.getMonth()+1} 月 ${deadline.getDate()} 日 ${pad(deadline.getHours())}:${pad(deadline.getMinutes())}`
  }
}

Page({
  data:{
    user:{theme:themeService.getInitialTheme()},
    initial:'',
    settings:{},
    debugTools:config.ENABLE_DEBUG_TOOLS,
    mockSwitcher:config.APP_MODE==='mock'&&config.ENABLE_MOCK_SWITCHER,
    mockUserLabel:'A',
    announcementUnread:false,
    deletionPending:false,
    deletionDeadline:''
  },
  async onShow(){
    const theme=themeService.getInitialTheme()
    if(this.data.user.theme!==theme)this.setData({'user.theme':theme})
    themeService.apply(theme)
    await this.load()
  },
  async load(){
    const [user,settings]=await Promise.all([
      service.getCurrentUser(),
      service.getSettings()
    ])
    themeService.apply(user.theme)
    this.setData({
      user,
      initial:(user.nickname||'?').substring(0,1),
      mockUserLabel:user.id==='B'?'B':'A',
      settings,
      announcementUnread:settings.announcementSeenVersion!==LATEST_ANNOUNCEMENT,
      ...deletionView(user)
    })
  },
  profile(){wx.navigateTo({url:'/pages/profile/profile'})},
  pair(){wx.navigateTo({url:'/pages/pair/pair'})},
  promptSettings(){wx.navigateTo({url:'/pages/prompt-settings/prompt-settings'})},
  announcements(){wx.navigateTo({url:'/pages/announcements/announcements'})},
  privacy(){wx.navigateTo({url:'/pages/privacy/privacy'})},
  async switchMockUser(e){
    const userId=e.currentTarget.dataset.user
    if(!this.data.mockSwitcher||userId===this.data.mockUserLabel)return
    try{
      wx.showLoading({title:`正在切换到用户 ${userId}`,mask:true})
      const user=await service.switchMockUser(userId)
      const theme=user.theme||themeService.getInitialTheme()
      themeService.remember(theme)
      themeService.apply(theme)
      getApp().globalData.togetherPreload=null
      getApp().globalData.calendarRevision=(getApp().globalData.calendarRevision||0)+1
      let firstMockB=false
      if(userId==='B')firstMockB=mockOnboarding.consumeFirstBVisit()
      wx.hideLoading()
      wx.reLaunch({url:firstMockB?'/pages/onboarding/onboarding?mockFresh=1':'/pages/home/home'})
    }catch(error){wx.hideLoading();this.toast(error)}
  },
  async debugDate(e){try{const settings=await service.updateSettings({mockDate:e.detail.value});this.setData({settings});wx.showToast({title:'测试日期已更新'})}catch(error){this.toast(error)}},
  async clearDebugDate(){try{const settings=await service.updateSettings({mockDate:''});this.setData({settings});wx.showToast({title:'已恢复真实日期'})}catch(error){this.toast(error)}},
  debugDeleteAll(){
    wx.showModal({
      title:'永久删除所有测试数据？',
      content:'当前账号的资料、头像、照片、记录和设置会立即永久删除，无法恢复。若空间仍有另一位成员，对方数据不会被删除。',
      confirmText:'继续',
      confirmColor:'#c64d43',
      success:first=>{
        if(!first.confirm)return
        wx.showModal({
          title:'最后一次确认',
          content:'删除后会回到首次登录界面。此操作没有 24 小时恢复期。',
          confirmText:'永久删除',
          confirmColor:'#c64d43',
          success:async second=>{
            if(!second.confirm)return
            try{
              wx.showLoading({title:'正在永久删除',mask:true})
              await service.debugPermanentDelete()
              wx.hideLoading()
              try{wx.clearStorageSync()}catch(error){}
              wx.reLaunch({url:'/pages/onboarding/onboarding'})
            }catch(error){wx.hideLoading();this.toast(error)}
          }
        })
      }
    })
  },
  clear(){
    wx.showModal({
      title:'删除我的全部数据？',
      content:'提交后将进入 24 小时恢复期。期间数据不会被永久清除，你可以随时恢复；超过恢复期后将永久删除。',
      confirmColor:'#c64d43',
      confirmText:'确认删除',
      success:async result=>{
        if(!result.confirm)return
        try{wx.showLoading({title:'正在处理'});const pending=await service.clearLocalData();wx.hideLoading();this.setData({...deletionView(pending||{deletionRequestedAt:new Date().toISOString()}),user:Object.assign({},this.data.user,pending||{})});wx.showToast({title:'24 小时内可恢复',icon:'none'})}catch(error){wx.hideLoading();this.toast(error)}
      }
    })
  },
  async restoreData(){
    try{wx.showLoading({title:'正在恢复'});const user=await service.restoreLocalData();wx.hideLoading();this.setData({user,deletionPending:false,deletionDeadline:''});wx.showToast({title:'数据已恢复'})}catch(error){wx.hideLoading();this.toast(error)}
  },
  toast(error){wx.showToast({title:safeError(error),icon:'none'})},
  onShareAppMessage(){return share.appMessage()},
  onShareTimeline(){return share.timeline()}
})
