const service=require('../../services/dataService')
const card=require('../../services/cardService')
const themeService=require('../../utils/theme')

Page({
  data:{
    user:{theme:themeService.getInitialTheme()},
    memory:null,
    theme:'minimal',
    showLocation:true,
    themes:[['minimal','简约'],['film','胶片'],['journal','手账']],
    canvasNode:null,
    previewPath:'',
    fullPreviewPath:'',
    previewVisible:false,
    saving:false,
    downloaded:false
  },
  async onLoad(query){
    try{
      const [user,memory,settings]=await Promise.all([
        service.getCurrentUser(),
        service.getMemory(query.date),
        service.getSettings()
      ])
      themeService.apply(user.theme)
      this.setData({user,memory,theme:settings.cardTheme||'minimal'})
      setTimeout(()=>this.render(),100)
    }catch(error){
      wx.showModal({title:'无法生成卡片',content:error.message||'这一天尚未共同完成',showCancel:false,success:()=>wx.navigateBack()})
    }
  },
  async render(){
    if(!this.data.memory)return
    try{
      const node=await card.render('#historyCanvas',this.data.memory,this.data.theme,{showLocation:this.data.showLocation,full:false})
      const previewPath=await card.save(node)
      this.setData({canvasNode:node,previewPath})
    }catch(error){wx.showToast({title:'卡片生成失败，可重试',icon:'none'})}
  },
  async renderFull(){
    const node=await card.render('#historyCanvasFull',this.data.memory,this.data.theme,{showLocation:this.data.showLocation,full:true})
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
  copy(){wx.setClipboardData({data:this.data.memory.shareText})},
  async save(){
    wx.showLoading({title:'正在生成高清预览',mask:true})
    try{
      const path=await this.renderFull()
      if(!path)throw new Error('卡片尚未生成')
      this.setData({previewVisible:true,downloaded:false})
    }catch(error){wx.showToast({title:'卡片预览失败，请重试',icon:'none'})}finally{wx.hideLoading()}
  },
  closePreview(){this.setData({previewVisible:false,saving:false,downloaded:false,fullPreviewPath:''})},
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
    }catch(error){this.setData({saving:false});wx.showModal({title:'保存失败',content:'请允许保存到相册后重试。',showCancel:false})}
  }
})
