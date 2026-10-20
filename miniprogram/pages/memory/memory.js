const service=require('../../services/dataService')
const themeService=require('../../utils/theme')
const {SHARE_QUOTES,PERSONAL_QUOTES}=require('../../utils/memoryQuotes')
function backfillLabel(value){if(!value)return '';const date=new Date(value);if(Number.isNaN(date.getTime()))return '';return `补写于 ${date.getMonth()+1} 月 ${date.getDate()} 日`}
Page({
  data:{memory:null,date:'',theme:themeService.getInitialTheme(),quoteOrder:[],quoteIndex:0},
  async onLoad(query){
    themeService.apply(this.data.theme)
    try{
      const memory=await service.getMemory(query.date)
      memory.entries=(Array.isArray(memory.entries)?memory.entries:[]).map((item,index)=>item?Object.assign({},item,{nickname:(memory.users[index]&&memory.users[index].nickname)||'另一半',taskPrompt:memory.entryTasks&&memory.entryTasks[index]&&memory.entryTasks[index].prompt?memory.entryTasks[index].prompt.text:'',backfillLabel:backfillLabel(item.backfilledAt)}):null).filter(Boolean)
      const source=memory.mode==='personal'?PERSONAL_QUOTES:SHARE_QUOTES
      const quoteOrder=[memory.shareText].concat(source.filter(item=>item!==memory.shareText))
      this.setData({date:query.date,memory,quoteOrder,quoteIndex:0})
    }catch(error){wx.showToast({title:error.message,icon:'none'})}
  },
  switchQuote(){
    if(!this.data.memory||!this.data.quoteOrder.length)return
    const quoteIndex=(this.data.quoteIndex+1)%this.data.quoteOrder.length
    this.setData({quoteIndex,'memory.shareText':this.data.quoteOrder[quoteIndex]})
  },
  card(){wx.navigateTo({url:`/pages/card/card?date=${this.data.date}`})},
  remove(){wx.showModal({title:'删除自己的记录？',content:'删除后这一天会重新锁定，照片和文案将立即删除且无法恢复。',confirmText:'确认删除',confirmColor:'#c64d43',success:async result=>{if(result.confirm){await service.deleteEntry(this.data.date);getApp().globalData.calendarRevision=(getApp().globalData.calendarRevision||0)+1;wx.navigateBack()}}})}
})
