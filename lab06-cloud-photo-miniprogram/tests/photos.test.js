const {test}=require('node:test')
const assert=require('node:assert/strict')
const vm=require('node:vm')
const fs=require('node:fs')
const path=require('node:path')
const core=require('../miniprogram/utils/core')
function harness(options={}) {
 const storage=new Map(), docs=new Map(), calls=[]
 const db={command:{neq:v=>({neq:v})},serverDate:()=>({$date:'server'}),collection:name=>{
  calls.push(['collection',name]);
  const q={where:arg=>{calls.push(['where',arg]);return q},orderBy:(...a)=>{calls.push(['order',...a]);return q},skip:n=>{calls.push(['skip',n]);return q},limit:n=>{calls.push(['limit',n]);return q},get:async()=>({data:options.rows||[]}),doc:id=>({get:async()=>{if(options.readFail||!docs.has(id))throw Error('not found');return{data:docs.get(id)}}}),add:async({data})=>{calls.push(['add',data]);if(options.failBefore)throw Error('offline');if(docs.has(data._id))throw Error('duplicate');docs.set(data._id,{...data,_openid:'owner'});if(options.failAfter)throw Error('timeout');return{_id:data._id}}};return q
 }}
 const wx={cloud:{database:()=>db,callFunction:async args=>{if(args.data&&args.data.ids)return{result:{photos:options.links||[]}};calls.push(['identity']);if(options.identityFail)throw Error('login');return{result:{openid:'owner'}}},uploadFile:async args=>{calls.push(['upload',args]);if(options.uploadFail)throw Error('upload');return{fileID:'cloud://test/'+args.cloudPath}}},getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>{if(options.storageFail)throw Error('quota');storage.set(k,JSON.parse(JSON.stringify(v)))},removeStorageSync:k=>storage.delete(k)}
 const mod={exports:{}}
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/services/photos.js'),'utf8'),{module:mod,require:p=>p==='../config'?{envId:'test',collection:'lab06_photos',loginFunction:'lab06_getOpenid'}:core,wx,getApp:()=>({globalData:{cloudReady:!options.notReady}}),Date,Math,Error})
 return {api:mod.exports,storage,docs,calls,options}
}
const file={tempFilePath:'/tmp/photo.jpg',size:1024}, input={nickName:'同学',title:'海边',location:'青岛'}
test('reject invalid image size and required text',()=>{for(const size of [0,-1,Infinity,11*1024*1024])assert.throws(()=>core.validateImage({...file,size}));assert.throws(()=>core.cleanText(' ',24,true));assert.throws(()=>core.cleanText('x'.repeat(25),24,true))})
test('deduplicate overlapping page results',()=>assert.deepEqual(core.mergePhotos([{_id:'a'}],[{_id:'a'},{_id:'b'},{_id:'b'}]),[{_id:'a'},{_id:'b'}]))
test('unconfigured environment never calls cloud',async()=>{const h=harness({notReady:true});await assert.rejects(h.api.list());assert.equal(h.calls.length,0)})
test('identity failure does not upload',async()=>{const h=harness({identityFail:true});await assert.rejects(h.api.publish(file,input));assert.equal(h.calls.filter(x=>x[0]==='upload').length,0)})
test('publish commits cloud ID with server date and platform-owned identity',async()=>{const h=harness();await h.api.publish(file,input);const record=h.calls.find(x=>x[0]==='add')[1];assert.ok(record.photoUrl.startsWith('cloud://'));assert.equal(record._openid,undefined);assert.equal(record.createdAt.$date,'server');assert.equal(h.storage.size,0)})
test('upload failure does not create database record',async()=>{const h=harness({uploadFail:true});await assert.rejects(h.api.publish(file,input));assert.equal(h.docs.size,0)})
test('write timeout after commit confirms same record, no duplicate',async()=>{const h=harness({failAfter:true});await h.api.publish(file,input);assert.equal(h.docs.size,1);assert.equal(h.storage.size,0)})
test('uncertain write preserves pending record and retry uploads no new file',async()=>{const h=harness({failBefore:true});await assert.rejects(h.api.publish(file,input));assert.equal(h.storage.size,1);await assert.rejects(h.api.publish(file,input));h.options.failBefore=false;await h.api.retry();assert.equal(h.docs.size,1);assert.equal(h.calls.filter(x=>x[0]==='upload').length,1);assert.equal(h.storage.size,0)})
test('cannot confirm a committed record while offline; later retry is idempotent',async()=>{const h=harness({failAfter:true,readFail:true});await assert.rejects(h.api.publish(file,input));assert.equal(h.docs.size,1);h.options.readFail=false;await h.api.retry();assert.equal(h.docs.size,1);assert.equal(h.storage.size,0)})
test('local storage failure does not claim publish success',async()=>{const h=harness({storageFail:true});await assert.rejects(h.api.publish(file,input),/尚未发布/);assert.equal(h.docs.size,0)})
test('owner query, pagination and deterministic ordering',async()=>{const h=harness();await h.api.list('owner',20);assert.ok(h.calls.some(x=>x[0]==='where'&&x[1]._openid==='owner'));assert.ok(h.calls.some(x=>x[0]==='skip'&&x[1]===20));assert.equal(h.calls.filter(x=>x[0]==='order').length,2)})
test('invalid detail link rejected before query',async()=>{const h=harness();await assert.rejects(h.api.detail('../../x'));assert.equal(h.calls.length,0)})
test('identity calls deduplicate in flight',async()=>{const h=harness();await Promise.all([h.api.identity(),h.api.identity()]);assert.equal(h.calls.filter(x=>x[0]==='identity').length,1)})
test('page conditions use WXML expressions, never truthy literal strings',()=>{
 for(const page of ['index','homepage','add','detail']){
  const source=fs.readFileSync(path.join(__dirname,'../miniprogram/pages',page,page+'.wxml'),'utf8')
  for(const match of source.matchAll(/wx:(?:if|elif)="([^"]*)"/g))assert.match(match[1],/^\{\{.*\}\}$/)
 }
})
const policy=require('../cloudfunctions/lab06_photoAccess/policy')
test('signed access binds exact environment, author, record and extension',()=>{
 const base='cloud://cloudbase-d5gdro8i30f1a4efd.636c-cloudbase-d5gdro8i30f1a4efd-1481960851/lab06/photos/'
 const record={_id:'p_test',_openid:'owner',photoUrl:base+'owner/p_test.jpg'}
 assert.equal(policy.allowed(record),true)
 for(const photoUrl of [base+'other/p_test.jpg',base+'owner/other.jpg',base+'owner/../p_test.jpg',base+'owner/p_test.jpg?x=1',base+'owner/p_test.svg',record.photoUrl.replace('cloudbase-d5','cloudbase-evil'),base+'owner%2fp_test.jpg'])assert.equal(policy.allowed({...record,photoUrl}),false)
})
test('signed access accepts bounded record IDs only',()=>{
 for(const ids of [null,[],Array(21).fill('a'),['../../x'],[{id:'a'}]])assert.throws(()=>policy.idsOf(ids))
 assert.deepEqual(policy.idsOf(['a','a','b']),['a','b'])
})
test('signed access rejects missing or non-string author',()=>{for(const owner of [undefined,null,42,{}])assert.equal(policy.allowed({_id:'p_test',_openid:owner,photoUrl:'invalid'}),false)})

test('canonical author name overrides historical nickname without merging identities',async()=>{const h=harness({rows:[{_id:'a',_openid:'one',nickName:'old'},{_id:'b',_openid:'two',nickName:'same'}],links:[{_id:'a',displayUrl:'https://example.com/a',nickName:'current'},{_id:'b',displayUrl:'https://example.com/b',nickName:'current'}]});const rows=await h.api.list();assert.equal(rows[0].nickName,'current');assert.equal(rows[1].nickName,'current');assert.notEqual(rows[0]._openid,rows[1]._openid)})
test('missing image signature preserves page size and shows placeholder',async()=>{const rows=Array.from({length:20},(_,i)=>({_id:'p_'+i,nickName:'name'}));const h=harness({rows,links:[]});const actual=await h.api.list();assert.equal(actual.length,20);assert.equal(actual[0].imageError,true)})
test('deleted details rejected and list excludes deleted records',async()=>{const h=harness();h.docs.set('p_deleted',{deleted:true,photoUrl:'cloud://test'});await assert.rejects(h.api.detail('p_deleted'),/移除/);await h.api.list();assert.ok(h.calls.some(c=>c[0]==='where'&&c[1].deleted.neq===true))})
