const service=require('../../services/dataService')
const image=require('../../services/imageService')
const privacy=require('../../utils/privacy')
const themeService=require('../../utils/theme')

const themes=[
  {id:'minimal',name:'留白',accent:'#9a725a'},
  {id:'warm',name:'暖阳',accent:'#c97968'},
  {id:'calm',name:'星夜',accent:'#f08fb3'},
  {id:'blue',name:'蓝境',accent:'#8fb5ff'}
]

function emptyUser(){
  return {theme:themeService.getInitialTheme(),nickname:'',avatar:'',city:'',anniversary:'',locationVisible:true}
}

Page({
  data:{user:emptyUser(),cityLength:0,accent:'#9a725a',first:false,showPartnerFields:true,themes},
  async onLoad(query){
    const q=query||{}
    const showPartnerFields=q.single!=='1'
    this.setData({first:q.first==='1',showPartnerFields})
    try{
      const stored=await service.getCurrentUser()
      const user=Object.assign(emptyUser(),stored||{})
      const selected=themes.find(item=>item.id===user.theme)||themes[0]
      user.theme=selected.id
      themeService.apply(selected.id)
      this.setData({user,cityLength:Array.from(user.city||'').length,accent:selected.accent})
    }catch(error){
      themeService.apply(this.data.user.theme)
      wx.showToast({title:privacy.safeError(error),icon:'none'})
    }
  },
  field(e){
    const key=e.currentTarget.dataset.key,value=e.detail.value
    const update={[`user.${key}`]:value}
    if(key==='city')update.cityLength=Array.from(value).length
    this.setData(update)
  },
  anniversary(e){this.setData({'user.anniversary':e.detail.value})},
  toggle(e){this.setData({'user.locationVisible':e.detail.value})},
  theme(e){
    const selected=themes.find(item=>item.id===e.currentTarget.dataset.id)||themes[0]
    themeService.apply(selected.id,{remember:false})
    this.setData({'user.theme':selected.id,accent:selected.accent})
  },
  async avatar(){
    try{const file=await image.choose();if(file)this.setData({'user.avatar':file.path})}
    catch(error){wx.showToast({title:privacy.safeError(error),icon:'none'})}
  },
  async save(){
    try{
      const profileMode=this.data.showPartnerFields?'pair':'personal'
      const user=await service.updateProfile(Object.assign({},this.data.user,{onboarded:true,profileMode}))
      await service.updateSettings({profileMode})
      themeService.remember(user.theme)
      wx.showToast({title:'已保存'})
      setTimeout(()=>wx.reLaunch({url:'/pages/home/home'}),500)
    }catch(error){wx.showToast({title:privacy.safeError(error),icon:'none'})}
  }
})
