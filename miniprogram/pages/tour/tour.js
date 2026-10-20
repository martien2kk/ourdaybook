Page({
  start(){wx.redirectTo({url:'/pages/profile/profile?first=1'})},
  single(){wx.redirectTo({url:'/pages/profile/profile?first=1&single=1'})},
  back(){wx.navigateBack()}
})
