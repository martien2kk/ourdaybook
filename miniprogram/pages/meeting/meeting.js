const service=require('../../services/dataService')
const config=require('../../config/config')
const themeService=require('../../utils/theme')
const {toDateKey}=require('../../utils/date')

function decorate(item,today){
  const next=Object.assign({},item)
  const difference=Math.round((new Date(`${item.date}T12:00:00`)-new Date(`${today}T12:00:00`))/86400000)
  next.daysUntil=Math.max(0,difference)
  next.countdown=difference===0?'今天见面':difference>0?`还有 ${difference} 天`:'已经见过'
  return next
}

Page({
  data:{user:{theme:themeService.getInitialTheme()},date:'',city:'',note:'',upcoming:[],past:[]},
  onShow(){this.load()},
  async load(){
    try{
      const [user,items,settings]=await Promise.all([service.getCurrentUser(),service.getMeetings(),service.getSettings()])
      themeService.apply(user.theme)
      const today=config.ENABLE_DEBUG_TOOLS&&settings.mockDate?settings.mockDate:toDateKey()
      const upcoming=items.filter(item=>item.date>=today).sort((a,b)=>a.date.localeCompare(b.date)).map(item=>decorate(item,today))
      const past=items.filter(item=>item.date<today).sort((a,b)=>b.date.localeCompare(a.date)).map(item=>decorate(item,today))
      this.setData({user,upcoming,past})
    }catch(error){wx.showToast({title:error.message||'加载失败',icon:'none'})}
  },
  field(e){this.setData({[e.currentTarget.dataset.key]:e.detail.value})},
  date(e){this.setData({date:e.detail.value})},
  async add(){
    try{
      await service.addMeeting(this.data)
      this.setData({date:'',city:'',note:''})
      await this.load()
      wx.showToast({title:'已记录'})
    }catch(error){wx.showToast({title:error.message||'操作失败',icon:'none'})}
  },
  remove(e){
    wx.showModal({
      title:'删除这次相遇？',
      content:'删除后无法恢复。',
      success:async result=>{
        if(result.confirm){await service.deleteMeeting(e.currentTarget.dataset.id);await this.load()}
      }
    })
  }
})
