const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path')
const root=path.join(__dirname,'../cloudfunctions/lab06_aiReview')
function harness(opts={}){
 let calls=0,writes=0,row=opts.row
 const owner='test_owner',id='p_test',photo={_id:id,_openid:owner,title:'测试',photoUrl:'cloud://cloudbase-d5gdro8i30f1a4efd.636c-cloudbase-d5gdro8i30f1a4efd-1481960851/lab06/photos/test_owner/p_test.jpg'}
 const ref={get:async()=>({data:row}),set:async({data})=>{row=data;writes++}}
 const db={collection:()=>({doc:()=>({get:async()=>({data:opts.foreign?{...photo,_openid:'other'}:photo})})}),runTransaction:async fn=>{if(opts.dbFail)throw new Error('SECRET');if(opts.retry)await fn({collection:()=>({doc:()=>({get:async()=>({data:row}),set:async()=>{}})})});return fn({collection:()=>({doc:()=>ref})})}}
 const cloud={init(){},getWXContext:()=>({OPENID:opts.noAuth?'':owner}),database:config=>{assert.equal(config.throwOnNotFound,false,'SDK must allow absent first-use document');return db},getTempFileURL:async()=>({fileList:[{status:0,tempFileURL:opts.badUrl||'https://636c-cloudbase-d5gdro8i30f1a4efd-1481960851.tcb.qcloud.la/lab06/photos/test_owner/p_test.jpg?sign=test'}]})}
 const ctx={exports:{},require:id=>id==='wx-server-sdk'?cloud:id==='./safe-http'?{mime:()=> 'image/jpeg',request:async()=>{calls++;return calls===1?{body:Buffer.from([255,216,255])}:{body:Buffer.from(JSON.stringify({choices:[{message:{content:'test'}}]})),type:'application/json'}}}:id==='./policy'?require(path.join(root,'policy')):require(id),URL,Buffer,Date}
 vm.runInNewContext(fs.readFileSync(path.join(root,'index.js'),'utf8'),ctx)
 return {run:changes=>ctx.exports.main({apiKey:'sk-'+'x'.repeat(32),photoId:id,style:'photo',model:'deepseek-v4-flash-vision-exp',...changes}),stats:()=>({calls,writes,row})}
}
for(const [name,options,changes] of [['no auth',{noAuth:true},{}],['foreign photo',{foreign:true},{}],['text model',{}, {model:'deepseek-v4-pro'}],['invalid key',{}, {apiKey:'bad'}]])test(name+' rejects before external request',async()=>{const h=harness(options);const r=await h.run(changes);assert.equal(r.ok,false);assert.equal(h.stats().calls,0);assert.ok(!JSON.stringify(r).includes('SECRET'))})
test('untrusted signed URL never fetched',async()=>{const h=harness({badUrl:'https://evil.example/test.jpg'});assert.equal((await h.run()).ok,false);assert.equal(h.stats().calls,0)})
test('expired deadline rejects without creating socket',async()=>{let requests=0;const ctx={module:{exports:{}},require:()=>({request(){requests++}}),Date,Buffer};vm.runInNewContext(fs.readFileSync(path.join(root,'safe-http.js'),'utf8'),ctx);await assert.rejects(ctx.module.exports.request('https://example.com',{},null,20,Date.now()-1));assert.equal(requests,0)})
for(const scenario of ['redirect','oversize','response-error'])test('bounded transport rejects '+scenario,async()=>{
 const {EventEmitter}=require('node:events');let destroyed=false
 const transport={request(url,opts,cb){const req=new EventEmitter();req.write=()=>{};req.destroy=()=>{destroyed=true};req.end=()=>{const res=new EventEmitter();res.statusCode=scenario==='redirect'?302:200;res.headers={};res.resume=()=>{};res.destroy=()=>{};cb(res);if(scenario==='oversize')res.emit('data',Buffer.alloc(21));if(scenario==='response-error')res.emit('error',new Error('SECRET'))};return req}}
 const ctx={module:{exports:{}},require:()=>transport,Date,Buffer,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(path.join(root,'safe-http.js'),'utf8'),ctx);await assert.rejects(ctx.module.exports.request('https://example.com',{},null,20,Date.now()+1000),e=>e.message==='TRANSPORT');assert.equal(destroyed,true)
})

test('generation does not depend on quota availability or previous count',async()=>{const h=harness({dbFail:true,row:{count:1000,recent:1000}});assert.equal((await h.run()).ok,true);assert.equal(h.stats().calls,2);assert.equal(h.stats().writes,0)})
