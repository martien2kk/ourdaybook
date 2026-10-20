const service=require('../../services/dataService')
const themeService=require('../../utils/theme')
const {safeError}=require('../../utils/privacy')
const {toDateKey,addDays}=require('../../utils/date')

const LATEST_ANNOUNCEMENT='2026-08-19-v1.1.6'
const REMINDER_TEMPLATE_ID='UtBAtyOSHy3hFX940-yGM1zxKDKhqdsoTXt97DWVREw'

Page({
  data:{
    user:{theme:themeService.getInitialTheme()},
    reminderDate:addDays(toDateKey(),1),
    reminderTime:'20:00',
    reminderScheduled:false,
    scheduling:false,
    announcements:[
      {id:LATEST_ANNOUNCEMENT,date:'2026-08-19',title:'版本 1.1.6 更新',body:'优化了个人空间重新绑定后的共同回忆恢复流程，恢复申请现会及时提醒另一方处理。同时修复了解绑后仍显示旧合并状态、生效日期文案未更新，以及相同题目被误判为不同的问题。'},
      {id:'2026-08-18-v1.1.5',date:'2026-08-18',title:'版本 1.1.5 更新',body:'新增“思念”每日问题大类，也优化了部分题目的表达。选择照片后可以直接预览记录页效果，支持拖动、双指缩放和双击重置，让横图、竖图都能更自由地调整构图。'},
      {id:'2026-08-04-data-controls',date:'2026-08-04',title:'数据管理方式更新',body:'设置页现仅保留“删除我的全部数据”。提交删除后有 24 小时恢复期，期间可随时撤回。'},
      {id:'2026-08-04-backfill',date:'2026-08-04',title:'错过的那一天，也可以补写',body:'未填写的一方可以在回忆日历中补写当天记录。单条记录删除后不可恢复，但仍可以重新补写。'}
    ]
  },
  async onLoad(){
    try{
      const [user,settings]=await Promise.all([service.getCurrentUser(),service.getSettings()])
      themeService.apply(user.theme)
      const reminderDate=addDays(toDateKey(),1)
      const reminder=await service.getReminder(reminderDate).catch(()=>null)
      this.setData({user,reminderDate,reminderScheduled:Boolean(reminder&&reminder.status==='pending')})
      if(settings.announcementSeenVersion!==LATEST_ANNOUNCEMENT)await service.updateSettings({announcementSeenVersion:LATEST_ANNOUNCEMENT})
    }catch(error){wx.showToast({title:safeError(error),icon:'none'})}
  },
  subscribeReminder(){
    if(this.data.scheduling)return
    if(typeof wx.requestSubscribeMessage!=='function')return wx.showToast({title:'当前微信版本不支持订阅消息',icon:'none'})
    this.setData({scheduling:true})
    wx.requestSubscribeMessage({
      tmplIds:[REMINDER_TEMPLATE_ID],
      success:async result=>{
        if(result[REMINDER_TEMPLATE_ID]!=='accept'){
          this.setData({scheduling:false})
          wx.showToast({title:'未开启本次提醒',icon:'none'})
          return
        }
        try{
          await service.scheduleReminder({dateKey:this.data.reminderDate})
          this.setData({reminderScheduled:true,scheduling:false})
          wx.showToast({title:'明天会提醒你',icon:'none'})
        }catch(error){this.setData({scheduling:false});wx.showToast({title:safeError(error),icon:'none'})}
      },
      fail:error=>{this.setData({scheduling:false});if(!String(error.errMsg||'').includes('cancel'))wx.showToast({title:safeError(error),icon:'none'})}
    })
  },
  async cancelDailyReminder(){
    try{await service.cancelReminder(this.data.reminderDate);this.setData({reminderScheduled:false});wx.showToast({title:'已取消明天提醒',icon:'none'})}catch(error){wx.showToast({title:safeError(error),icon:'none'})}
  }
})
