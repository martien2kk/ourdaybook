const service=require('../../services/dataService')
const card=require('../../services/cardService')
const themeService=require('../../utils/theme')
const share=require('../../utils/share')
const {SHARE_QUOTES,PERSONAL_QUOTES,shuffledQuotes}=require('../../utils/memoryQuotes')

function nextMeetingFrom(items,currentDate){
  const upcoming=items.filter(item=>item.date>=currentDate).sort((a,b)=>a.date.localeCompare(b.date))
  if(!upcoming.length)return null
  const next=Object.assign({},upcoming[0])
  const start=new Date(`${currentDate}T12:00:00`)
  const target=new Date(`${next.date}T12:00:00`)
  next.daysUntil=Math.max(0,Math.round((target-start)/86400000))
  next.countdown=next.daysUntil===0?'就是今天':`还有 ${next.daysUntil} 天`
  next.displayDay=next.date.substring(5)
  next.displayYear=next.date.substring(0,4)
  next.summary=`${next.countdown} · ${next.city}${next.note?` · ${next.note}`:''}`
  return next
}

Page({
  data:{
    user:{theme:themeService.getInitialTheme()},
    couple:null,
    task:null,
    status:null,
    memory:null,
    nextMeeting:null,
    isPersonal:false,
    isPairPending:false,
    viewState:'idle',
    theme:'minimal',
    showLocation:true,
    themes:[['minimal','简约'],['film','胶片'],['journal','手账']],
    canvasNode:null,
    previewPath:'',
    fullPreviewPath:'',
    previewVisible:false,
    saving:false,
    downloaded:false,
    showQuote:true,
    quoteIndex:0,
    quoteOrder:[]
  },
  async onShow(){
    const theme=themeService.getInitialTheme()
    if(this.data.user.theme!==theme)this.setData({'user.theme':theme})
    themeService.apply(theme)
    this.applyPreload()
    await this.load()
  },
  applyPreload(){
    if(!['idle','loading','error'].includes(this.data.viewState))return
    const preload=getApp().globalData.togetherPreload
    if(!preload||Date.now()-(preload.loadedAt||0)>30000)return
    const {user,couple,task,status,settings={},meetings=[],memory}=preload
    if(!user)return
    const isPairPending=Boolean(status&&status.mode==='pairPending')
    const isPersonal=couple?Boolean((status&&(status.mode==='personal'||status.mode==='pairPending'))||couple.spaceType==='personal'):user.profileMode==='personal'
    if(!couple){this.setData({user,couple:null,isPersonal,isPairPending:false,theme:settings.cardTheme||this.data.theme,viewState:'unpaired'});return}
    const nextMeeting=task?nextMeetingFrom(meetings,task.dateKey):null
    if(status&&!status.hasSubmitted){this.setData({user,couple,task,status,nextMeeting,isPersonal,isPairPending,theme:settings.cardTheme||this.data.theme,viewState:'unsubmitted'});return}
    if(status&&!status.unlocked){this.setData({user,couple,task,status,nextMeeting,isPersonal,isPairPending,theme:settings.cardTheme||this.data.theme,viewState:'waiting'});return}
    if(!memory)return
    const prepared=Object.assign({},memory,{entries:memory.entries.map((entry,index)=>Object.assign({},entry,{city:(memory.users[index]&&memory.users[index].city)||''}))})
    const quoteOrder=shuffledQuotes(prepared.mode==='personal'?PERSONAL_QUOTES:SHARE_QUOTES)
    prepared.shareText=quoteOrder[0]
    this.setData({user,couple,task,status,memory:prepared,nextMeeting,quoteIndex:0,quoteOrder,isPersonal,isPairPending,theme:settings.cardTheme||this.data.theme,viewState:'unlocked'})
    setTimeout(()=>this.render(),50)
  },
  async load(){
    const previousState=this.data.viewState
    const hasContent=!['idle','loading','error'].includes(previousState)
    const loadToken=(this._loadToken||0)+1
    this._loadToken=loadToken
    let loadingTimer
    if(!hasContent){
      loadingTimer=setTimeout(()=>{
        if(this._loadToken===loadToken&&this.data.viewState==='idle')this.setData({viewState:'loading'})
      },400)
    }
    try{
      const [user,couple,settings]=await Promise.all([
        service.getCurrentUser(),
        service.getCouple(),
        service.getSettings()
      ])
      themeService.apply(user.theme)
      const profilePersonal=user.profileMode==='personal'
      if(!couple){
        getApp().globalData.togetherPreload={user,couple:null,task:null,status:null,settings,meetings:[],loadedAt:Date.now()}
        this.setData({user,couple:null,isPersonal:profilePersonal,isPairPending:false,theme:settings.cardTheme||'minimal',viewState:'unpaired'})
        return
      }
      const [task,status,meetings]=await Promise.all([service.getTodayTask(),service.getTodayStatus(),service.getMeetings()])
      const nextMeeting=nextMeetingFrom(meetings,task.dateKey)
      const isPairPending=status.mode==='pairPending'
      const isPersonal=Boolean(status.mode==='personal'||isPairPending||couple.spaceType==='personal')
      if(!status.hasSubmitted){
        getApp().globalData.togetherPreload={user,couple,task,status,settings,meetings,loadedAt:Date.now()}
        this.setData({user,couple,task,status,nextMeeting,isPersonal,isPairPending,theme:settings.cardTheme||'minimal',viewState:'unsubmitted'})
        return
      }
      if(!status.unlocked){
        getApp().globalData.togetherPreload={user,couple,task,status,settings,meetings,loadedAt:Date.now()}
        this.setData({user,couple,task,status,nextMeeting,isPersonal,isPairPending,theme:settings.cardTheme||'minimal',viewState:'waiting'})
        return
      }
      const memory=await service.getMemory(task.dateKey)
      getApp().globalData.togetherPreload={user,couple,task,status,memory,settings,meetings,loadedAt:Date.now()}
      memory.entries=memory.entries.map((entry,index)=>Object.assign({},entry,{city:(memory.users[index]&&memory.users[index].city)||''}))
      const quoteOrder=shuffledQuotes(memory.mode==='personal'?PERSONAL_QUOTES:SHARE_QUOTES)
      memory.shareText=quoteOrder[0]
      this.setData({user,couple,task,status,memory,nextMeeting,quoteIndex:0,quoteOrder,isPersonal,isPairPending,theme:settings.cardTheme||'minimal',viewState:'unlocked'})
      setTimeout(()=>this.render(),100)
    }catch(error){
      if(!hasContent)this.setData({viewState:'error'})
      wx.showToast({title:error.message||'加载失败',icon:'none'})
    }finally{
      if(loadingTimer)clearTimeout(loadingTimer)
    }
  },
  async render(){
    if(!this.data.memory)return
    try{
      const node=await card.render('#cardCanvas',this.data.memory,this.data.theme,{showLocation:this.data.showLocation,showQuote:this.data.showQuote,full:false})
      const previewPath=await card.save(node)
      this.setData({canvasNode:node,previewPath})
    }catch(error){wx.showToast({title:'卡片生成失败，可重试',icon:'none'})}
  },
  async renderFull(){
    const node=await card.render('#cardCanvasFull',this.data.memory,this.data.theme,{showLocation:this.data.showLocation,showQuote:this.data.showQuote,full:true})
    const fullPreviewPath=await card.save(node)
    this.setData({fullPreviewPath})
    return fullPreviewPath
  },
  theme(e){
    const theme=e.currentTarget.dataset.theme
    service.updateSettings({cardTheme:theme})
    this.setData({theme,previewPath:''},()=>this.render())
  },
  location(e){this.setData({showLocation:e.detail.value,previewPath:''},()=>this.render())},
  quoteVisibility(e){this.setData({showQuote:e.detail.value,previewPath:''},()=>this.render())},
  pair(){wx.navigateTo({url:'/pages/pair/pair'})},
  goRecord(){wx.switchTab({url:'/pages/home/home'})},
  openMeeting(){wx.navigateTo({url:'/pages/meeting/meeting'})},
  copy(){if(this.data.memory)wx.setClipboardData({data:this.data.memory.shareText})},
  switchQuote(){
    if(!this.data.memory)return
    const quoteOrder=this.data.quoteOrder.length?this.data.quoteOrder:shuffledQuotes(this.data.memory.mode==='personal'?PERSONAL_QUOTES:SHARE_QUOTES)
    const quoteIndex=(this.data.quoteIndex+1)%quoteOrder.length
    this.setData({quoteIndex,quoteOrder,'memory.shareText':quoteOrder[quoteIndex],previewPath:''},()=>this.render())
  },
  setTabHidden(hidden){try{const tab=this.getTabBar&&this.getTabBar();if(tab)tab.setData({hidden})}catch(error){}},
  async save(){
    wx.showLoading({title:'正在生成高清预览',mask:true})
    try{
      const path=await this.renderFull()
      if(!path)throw new Error('卡片尚未生成')
      this.setTabHidden(true)
      this.setData({previewVisible:true,downloaded:false})
    }catch(error){wx.showToast({title:'卡片预览失败，请重试',icon:'none'})}finally{wx.hideLoading()}
  },
  closePreview(){this.setData({previewVisible:false,saving:false,downloaded:false,fullPreviewPath:''});this.setTabHidden(false)},
  stop(){},
  async confirmSave(){
    if(this.data.saving)return
    try{
      this.setData({saving:true})
      const path=this.data.fullPreviewPath
      if(!path)throw new Error('卡片尚未生成')
      await new Promise((resolve,reject)=>wx.saveImageToPhotosAlbum({filePath:path,success:resolve,fail:reject}))
      wx.showToast({title:'已保存到相册'})
      this.setData({saving:false,downloaded:true})
    }catch(error){
      this.setData({saving:false})
      wx.showModal({title:'保存失败',content:'请在微信设置中允许保存到相册，然后重试。',showCancel:false})
    }
  },
  onHide(){this.setTabHidden(false)},
  onShareAppMessage(){return share.appMessage()},
  onShareTimeline(){return share.timeline()}
})
