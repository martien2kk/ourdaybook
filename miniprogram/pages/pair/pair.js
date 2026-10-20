const service=require('../../services/dataService')
const {safeError}=require('../../utils/privacy')
const themeService=require('../../utils/theme')
const config=require('../../config/config')
const {toDateKey}=require('../../utils/date')

Page({
  data:{user:{theme:themeService.getInitialTheme()},couple:null,code:'',preview:null,sharePrePairRecords:false,historyRestoreNeedsApproval:false,historyRestoreWaiting:false,pairingActive:false},
  async onShow(){
    const [user,couple,settings]=await Promise.all([service.getCurrentUser(),service.getCouple(),service.getSettings()])
    themeService.apply(user.theme)
    const restore=couple&&couple.historyRestore
    const currentDate=config.ENABLE_DEBUG_TOOLS&&settings.mockDate?settings.mockDate:toDateKey()
    const pairingActive=Boolean(couple&&couple.spaceType==='pair'&&couple.pairingEffectiveDate&&currentDate>=couple.pairingEffectiveDate)
    this.setData({user,couple,sharePrePairRecords:Boolean(settings.sharePrePairRecords),historyRestoreNeedsApproval:Boolean(restore&&restore.status==='pending'&&!(restore.approvals||[]).includes(user.id)),historyRestoreWaiting:Boolean(restore&&restore.status==='pending'&&(restore.approvals||[]).includes(user.id)),pairingActive})
  },
  input(e){this.setData({code:e.detail.value.toUpperCase(),preview:null})},
  async create(){
    try{
      const created=await service.createCouple()
      const couple=(await service.getCouple())||created
      this.setData({couple})
    }catch(e){this.err(e)}
  },
  copy(){
    const couple=this.data.couple||{}
    const code=String(couple.inviteCode||'').trim().toUpperCase()
    if(!code)return this.err(new Error('邀请码尚未生成，请重新进入页面后再试'))
    if(couple.inviteExpired)return this.err(new Error('邀请码已过期，请先重新生成'))
    if(typeof wx.setClipboardData!=='function')return this.err(new Error('当前微信版本不支持自动复制，请长按邀请码复制'))
    this.copyInviteCode(code)
  },
  copyInviteCode(code){
    wx.setClipboardData({
      data:code,
      success:()=>wx.showToast({title:'邀请码已复制'}),
      fail:error=>{
        console.error('setClipboardData failed:',error)
        this.showManualCopyHint(code,error)
      }
    })
  },
  showManualCopyHint(code,error){
    const rawReason=String(error&&error.errMsg||'未知错误').replace(/^setClipboardData:fail\s*/i,'').trim()
    const undeclared=/api scope is not declared|privacy agreement/i.test(rawReason)
    const reason=undeclared?'当前版本暂未完成剪贴板权限配置':rawReason
    wx.showModal({
      title:'复制失败',
      content:`${reason?'原因：'+reason+'\n':''}邀请码：${code}\n请长按页面上的邀请码进行复制。`,
      showCancel:false,
      confirmText:'知道了'
    })
  },
  renew(){
    wx.showModal({
      title:'重新生成邀请码？',
      content:'旧邀请码会立即失效，新邀请码将在 7 天后过期。',
      success:async result=>{
        if(!result.confirm)return
        try{
          const renewed=await service.renewInvite()
          const couple=(await service.getCouple())||renewed
          this.setData({couple})
          wx.showToast({title:'新邀请码已生成'})
        }catch(error){this.err(error)}
      }
    })
  },
  async preview(){try{this.setData({preview:await service.previewInvite(this.data.code)})}catch(e){this.err(e)}},
  async join(){
    if(this.data.couple&&this.data.couple.inviteCode===this.data.code)return this.err(new Error('这是你自己的邀请码'))
    const members=this.data.couple&&(this.data.couple.members||this.data.couple.memberIds)||[]
    const merge=Boolean(this.data.couple&&members.length===1)
    if(merge){
      const reunion=Boolean(this.data.preview&&this.data.preview.reunionAvailable)
      wx.showModal({
        title:reunion?'找到了你们过去的共同回忆':'合并两个个人空间？',
        content:reunion?'你们曾经使用过同一个双人空间。确认后会先重新绑定，并向对方发出恢复申请；只有双方都同意，解绑前共同完成的记录才会重新显示。解绑期间的个人记录仍仅本人可见。':'确认后，两个个人空间会先完成合并，但今天仍各自记录，彼此看不到今天的内容。从明天开始，双方将看到同一道题，并按双人模式共同记录。合并前的照片和文案默认只对本人可见；合并后，双方可分别决定是否向对方开放自己的旧记录。',
        confirmText:reunion?'申请恢复':'确认合并',
        success:async result=>{if(result.confirm)await this.performJoin(reunion)}
      })
      return
    }
    await this.performJoin()
  },
  async performJoin(restoreHistory=false){try{const joined=await service.joinCouple(this.data.code,{restoreHistory});getApp().globalData.togetherPreload=null;getApp().globalData.calendarRevision=(getApp().globalData.calendarRevision||0)+1;wx.showToast({title:restoreHistory?'已发送恢复申请':joined&&joined.pairingEffectiveDate?'已合并，明日生效':'空间已合并'});setTimeout(()=>wx.switchTab({url:'/pages/home/home'}),700)}catch(e){this.err(e)}},
  joinFresh(){wx.showModal({title:'作为新的开始？',content:'你们会重新建立双人空间，但不会恢复以前的共同回忆。解绑期间及过去的个人记录仍仅本人可见。',confirmText:'重新开始',success:async result=>{if(result.confirm)await this.performJoin(false)},fail:error=>this.err(error)})},
  respondRestore(e){
    const accept=e.currentTarget.dataset.accept==='true'
    wx.showModal({title:accept?'恢复过去的共同回忆？':'保留新的开始？',content:accept?'确认后，解绑前双方共同完成的记录会重新出现在日历中；解绑期间的个人记录不会公开。':'拒绝后，本次不会恢复过去的双人历史，你们将从重新绑定后的新记录开始。',confirmText:accept?'确认恢复':'不恢复',success:async result=>{if(!result.confirm)return;try{await service.respondHistoryRestore(accept);getApp().globalData.calendarRevision=(getApp().globalData.calendarRevision||0)+1;await this.onShow();wx.showToast({title:accept?'共同回忆已恢复':'已保留新的开始'})}catch(error){this.err(error)}},fail:error=>this.err(error)})
  },
  shareHistory(e){
    const enabled=e.detail.value
    if(!enabled){this.updateHistorySharing(false);return}
    wx.showModal({title:'允许对方查看过去的记录？',content:'开启后，对方可以查看合并生效日前你的个人照片、原始题目和文案，但不能修改或删除。你可以随时关闭。',confirmText:'允许查看',success:result=>{if(result.confirm)this.updateHistorySharing(true);else this.setData({sharePrePairRecords:false})}})
  },
  async updateHistorySharing(enabled){try{await service.updateSettings({sharePrePairRecords:enabled});this.setData({sharePrePairRecords:enabled});getApp().globalData.calendarRevision=(getApp().globalData.calendarRevision||0)+1;wx.showToast({title:enabled?'已允许查看':'已恢复私密'})}catch(error){this.setData({sharePrePairRecords:!enabled});this.err(error)}},
  unbind(){
    wx.showModal({title:'解除绑定并转为个人空间？',content:'你的照片、文案和历史记录会迁入新的个人空间，并仅自己可见；对方的数据不会被带走。',confirmText:'确认解绑',success:async result=>{
      if(result.confirm){
        try{
          const couple=await service.unbindCouple()
          getApp().globalData.togetherPreload=null
          getApp().globalData.calendarRevision=(getApp().globalData.calendarRevision||0)+1
          this.setData({couple,preview:null,sharePrePairRecords:false})
          wx.showToast({title:'已进入个人空间'})
          setTimeout(()=>wx.switchTab({url:'/pages/home/home'}),700)
        }catch(error){this.err(error)}
      }
    }})
  },
  err(e){wx.showToast({title:safeError(e),icon:'none'})}
})
