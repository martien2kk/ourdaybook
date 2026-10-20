const palettes={
  minimal:{accent:'#9a725a',background:'#f7f4ee',surface:'#fbfaf7',tabColor:'#8b857f'},
  warm:{accent:'#c97968',background:'#e7cfb2',surface:'#f1dfc8',tabColor:'#806b61'},
  calm:{accent:'#f08fb3',background:'#111214',surface:'#171719',tabColor:'#aaa39c',frontColor:'#ffffff'},
  blue:{accent:'#8fb5ff',background:'#06163a',surface:'#081a40',tabColor:'#a8b8d8',frontColor:'#ffffff'}
}
const config=require('../config/config')
// 云端账号与旧的本地模拟账号使用不同缓存，避免首次启动读取到旧主题。
const THEME_KEY=config.APP_MODE==='cloud'?'our_daybook_cloud_theme':'day_to_day_theme'
const STATE_KEY='day_to_day_state'
let cachedTheme=''
let persistedTheme=''
let appliedTabTheme=''
function normalize(theme){
  const migrated=theme==='green'?'blue':theme
  return palettes[migrated]?migrated:'minimal'
}
function getInitialTheme(){
  if(cachedTheme)return cachedTheme
  try{
    const direct=wx.getStorageSync(THEME_KEY)
    if(palettes[direct]||direct==='green'){
      cachedTheme=normalize(direct)
      persistedTheme=cachedTheme
      if(direct!==cachedTheme)wx.setStorageSync(THEME_KEY,cachedTheme)
      return cachedTheme
    }
    const state=wx.getStorageSync(STATE_KEY)
    const current=state&&state.users&&state.users[state.currentUserId]
    cachedTheme=normalize(current&&current.theme)
    wx.setStorageSync(THEME_KEY,cachedTheme)
    persistedTheme=cachedTheme
    return cachedTheme
  }catch(error){
    cachedTheme='minimal'
    return cachedTheme
  }
}
function remember(theme){
  const next=normalize(theme)
  cachedTheme=next
  if(persistedTheme!==next){
    try{wx.setStorageSync(THEME_KEY,next);persistedTheme=next}catch(error){}
  }
  return next
}
function get(theme){return palettes[normalize(theme)]}
function syncCustomTabBar(theme){
  try{
    const pages=getCurrentPages()
    const page=pages&&pages.length?pages[pages.length-1]:null
    const tabBar=page&&typeof page.getTabBar==='function'?page.getTabBar():null
    if(tabBar&&typeof tabBar.sync==='function'){
      tabBar.sync(theme)
      return true
    }
  }catch(error){}
  return false
}
function apply(theme,options={}){
  const selected=normalize(theme)
  if(options.remember!==false)remember(selected)
  const palette=get(selected)
  if(typeof wx.setNavigationBarColor==='function')wx.setNavigationBarColor({frontColor:palette.frontColor||'#000000',backgroundColor:palette.background})
  if(typeof wx.setBackgroundColor==='function')wx.setBackgroundColor({backgroundColor:palette.background,backgroundColorTop:palette.background,backgroundColorBottom:palette.background})
  const customTabBarReady=syncCustomTabBar(selected)
  // The native tab bar can be recreated after navigation. Reapply its light-weight
  // colour style every time, while keeping the icon updates cached by theme.
  if(!customTabBarReady&&typeof wx.setTabBarStyle==='function')wx.setTabBarStyle({color:palette.tabColor||'#88827b',selectedColor:palette.accent,backgroundColor:palette.surface})
  if(!customTabBarReady&&appliedTabTheme!==selected){
    if(typeof wx.setTabBarItem==='function'){
      ;['record','together','calendar','settings'].forEach((name,index)=>wx.setTabBarItem({
        index,
        selectedIconPath:`/assets/icons/${name}${selected==='minimal'?'-minimal-active':selected==='calm'?'-space-active':selected==='blue'?'-blue-active':'-active'}.png`
      }))
    }
    appliedTabTheme=selected
  }
  return palette
}
module.exports={palettes,get,getInitialTheme,remember,apply}
