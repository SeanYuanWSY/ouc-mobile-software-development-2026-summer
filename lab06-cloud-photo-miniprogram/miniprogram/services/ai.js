const config=require('../config')
const {callNative}=require('../utils/ui')
let sessionKey='', inFlight=false
const models=[{id:'deepseek-v4-flash-vision-exp',label:'V4 Flash Vision · 支持图片（实验版）',vision:true},{id:'deepseek-v4-flash',label:'V4 Flash · 仅文本',vision:false},{id:'deepseek-v4-pro',label:'V4 Pro · 仅文本',vision:false}]
let modelId=models[0].id
function setModel(id){if(!models.some(m=>m.id===id))throw new Error('无效模型');modelId=id}
function getModel(){return models.find(m=>m.id===modelId)}
const styles=[{id:'photo',label:'摄影建议'},{id:'warm',label:'温暖短评'},{id:'caption',label:'社交配文'}]
function validKey(value){return typeof value==='string' && /^sk-[A-Za-z0-9_-]{16,197}$/.test(value)}
function setKey(value){const key=typeof value==='string'?value.trim():'';if(!validKey(key))throw new Error('请填写完整的 DeepSeek API Key（以 sk- 开头）');sessionKey=key}
function clearKey(){sessionKey=''}
function isReady(){return !!sessionKey}
async function generate(photoId,style){
 const selected=getModel()
 if(!selected.vision)throw new Error('当前模型仅支持文本，请在 AI 设置中选择 Vision 视觉模型')
 if(!isReady())throw new Error('请先配置本次会话的 API Key')
 if(inFlight)throw new Error('上一条点评仍在生成，请稍候')
 inFlight=true
 try{
 const consent=await callNative('showModal',{title:'发送给 DeepSeek？',content:'使用模型：'+selected.id+'。本次会将这张照片和标题经实验云函数发送给 DeepSeek，使用你填写的 API Key 额度。结果仅作为 AI 草稿展示。',confirmText:'生成点评'})
 if(!consent.confirm)return null
 if(!sessionKey)throw new Error('API Key 已清除，请重新填写')
 let result
 try{
  const response=await wx.cloud.callFunction({name:config.aiFunction,data:{photoId,style,model:selected.id,apiKey:sessionKey},timeout:65000})
  result=response.result
 }catch(_){throw new Error('本次连接中断，可以重新点击生成')}

 const errors={PHOTO:'暂时无法读取照片，请刷新后重试',IMAGE:'图片读取失败，本次未发送给 DeepSeek，请刷新照片后重试',PROVIDER_AUTH:'DeepSeek 拒绝了 API Key，请检查是否填写正确',PROVIDER_BALANCE:'DeepSeek 账户余额不足，请检查账户额度',PROVIDER_RATE:'DeepSeek 当前请求较多，请稍后重试',MODEL:'所选模型不支持图片，请选择 Vision 视觉模型',KEY:'API Key 格式有误，请重新填写',AUTH:'请先登录微信',OWNER:'只能点评自己发布的照片',INPUT:'照片或风格无效'}
 if(!result||!result.ok)throw new Error(errors[result&&result.code]||'AI 服务暂不可用，请稍后重试；请求可能已发送')
 if(typeof result.text!=='string'||!result.text.trim())throw new Error('AI 没有返回有效点评')
 return result.text.slice(0,1200)
 }finally{inFlight=false}
}
module.exports={models,setModel,getModel,styles,validKey,setKey,clearKey,isReady,generate}
