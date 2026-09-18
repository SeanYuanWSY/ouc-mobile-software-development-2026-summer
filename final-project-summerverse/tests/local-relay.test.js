const test=require('node:test'),assert=require('node:assert/strict');
const {createLocalProtocol,devtoolsTransport}=require('../integrations/mcp/devtools.cjs');
test('local relay exposes only three job tools and rejects extra tool arguments',async()=>{
 let calls=0; const p=createLocalProtocol(async()=>{calls++;return {ok:true,data:{jobs:[]}}});
 await p({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});await p({jsonrpc:'2.0',method:'notifications/initialized'});
 const tools=await p({jsonrpc:'2.0',id:2,method:'tools/list'});assert.equal(tools.result.tools.length,3);
 for(const name of ['summerverse_recent','summerverse_submit','evaluate'])assert((await p({jsonrpc:'2.0',id:3,method:'tools/call',params:{name,arguments:{}}})).error);
 assert((await p({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'summerverse_jobs',arguments:{script:'unsafe'}}})).error);assert.equal(calls,0);
 const result=await p({jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'summerverse_jobs',arguments:{}}});assert.equal(result.result.isError,false);assert.equal(calls,1);
});
test('transport fixes target, passes payload as data and cleans temporary result',async()=>{
 const seen=[];let closed=false;
 const mp={evaluate:async(fn,...args)=>{seen.push(args);if(seen.length===1)return 'wx7496879b949ceb28';if(seen.length===3)return {body:JSON.stringify({ok:true,data:{jobs:[]}})};},disconnect:()=>{closed=true}};
 const result=await devtoolsTransport({token:'a'.repeat(64)},async()=>mp)({action:'job.list'});
 assert(result.ok);assert.equal(seen[1][1],'cloudbase-d5gdro8i30f1a4efd');assert.deepEqual(seen[1][3],{action:'job.list'});assert.equal(seen[3][0],seen[1][0]);assert(closed);
});
test('wrong app, invalid action and upstream exceptions do not leak secrets through MCP',async()=>{
 let connected=0;const send=devtoolsTransport({token:'a'.repeat(64)},async()=>{connected++;return {evaluate:async()=> 'wrong-app',disconnect:async()=>{}}});
 await assert.rejects(send({action:'recent.read'}));assert.equal(connected,0);await assert.rejects(send({action:'job.list'}),/Wrong project/);
 const p=createLocalProtocol(async()=>{throw new Error('SECRET_UPSTREAM_DATA')});await p({jsonrpc:'2.0',id:1,method:'initialize',params:{}});await p({jsonrpc:'2.0',method:'notifications/initialized'});
 const result=await p({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'summerverse_jobs',arguments:{}}});assert(result.result.isError);assert(!JSON.stringify(result).includes('SECRET_UPSTREAM_DATA'));
});
