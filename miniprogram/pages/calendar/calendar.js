const service=require('../../services/dataService')
const themeService=require('../../utils/theme')
const {toDateKey}=require('../../utils/date')
const share=require('../../utils/share')

function pad(value){return String(value).padStart(2,'0')}

function buildMonths(year,records,currentDate){
  const statusMap={}
  records.forEach(item=>{statusMap[item.dateKey]=item.status})
  const currentMonth=Number(currentDate.substring(5,7))
  return Array.from({length:12},(_,monthIndex)=>{
    const month=monthIndex+1
    const firstWeekday=new Date(year,monthIndex,1).getDay()
    const dayCount=new Date(year,month,0).getDate()
    const cells=[]
    for(let index=0;index<firstWeekday;index+=1)cells.push({key:`blank-start-${index}`,blank:true})
    for(let day=1;day<=dayCount;day+=1){
      const dateKey=`${year}-${pad(month)}-${pad(day)}`
      const future=dateKey>currentDate
      cells.push({
        key:dateKey,
        dateKey,
        day,
        status:future?'future':(statusMap[dateKey]||'empty'),
        today:dateKey===currentDate
      })
    }
    while(cells.length%7!==0)cells.push({key:`blank-end-${cells.length}`,blank:true})
    return {
      number:month,
      label:`${month} 月`,
      current:Number(year)===Number(currentDate.substring(0,4))&&month===currentMonth,
      cells
    }
  })
}

Page({
  data:{
    user:{theme:themeService.getInitialTheme()},
    year:new Date().getFullYear(),
    currentDate:toDateKey(),
    months:[],
    summary:{complete:0,waiting:0,bestStreak:0},
    weekdays:['日','一','二','三','四','五','六'],
    loading:true,
    hasPositioned:false
  },
  async onShow(){
    const theme=themeService.getInitialTheme()
    if(this.data.user.theme!==theme)this.setData({'user.theme':theme})
    themeService.apply(theme)
    const revision=getApp().globalData.calendarRevision||0
    const cacheFresh=this.data.months.length&&this._loadedRevision===revision&&Date.now()-(this._lastLoadedAt||0)<10000
    if(cacheFresh)return
    await this.load({positionCurrent:!this.data.hasPositioned,silent:this.data.months.length>0})
  },
  async load(options={}){
    if(this._loading)return this._loading
    if(!options.silent)this.setData({loading:true})
    this._loading=(async()=>{
    const user=await service.getCurrentUser()
    themeService.apply(user.theme)
    try{
      const result=await service.getCalendarYear(this.data.year)
      const months=buildMonths(result.year,result.days,result.currentDate)
      this.setData({
        user,
        year:result.year,
        currentDate:result.currentDate,
        months,
        summary:result.summary,
        loading:false
      })
      this._lastLoadedAt=Date.now()
      this._loadedRevision=getApp().globalData.calendarRevision||0
      if(options.positionCurrent&&Number(result.year)===Number(result.currentDate.substring(0,4))){
        this.positionToMonth(Number(result.currentDate.substring(5,7)))
      }
    }catch(error){
      this.setData({user,loading:false})
    }
    })()
    try{return await this._loading}finally{this._loading=null}
  },
  positionToMonth(month){
    setTimeout(()=>{
      wx.pageScrollTo({selector:`#month-${month}`,offsetTop:-110,duration:300})
      this.setData({hasPositioned:true})
    },80)
  },
  async previousYear(){
    this.setData({year:this.data.year-1,hasPositioned:true})
    await this.load({silent:false})
    wx.pageScrollTo({scrollTop:0,duration:250})
  },
  async nextYear(){
    this.setData({year:this.data.year+1,hasPositioned:true})
    await this.load({silent:false})
    wx.pageScrollTo({scrollTop:0,duration:250})
  },
  async goCurrent(){
    const currentYear=Number(this.data.currentDate.substring(0,4))
    const currentMonth=Number(this.data.currentDate.substring(5,7))
    if(this.data.year!==currentYear){
      this.setData({year:currentYear})
      await this.load({silent:false})
    }
    this.positionToMonth(currentMonth)
  },
  openDay(e){
    const {date,status,blank}=e.currentTarget.dataset
    if(blank)return
    if(status==='complete')return wx.navigateTo({url:`/pages/memory/memory?date=${date}`})
    if(status==='waiting')return wx.navigateTo({url:`/pages/backfill/backfill?date=${date}`})
    if(status==='future')return wx.showToast({title:'未来的回忆还没发生',icon:'none'})
    wx.showToast({title:'这一天还没有记录',icon:'none'})
  },
  onShareAppMessage(){return share.appMessage()},
  onShareTimeline(){return share.timeline()}
})
