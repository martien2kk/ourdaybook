const themeService=require('../utils/theme')

const tabs=[
  {pagePath:'/pages/home/home',text:'记录',name:'record'},
  {pagePath:'/pages/unlock/unlock',text:'我们',name:'together'},
  {pagePath:'/pages/calendar/calendar',text:'日历',name:'calendar'},
  {pagePath:'/pages/settings/settings',text:'设置',name:'settings'}
]

function normalize(theme){return ['minimal','warm','calm','blue'].includes(theme)?theme:'minimal'}
function activeSuffix(theme){
  if(theme==='minimal')return '-minimal-active'
  if(theme==='calm')return '-space-active'
  if(theme==='blue')return '-blue-active'
  return '-active'
}
function buildItems(theme){
  const suffix=activeSuffix(theme)
  return tabs.map(item=>Object.assign({},item,{
    iconPath:`/assets/icons/${item.name}.png`,
    selectedIconPath:`/assets/icons/${item.name}${suffix}.png`
  }))
}
const initialTheme=themeService.getInitialTheme()

Component({
  data:{
    selected:0,
    hidden:false,
    theme:initialTheme,
    items:buildItems(initialTheme)
  },
  lifetimes:{
    attached(){this.sync()}
  },
  pageLifetimes:{
    show(){this.sync()}
  },
  methods:{
    sync(theme){
      const nextTheme=normalize(theme||themeService.getInitialTheme())
      const pages=getCurrentPages()
      const current=pages.length?`/${pages[pages.length-1].route}`:tabs[0].pagePath
      const selected=Math.max(0,tabs.findIndex(item=>item.pagePath===current))
      this.setData({selected,theme:nextTheme,items:buildItems(nextTheme)})
    },
    switchTab(event){
      const index=Number(event.currentTarget.dataset.index)
      const target=this.data.items[index]
      if(!target||index===this.data.selected)return
      this.setData({selected:index})
      wx.switchTab({url:target.pagePath})
    }
  }
})
