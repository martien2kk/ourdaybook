const service=require('../../services/dataService')
const image=require('../../services/imageService')
const {safeError}=require('../../utils/privacy')
const themeService=require('../../utils/theme')

function label(date){const value=String(date||'');return `${Number(value.slice(5,7))} 月 ${Number(value.slice(8,10))} 日`}

Page({
  data:{user:{theme:themeService.getInitialTheme()},date:'',task:null,status:null,imagePath:'',caption:'',todayLabel:'',busy:false,loaded:false,rewriting:false},
  async onLoad(query){this.setData({date:query.date||''});await this.load()},
  async onShow(){if(this.data.loaded&&!this._choosingImage)await this.load()},
  async load(){
    try{
      const [user,task,status]=await Promise.all([service.getCurrentUser(),service.getTodayTask(this.data.date),service.getTodayStatus(this.data.date)])
      themeService.apply(user.theme)
      const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
      this.setData({user,task,status,todayLabel:label(today),loaded:true})
      if(status.unlocked)wx.redirectTo({url:`/pages/memory/memory?date=${this.data.date}`})
    }catch(error){this.err(error)}
  },
  async choose(){try{this._choosingImage=true;this.setData({busy:true});const file=await image.choose();if(file)this.setData({imagePath:file.path})}catch(error){this.err(error)}finally{this._choosingImage=false;this.setData({busy:false})}},
  removePhoto(){this.setData({imagePath:''})},
  captionInput(e){this.setData({caption:e.detail.value})},
  async submit(){if(!this.data.imagePath)return this.err(new Error('请先选择照片'));try{this.setData({busy:true});const status=await service.submitEntry({dateKey:this.data.date,imagePath:this.data.imagePath,caption:this.data.caption,promptId:this.data.task.promptId,backfill:true});getApp().globalData.calendarRevision=(getApp().globalData.calendarRevision||0)+1;if(status.unlocked)wx.redirectTo({url:`/pages/memory/memory?date=${this.data.date}`});else this.setData({status})}catch(error){if(String(error&&error.message||'').includes('题目刚刚被对方更换'))await this.load();this.err(error)}finally{this.setData({busy:false})}},
  err(error){wx.showToast({title:safeError(error),icon:'none'})}
})
