const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path')
const base='../cloudfunctions/lab06_deletePhoto/'
function harness(opts={}){
 const row={_id:'p_test',_openid:opts.foreign?'other':'owner',photoUrl:'cloud://cloudbase-d5gdro8i30f1a4efd.636c-cloudbase-d5gdro8i30f1a4efd-1481960851/lab06/photos/owner/p_test.jpg',title:'title'}
 if(opts.badPath)row.photoUrl='cloud://other/file'
 const events=[];let calls=0
 const ref={get:async()=>({data:opts.missing?null:row}),update:async({data})=>{if(opts.markFail)throw Error('db');Object.assign(row,data);events.push('mark')}}
 const db={collection:()=>({doc:()=>ref,where:query=>{assert.equal(query._openid,'owner');return{limit:()=>({get:async()=>({data:row.deleted&&!row.fileCleaned?[row]:[]})})}}}),runTransaction:fn=>fn(db)}
 const cloud={init(){},database:()=>db,getWXContext:()=>({OPENID:'owner'}),deleteFile:async({fileList})=>{calls++;assert.equal(row.deleted,true);events.push('delete');return{fileList:[{fileID:fileList[0],status:opts.deleteFail?-1:0}]}}}
 const ctx={exports:{},require:id=>id==='wx-server-sdk'?cloud:require(path.join(__dirname,base,'policy'))}
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,base,'index.js'),'utf8'),ctx)
 return{run:args=>ctx.exports.main(args||{photoId:'p_test'}),row,events,opts,calls:()=>calls}
}
for(const kind of ['foreign','badPath','markFail'])test(kind+' never deletes storage',async()=>{const h=harness({[kind]:true});assert.equal((await h.run()).ok,false);assert.equal(h.calls(),0)})
test('owned deletion marks before storage and repeats without another delete',async()=>{const h=harness();assert.equal((await h.run()).ok,true);assert.equal(h.row.fileCleaned,true);assert.equal(h.row.title,'');assert.equal(h.events[0],'mark');assert.equal(h.events[1],'delete');assert.equal((await h.run()).ok,true);assert.equal(h.calls(),1)})
test('cleanup failure remains hidden and discoverable for retry',async()=>{const h=harness({deleteFail:true});const r=await h.run();assert.equal(r.removed,true);assert.equal(r.ok,false);assert.equal(h.row.deleted,true);assert.equal((await h.run({action:'pending'})).pending[0]._id,'p_test');h.opts.deleteFail=false;assert.equal((await h.run()).ok,true);assert.equal((await h.run({action:'pending'})).pending.length,0)})
test('already absent document is an idempotent no-op',async()=>{const h=harness({missing:true});assert.equal((await h.run()).ok,true);assert.equal(h.calls(),0)})
test('tombstone inaccessible to signing and AI but accepted for cleanup',()=>{const h=harness();h.row.deleted=true;assert.equal(require(path.join(__dirname,base,'policy')).allowed(h.row),true);assert.equal(require('../cloudfunctions/lab06_photoAccess/policy').allowed(h.row),false);assert.equal(require('../cloudfunctions/lab06_aiReview/policy').allowed(h.row),false)})
