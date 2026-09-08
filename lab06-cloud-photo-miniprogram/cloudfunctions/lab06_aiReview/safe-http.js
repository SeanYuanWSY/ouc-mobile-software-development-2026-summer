const https=require('https')
function request(url,options,body,maxBytes,deadline){
 if(deadline<=Date.now())return Promise.reject(new Error('TRANSPORT'))
 return new Promise((resolve,reject)=>{
  let done=false, timer, req
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);if(error){if(req)req.destroy();reject(new Error('TRANSPORT'))}else resolve(value)}
  timer=setTimeout(()=>finish(true),Math.max(1,deadline-Date.now()))
  req=https.request(url,options,res=>{
   if(res.statusCode!==200){res.resume();finish(true);return}
   const chunks=[];let size=0
   res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){res.destroy();finish(true)}else chunks.push(chunk)})
   res.on('end',()=>finish(null,{body:Buffer.concat(chunks),type:String(res.headers['content-type']||'')}))
   res.on('error',()=>finish(true))
  })
  req.on('error',()=>finish(true));if(body)req.write(body);req.end()
 })
}
function mime(b){
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg'
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png'
 if(b.length>=6&&/^GIF8[79]a$/.test(b.subarray(0,6).toString()))return 'image/gif'
 if(b.length>=12&&b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return 'image/webp'
 throw new Error('IMAGE')
}
module.exports={request,mime}
