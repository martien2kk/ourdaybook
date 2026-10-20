const service=require('../../services/dataService')
const themeService=require('../../utils/theme')

Page({
  data:{theme:themeService.getInitialTheme()},
  async onLoad(){
    try{const user=await service.getCurrentUser();themeService.apply(user.theme);this.setData({theme:user.theme})}catch(error){themeService.apply(this.data.theme)}
  }
})
