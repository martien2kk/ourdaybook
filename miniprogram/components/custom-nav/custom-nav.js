function getNavigationMetrics(){
  let statusBarHeight=20
  let navBarHeight=44
  try{
    const windowInfo=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync()
    statusBarHeight=windowInfo.statusBarHeight||statusBarHeight
    const menu=wx.getMenuButtonBoundingClientRect()
    if(menu&&menu.top&&menu.height)navBarHeight=(menu.top-statusBarHeight)*2+menu.height
  }catch(error){}
  return {statusBarHeight,navBarHeight,navTotalHeight:statusBarHeight+navBarHeight}
}

Component({
  properties:{
    title:{type:String,value:''},
    theme:{type:String,value:'minimal'},
    showBack:{type:Boolean,value:false}
  },
  data:{statusBarHeight:20,navBarHeight:44,navTotalHeight:64},
  methods:{back(){wx.navigateBack({delta:1})}},
  lifetimes:{
    attached(){this.setData(getNavigationMetrics())}
  }
})
