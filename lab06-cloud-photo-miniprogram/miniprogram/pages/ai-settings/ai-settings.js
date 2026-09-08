const ai=require('../../services/ai')
Page({
 data:{models:ai.models,modelIndex:0,model:ai.getModel(),ready:false,error:'',formVersion:0,showForm:true},
 chooseModel(e){const i=Number(e.detail.value);if(!ai.models[i])return;ai.setModel(ai.models[i].id);this.setData({modelIndex:i,model:ai.getModel()})},
 onShow(){this.setData({ready:ai.isReady(),error:'',model:ai.getModel(),modelIndex:ai.models.findIndex(m=>m.id===ai.getModel().id)})},
 onHide(){this.discardInput()},
 onUnload(){this.draftKey=''},
 input(e){this.draftKey=e.detail.value},
 discardInput(){this.draftKey='';this.setData({showForm:false});wx.nextTick(()=>this.setData({showForm:true}))},
 save(){try{ai.setKey(this.draftKey||'');this.discardInput();this.setData({ready:true,error:''});wx.showToast({title:'本次会话已配置'})}catch(_){this.setData({error:'请输入完整的 DeepSeek API Key，以 sk- 开头，不包含空格或换行。'})}},
 clear(){ai.clearKey();this.discardInput();this.setData({ready:false,error:''});wx.showToast({title:'Key 已清除'})},
 home(){wx.reLaunch({url:'/pages/index/index'})}
})
