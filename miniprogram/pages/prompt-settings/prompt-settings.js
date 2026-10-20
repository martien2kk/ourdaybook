const service=require('../../services/dataService')
const themeService=require('../../utils/theme')

Page({
  data:{user:{theme:themeService.getInitialTheme()},categories:[],categoryNames:[],customPrompts:[],newCategory:'',newPrompt:'',newPromptCategory:'',showCustomPrompts:false,canAddCategory:true,canAddPrompt:true,nextPromptDate:''},
  async onShow(){await this.load()},
  async load(){
    try{
      const [user,overview]=await Promise.all([service.getCurrentUser(),service.getPromptOverview()])
      const categoryNames=overview.categories.map(item=>item.name)
      const customCategoryCount=overview.categories.filter(item=>item.isCustom).length
      const week=7*24*60*60*1000
      const latestPromptAt=overview.customPrompts.reduce((latest,prompt)=>Math.max(latest,Date.parse(prompt.createdAt||'')||0),Date.parse(user.lastCustomPromptAt||'')||0)
      const localNextAt=latestPromptAt+week
      const locallyAvailable=!latestPromptAt||localNextAt<=Date.now()
      const canAddPrompt=locallyAvailable&&overview.canAddPrompt!==false
      const nextPromptDate=canAddPrompt?'':(overview.nextPromptDate||new Date(localNextAt).toISOString().slice(0,10))
      themeService.apply(user.theme)
      this.setData({user,categories:overview.categories,categoryNames,customPrompts:overview.customPrompts,canAddCategory:customCategoryCount<3&&overview.canAddCategory!==false,canAddPrompt,nextPromptDate,newPromptCategory:categoryNames.includes(this.data.newPromptCategory)?this.data.newPromptCategory:(categoryNames[0]||'')})
    }catch(error){this.toast(error)}
  },
  field(e){this.setData({[e.currentTarget.dataset.key]:e.detail.value})},
  async toggleCategory(e){try{await service.togglePromptCategory(e.currentTarget.dataset.name,e.detail.value);await this.load()}catch(error){this.toast(error);await this.load()}},
  async addCategory(){if(!this.data.canAddCategory)return;try{await service.addCustomCategory(this.data.newCategory);this.setData({newCategory:''});await this.load()}catch(error){this.toast(error)}},
  async removeCategory(e){const name=e.currentTarget.dataset.name;if(this.data.customPrompts.some(prompt=>prompt.category===name))return this.toast(new Error('请先删除这个大类中的自定义题目'));try{await service.deleteCustomCategory(name);await this.load()}catch(error){this.toast(error)}},
  promptCategory(e){this.setData({newPromptCategory:this.data.categoryNames[e.detail.value]})},
  async addPrompt(){if(!this.data.canAddPrompt)return;try{await service.addCustomPrompt({text:this.data.newPrompt,category:this.data.newPromptCategory});this.setData({newPrompt:'',showCustomPrompts:true});await this.load();wx.showToast({title:'题目已添加'})}catch(error){this.toast(error)}},
  toggleCustomList(){this.setData({showCustomPrompts:!this.data.showCustomPrompts})},
  editPrompt(e){const prompt=this.data.customPrompts.find(item=>item.id===e.currentTarget.dataset.id);if(!prompt)return;wx.showModal({title:'编辑自定义题目',editable:true,placeholderText:prompt.text,content:prompt.text,success:async result=>{if(result.confirm){try{await service.updateCustomPrompt(prompt.id,{text:result.content});await this.load()}catch(error){this.toast(error)}}}})},
  removePrompt(e){wx.showModal({title:'删除自定义题目？',content:'删除后无法恢复。',success:async result=>{if(result.confirm){try{await service.deleteCustomPrompt(e.currentTarget.dataset.id);await this.load()}catch(error){this.toast(error)}}}})},
  deleteAllPrompts(){wx.showModal({title:'删除全部自定义题目？',content:`将永久删除你添加的 ${this.data.customPrompts.length} 道题目。默认题目和自定义大类不会受到影响。`,confirmText:'全部删除',confirmColor:'#c64d43',success:async result=>{if(!result.confirm)return;try{wx.showLoading({title:'正在删除'});try{await service.deleteAllCustomPrompts()}catch(error){if(!String(error.message||'').includes('不支持的云端操作'))throw error;for(const prompt of this.data.customPrompts)await service.deleteCustomPrompt(prompt.id)}this.setData({showCustomPrompts:false});await this.load();wx.hideLoading();wx.showToast({title:'已全部删除'})}catch(error){wx.hideLoading();this.toast(error)}}})},
  toast(error){wx.showToast({title:error.message||'操作失败',icon:'none'})}
})
