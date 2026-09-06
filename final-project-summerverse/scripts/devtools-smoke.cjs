const assert=require('node:assert/strict'),fs=require('node:fs');
// Requires an already-installed official miniprogram-automator; no downloads or login changes.
const { createRequire }=require('node:module');
const autoRequire=createRequire(require('node:path').resolve(process.env.AUTOMATOR_PACKAGE || require.resolve('miniprogram-automator/package.json')));
const MP=autoRequire('./out/MiniProgram').default,cmp=autoRequire('licia/cmpVersion');
MP.prototype.checkVersion=async function(){const s=await this.systemInfo();assert.equal(typeof s.SDKVersion,'string');assert(cmp(s.SDKVersion,'2.7.3')>=0);};
const a=autoRequire('./'),out=process.env.QA_OUTPUT || require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'summerverse-qa-'));fs.mkdirSync(out,{recursive:true});
const results=[],errors=[];let mp;
const check=(name,ok,details)=>{results.push({name,ok,details});console.log(ok?'PASS':'FAIL',name,details||'');assert(ok,name)};
const settle=()=>new Promise(r=>setTimeout(r,1000));
async function page(path){const p=await mp.reLaunch('/pages/'+path+'/index');await settle();return p;}
(async()=>{mp=await a.connect({wsEndpoint:process.env.DEVTOOLS_WS || 'ws://127.0.0.1:9422'});
const start=await mp.evaluate(()=>({mode:getApp().globalData.dataMode,memories:(wx.getStorageSync('summerverse.memories.v1')||[]).length,goals:(wx.getStorageSync('summerverse.goals.v1')||[]).length}));
check('isolated local empty dataset',start.mode==='local'&&start.memories===0&&start.goals===0,start);
await mp.mockWxMethod('showModal',{confirm:true,cancel:false});
mp.on('exception',e=>errors.push(e));
let p=await page('island');if(await p.$('.onboarding-skip'))await(await p.$('.onboarding-skip')).tap();
const card=await(await p.$('.start-card')).size(),links=await(await p.$('.link-row')).size();check('first-record card fills content width',card.width===links.width,{card,links});
await(await p.$('.start-card')).tap();for(let n=0;n<10;n++){await settle();p=await mp.currentPage();if(p.path==='pages/record/index')break;}check('record CTA navigation',p.path==='pages/record/index');
await p.callMethod('save');check('empty title rejected',await mp.evaluate(()=>(wx.getStorageSync('summerverse.memories.v1')||[]).length)===0);
const title='QA_LOCAL_'+Date.now();await(await p.$('input[data-field="title"]')).input(title);await(await p.$('textarea[data-field="content"]')).input('本地自动验收临时记录');await p.callMethod('save');await settle();
p=await mp.currentPage();check('save returns to island',p.path==='pages/island/index');await p.callMethod('refresh',false);await settle();check('island reflects saved record',(await p.data('memories')).length===1);
let memories=await mp.evaluate(()=>wx.getStorageSync('summerverse.memories.v1'));const id=memories[0]._id;fs.writeFileSync(out+'/fixture.json',JSON.stringify({id,title}));check('record stored',memories.length===1&&memories[0].title===title);
p=await page('timeline');check('timeline displays saved record',await p.data('resultCount')===1);await(await p.$('.search-input')).input('DOES_NOT_EXIST');await settle();check('search excludes nonmatching record',await p.data('resultCount')===0);await(await p.$('.search-input')).input('QA_LOCAL');await settle();check('search finds saved record',await p.data('resultCount')===1);
p=await mp.reLaunch('/pages/memory-detail/index?id='+id);await settle();check('detail loads stored title',await p.data('memory.title')===title);await p.callMethod('edit');await settle();p=await mp.currentPage();check('edit opens existing record',p.path==='pages/record/index'&&await p.data('editing')===true);await(await p.$('input[data-field="title"]')).input(title+'_EDIT');await p.callMethod('save');await settle();memories=await mp.evaluate(()=>wx.getStorageSync('summerverse.memories.v1'));check('edit updates same record',memories.length===1&&memories[0]._id===id&&memories[0].title===title+'_EDIT');
p=await page('growth');check('growth count matches',await p.data('summary.memoryCount')===1);await p.callMethod('toggleGoalForm');await settle();await(await p.$('input[data-field="title"]')).input(title+'_GOAL');await(await p.$('input[data-field="target"]')).input('1');await p.callMethod('saveGoal');let goals=await p.data('goals');check('goal created',goals.length===1&&goals[0].target===1);const gid=goals[0]._id;fs.writeFileSync(out+'/fixture.json',JSON.stringify({id,gid,title}));await(await p.$('.goal-action')).tap();await settle();goals=await p.data('goals');check('goal completes at target',goals[0].current===1&&goals[0].completed);await(await p.$('.goal-action')).tap();await settle();check('completed goal cannot exceed target',(await p.data('goals'))[0].current===1);
for(const name of ['island','timeline','growth','twin','map','time-phone','parallel','director','report','settings']){p=await page(name);check(name+' page renders',!!await p.$('.page'));if(process.env.QA_SCREENSHOTS!=='0')await mp.screenshot({path:out+'/'+name+'.png'});}
p=await page('record');const formBefore=await p.data('form');await(await p.$('.ai-draft')).input('本地无Key测试');await p.callMethod('parseWithAI');check('AI failure resets loading',await p.data('aiParsing')===false);check('AI failure preserves form',JSON.stringify(await p.data('form'))===JSON.stringify(formBefore));
// Known test IDs only; deletion invokes the real UI handler with a test modal response.
p=await mp.reLaunch('/pages/memory-detail/index?id='+id);await settle();await p.callMethod('remove');await settle();check('record deletion persists',await mp.evaluate(()=>(wx.getStorageSync('summerverse.memories.v1')||[]).length)===0);
p=await page('growth');await p.callMethod('removeGoal',{currentTarget:{dataset:{id:gid}}});await settle();check('goal deletion persists',(await p.data('goals')).length===0);check('growth count resets',await p.data('summary.memoryCount')===0);
p=await page('island');check('island returns to empty stage',await p.data('stage')===0);await mp.screenshot({path:out+'/island-clean.png'});
})().catch(e=>{results.push({name:'RUN_ABORTED',ok:false,error:e.message});console.error(e.stack);process.exitCode=1}).finally(async()=>{fs.writeFileSync(out+'/results.json',JSON.stringify({results,errors},null,2));if(mp){await mp.restoreWxMethod('showModal').catch(()=>{});await mp.disconnect();}});
