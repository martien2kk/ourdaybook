const service=require('../../services/dataService')
const image=require('../../services/imageService')
const {safeError}=require('../../utils/privacy')
const themeService=require('../../utils/theme')
const share=require('../../utils/share')

// Canvas 2D in some WeChat runtimes ignores ctx.filter. Build the soft
// background from several slightly shifted copies so the blur is preserved
// in the exported JPEG and therefore remains identical after cloud upload.
function drawBakedBlur(ctx,source,x,y,width,height){
  ctx.save()
  ctx.fillStyle='#202124';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height)
  ctx.globalAlpha=.075
  ;[-18,-9,0,9,18].forEach(dx=>[-18,-9,0,9,18].forEach(dy=>ctx.drawImage(source,x+dx,y+dy,width,height)))
  ctx.restore()
  ctx.fillStyle='rgba(16,16,18,.2)';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height)
}

Page({
  data:{user:{theme:themeService.getInitialTheme()},couple:null,task:null,status:null,imagePath:'',caption:'',busy:false,loaded:false,loadingVisible:false,cropVisible:false,cropSource:'',cropStyle:'',cropBusy:false},
  async onShow(){
    if(this._choosingImage)return
    const theme=themeService.getInitialTheme()
    if(this.data.user.theme!==theme)this.setData({'user.theme':theme})
    themeService.apply(theme)
    await this.load()
  },
  async load(){
    const hasContent=this.data.loaded
    let loadingTimer
    if(!hasContent)loadingTimer=setTimeout(()=>this.setData({loadingVisible:true}),250)
    try{
      const snapshot=await service.getHomeSnapshot()
      const user=snapshot.user
      themeService.apply(user.theme)
      if(!user.onboarded)return wx.redirectTo({url:'/pages/onboarding/onboarding'})
      const couple=snapshot.couple
      if(!couple){
        this.setData({user,couple:null,task:null,status:null,imagePath:'',caption:'',loaded:true,loadingVisible:false})
        this.preloadTogether({user,couple:null,task:null,status:null})
        return
      }
      const task=snapshot.task,status=snapshot.status
      const sameDraftDay=this.data.task&&this.data.task.dateKey===task.dateKey
      this.setData({user,couple,task,status,imagePath:status.myEntry?status.myEntry.imagePath:(sameDraftDay?this.data.imagePath:''),caption:status.myEntry?status.myEntry.caption:(sameDraftDay?this.data.caption:''),loaded:true,loadingVisible:false})
      this.preloadTogether({user,couple,task,status})
      if(snapshot.pendingNotice)this.showPendingNotice(snapshot.pendingNotice)
      else this.showHistoryRestoreNotice(snapshot.pendingRestoreNotice)
    }catch(e){this.err(e)}finally{if(loadingTimer)clearTimeout(loadingTimer)}
  },
  showPendingNotice(notice){
    if(!notice||this._shownNoticeId===notice.id)return
    this._shownNoticeId=notice.id
    wx.showModal({
      title:'双人空间状态更新',
      content:`${notice.nickname||'对方'}已解除绑定。你的个人资料和本人记录仍会保留；之后可以在“双人空间”中重新邀请其他人。`,
      showCancel:false,
      confirmText:'我知道了',
      complete:()=>service.acknowledgeNotice(notice.id).catch(()=>{this._shownNoticeId=''})
    })
  },
  showHistoryRestoreNotice(notice){
    if(!notice||this._shownRestoreNoticeId===notice.id)return
    this._shownRestoreNoticeId=notice.id
    wx.showModal({
      title:'共同回忆恢复申请',
      content:'对方希望恢复你们解绑前共同完成的记录。只有你也同意后，过去的双人回忆才会重新显示；解绑期间的个人记录不会公开。',
      cancelText:'稍后处理',
      confirmText:'前往处理',
      success:result=>{if(result.confirm)wx.navigateTo({url:'/pages/pair/pair'})},
      complete:()=>service.acknowledgeHistoryRestoreNotice(notice.id).catch(()=>{this._shownRestoreNoticeId=''})
    })
  },
  preloadTogether(base){
    const app=getApp()
    app.globalData.togetherPreload=Object.assign({},base,{loadedAt:Date.now()})
    if(!base.status||!base.status.unlocked)return
    Promise.all([service.getMemory(base.task.dateKey),service.getSettings(),service.getMeetings()])
      .then(([memory,settings,meetings])=>{
        const current=app.globalData.togetherPreload
        if(!current||!current.task||current.task.dateKey!==base.task.dateKey)return
        app.globalData.togetherPreload=Object.assign({},base,{memory,settings,meetings,loadedAt:Date.now()})
      })
      .catch(()=>{})
  },
  async choose(){
    if(this.data.status&&this.data.status.hasSubmitted)return
    try{
      this._choosingImage=true
      this.setData({busy:true})
      const file=await image.choose()
      if(file)await this.openCrop(file.path)
    }catch(e){this.err(e)}finally{this._choosingImage=false;this.setData({busy:false})}
  },
  async openCrop(path){
    const info=await new Promise((resolve,reject)=>wx.getImageInfo({src:path,success:resolve,fail:reject}))
    this._cropImage={path,width:info.width,height:info.height}
    await new Promise(resolve=>this.setData({cropVisible:true,cropSource:path},resolve))
    const frame=await new Promise((resolve,reject)=>wx.createSelectorQuery().select('#liveCropFrame').boundingClientRect(rect=>rect?resolve(rect):reject(new Error('照片调整区域初始化失败'))).exec())
    const cover=Math.max(frame.width/info.width,frame.height/info.height)
    const contain=Math.min(frame.width/info.width,frame.height/info.height)
    const minScale=contain/cover
    // Default to the same edge-to-edge fill used by the final memory view.
    // `minScale` remains the contain size, so users can pinch out to reveal
    // the complete photo and use the baked blurred background if preferred.
    const defaultScale=1
    const baseW=info.width*cover,baseH=info.height*cover
    this._crop={frameW:frame.width,frameH:frame.height,baseW,baseH,minScale,defaultScale,scale:defaultScale,x:(frame.width-baseW*defaultScale)/2,y:(frame.height-baseH*defaultScale)/2}
    this.updateCropStyle()
  },
  updateCropStyle(){
    const c=this._crop;if(!c)return
    const w=c.baseW*c.scale,h=c.baseH*c.scale
    this.setData({cropStyle:`width:${w}px;height:${h}px;left:${c.x}px;top:${c.y}px;`})
  },
  clampCrop(){
    const c=this._crop;if(!c)return
    const w=c.baseW*c.scale,h=c.baseH*c.scale
    c.x=w<=c.frameW?(c.frameW-w)/2:Math.min(0,Math.max(c.frameW-w,c.x))
    c.y=h<=c.frameH?(c.frameH-h)/2:Math.min(0,Math.max(c.frameH-h,c.y))
  },
  cropTouchStart(e){
    const touches=e.touches||[],c=this._crop;if(!c||!touches.length)return
    if(touches.length>1){
      const a=touches[0],b=touches[1],midX=(a.clientX+b.clientX)/2,midY=(a.clientY+b.clientY)/2
      this._cropGesture={pinch:true,distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),scale:c.scale,x:c.x,y:c.y,midX,midY}
    }else this._cropGesture={pinch:false,touchX:touches[0].clientX,touchY:touches[0].clientY,x:c.x,y:c.y,moved:false,startedAt:Date.now()}
  },
  cropTouchMove(e){
    const touches=e.touches||[],g=this._cropGesture,c=this._crop;if(!g||!c||!touches.length)return
    if(touches.length>1&&g.pinch){
      const a=touches[0],b=touches[1],distance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),midX=(a.clientX+b.clientX)/2,midY=(a.clientY+b.clientY)/2
      const scale=Math.max(c.minScale,Math.min(4,g.scale*distance/Math.max(1,g.distance)))
      const imageX=(g.midX-g.x)/(c.baseW*g.scale),imageY=(g.midY-g.y)/(c.baseH*g.scale)
      c.scale=scale;c.x=midX-imageX*c.baseW*scale;c.y=midY-imageY*c.baseH*scale
    }else if(!g.pinch){
      const dx=touches[0].clientX-g.touchX,dy=touches[0].clientY-g.touchY
      if(Math.abs(dx)>5||Math.abs(dy)>5)g.moved=true
      c.x=g.x+dx;c.y=g.y+dy
    }
    this.clampCrop();this.updateCropStyle()
  },
  cropTouchEnd(){
    const gesture=this._cropGesture
    this._cropGesture=null
    if(!gesture||gesture.pinch||gesture.moved||Date.now()-gesture.startedAt>350)return
    const now=Date.now()
    if(this._lastCropTap&&now-this._lastCropTap<320){
      this._lastCropTap=0
      this.resetCrop()
      return
    }
    this._lastCropTap=now
  },
  cropTouchCancel(){this._cropGesture=null},
  resetCrop(){
    const c=this._crop;if(!c)return
    c.scale=c.defaultScale||c.minScale;c.x=(c.frameW-c.baseW*c.scale)/2;c.y=(c.frameH-c.baseH*c.scale)/2;this.updateCropStyle()
  },
  async useCrop(){
    if(this.data.cropBusy||!this._crop||!this._cropImage)return
    try{
      this.setData({cropBusy:true})
      const canvas=await new Promise((resolve,reject)=>wx.createSelectorQuery().select('#cropOutputCanvas').fields({node:true,size:true}).exec(result=>result&&result[0]?resolve(result[0]):reject(new Error('照片生成失败'))))
      const node=canvas.node,ctx=node.getContext('2d'),outW=720,outH=Math.max(1,Math.round(outW*this._crop.frameH/this._crop.frameW))
      node.width=outW;node.height=outH
      const source=await new Promise((resolve,reject)=>{const item=node.createImage();item.onload=()=>resolve(item);item.onerror=reject;item.src=this._cropImage.path})
      const c=this._crop,renderW=c.baseW*c.scale,renderH=c.baseH*c.scale
      const backgroundScale=Math.max(outW/this._cropImage.width,outH/this._cropImage.height)*1.14
      const backgroundW=this._cropImage.width*backgroundScale,backgroundH=this._cropImage.height*backgroundScale
      drawBakedBlur(ctx,source,(outW-backgroundW)/2,(outH-backgroundH)/2,backgroundW,backgroundH)
      const outputScale=outW/c.frameW
      ctx.drawImage(source,c.x*outputScale,c.y*outputScale,renderW*outputScale,renderH*outputScale)
      const tempPath=await new Promise((resolve,reject)=>wx.canvasToTempFilePath({canvas:node,fileType:'jpg',quality:.86,success:result=>resolve(result.tempFilePath),fail:reject}))
      const prepared=await image.persist({path:tempPath})
      await image.remove(this.data.cropSource)
      this.setData({imagePath:prepared.path,cropVisible:false,cropSource:'',cropStyle:''})
      this._crop=null;this._cropImage=null
    }catch(error){this.err(error)}finally{this.setData({cropBusy:false})}
  },
  async closeCrop(){
    if(this.data.cropBusy)return
    await image.remove(this.data.cropSource)
    this._crop=null;this._cropImage=null;this._cropGesture=null
    this.setData({cropVisible:false,cropSource:'',cropStyle:''})
  },
  remove(){
    if(!this.data.status||!this.data.status.hasSubmitted){
      this.setData({imagePath:''})
      return
    }
    wx.showModal({
      title:'删除今天的记录？',
      content:this.data.status.unlocked?'删除后今天会重新锁定，照片和文案将立即删除且无法恢复。':'照片和文案将立即删除且无法恢复，之后可以重新填写。',
      confirmText:'确认移除',
      confirmColor:'#c64d43',
      success:async result=>{
        if(!result.confirm)return
        try{
          this.setData({busy:true})
          await service.deleteEntry(this.data.task.dateKey)
          getApp().globalData.calendarRevision=(getApp().globalData.calendarRevision||0)+1
          const status=await service.getTodayStatus(this.data.task.dateKey)
          this.setData({status,imagePath:'',caption:''})
          this.preloadTogether({user:this.data.user,couple:this.data.couple,task:this.data.task,status})
          wx.showToast({title:'已移除'})
        }catch(error){this.err(error)}finally{this.setData({busy:false})}
      }
    })
  },
  caption(e){
    if(this.data.status&&this.data.status.hasSubmitted)return
    this.setData({caption:e.detail.value})
  },
  async submit(){
    if(this.data.status&&this.data.status.hasSubmitted)return
    if(!this.data.imagePath)return this.err(new Error('请先选择照片'))
    try{
      this.setData({busy:true})
      const status=await service.submitEntry({imagePath:this.data.imagePath,caption:this.data.caption,promptId:this.data.task.promptId})
      getApp().globalData.calendarRevision=(getApp().globalData.calendarRevision||0)+1
      this.setData({status,imagePath:status.myEntry&&status.myEntry.imagePath?status.myEntry.imagePath:this.data.imagePath})
      this.preloadTogether({user:this.data.user,couple:this.data.couple,task:this.data.task,status})
      wx.showToast({title:status.mode==='personal'||status.mode==='pairPending'?'今天已收藏':status.unlocked?'共同完成！':'已上传'})
    }catch(e){
      if(String(e&&e.message||'').includes('题目刚刚被对方更换'))await this.load()
      this.err(e)
    }finally{this.setData({busy:false})}
  },
  refreshTask(){
    if(!this.data.task.switchAvailable||this.data.status.hasSubmitted||this.data.status.partnerSubmitted)return
    if(this.data.task.nextAction!=='new')return this.advanceTask()
    wx.showModal({
      title:'换一道新题？',
      content:this.data.task.unlimitedRefresh?'当前为 Mock 测试模式，可以无限发现新题。已经看过的题目之后仍可循环查看。':`今天还可以发现 ${this.data.task.refreshRemaining} 道新题。已经看过的题目之后仍可循环查看。`,
      confirmText:'确认更换',
      success:async result=>{
        if(!result.confirm)return
        await this.advanceTask()
      }
    })
  },
  async advanceTask(){
    try{
      this.setData({busy:true})
      const previousAction=this.data.task.nextAction
      const task=await service.refreshTodayTask(this.data.task.dateKey)
      this.setData({task})
      if(previousAction==='new')wx.showToast({title:'已换一道新题'})
    }catch(error){
      if(String(error&&error.message||'').includes('已有成员提交'))await this.load()
      this.err(error)
    }finally{this.setData({busy:false})}
  },
  async createPersonal(){
    try{
      this.setData({busy:true})
      await service.createPersonalSpace()
      await this.load()
      wx.showToast({title:'个人空间已建立'})
    }catch(error){this.err(error)}finally{this.setData({busy:false})}
  },
  openUnlock(){wx.switchTab({url:'/pages/unlock/unlock'})},
  pair(){wx.navigateTo({url:'/pages/pair/pair'})},
  err(e){wx.showToast({title:safeError(e),icon:'none'})},
  onShareAppMessage(){return share.appMessage()},
  onShareTimeline(){return share.timeline()}
})
