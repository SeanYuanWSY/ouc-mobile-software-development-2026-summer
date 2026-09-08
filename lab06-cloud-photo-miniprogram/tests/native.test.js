const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
function native(wx){const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/utils/ui'),'utf8'),{module,wx});return module.exports}
test('download waits for callback instead of returning the DownloadTask',async()=>{
 let options,done=false
 const api=native({downloadFile:o=>{options=o;return{abort(){}}}})
 const p=api.callNative('downloadFile',{url:'https://example.com/test.jpg'}).then(r=>{done=true;return r})
 await Promise.resolve();assert.equal(done,false)
 options.success({statusCode:200,tempFilePath:'wxfile://downloaded.jpg'})
 assert.equal((await p).tempFilePath,'wxfile://downloaded.jpg')
})
test('native failure rejects with permission error instead of claiming success',async()=>{
 const api=native({saveImageToPhotosAlbum:o=>o.fail({errMsg:'saveImageToPhotosAlbum:fail auth deny'})})
 await assert.rejects(api.callNative('saveImageToPhotosAlbum',{filePath:'wxfile://photo.jpg'}),e=>/auth deny/.test(e.errMsg))
})
function detail(wx){
 const ui=native(wx);let page
 vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/detail/detail'),'utf8'),{
  Page:p=>{page=p},wx,require:p=>p.includes('/ui')?ui:{},
 })
 page.data={photo:{displayUrl:'https://example.com/photo.jpg'},saving:false}
 page.setData=patch=>Object.assign(page.data,patch)
 return page
}
test('download and save are ordered by callbacks; success toast waits for save',async()=>{
 let dl,save;const events=[]
 const page=detail({downloadFile:o=>{dl=o;return{abort(){}}},saveImageToPhotosAlbum:o=>{events.push('save');save=o},showToast:()=>events.push('toast')})
 const p=page.download();assert.equal(page.data.saving,true);assert.deepEqual(events,[])
 dl.success({statusCode:200,tempFilePath:'wxfile://photo'});await new Promise(setImmediate);assert.deepEqual(events,['save'])
 save.success({});await p;assert.deepEqual(events,['save','toast']);assert.equal(page.data.saving,false)
})
for(const outcome of ['network','http','save-denied','settings-failed','modal-failed'])test('download handles '+outcome+' without false success',async()=>{
 let saves=0,toasts=0,modals=0
 const page=detail({
  downloadFile:o=>{outcome==='network'?o.fail({errMsg:'download:fail'}):o.success({statusCode:outcome==='http'?403:200,tempFilePath:'wxfile://photo'});return{abort(){}}},
  saveImageToPhotosAlbum:o=>{saves++;o.fail({errMsg:'saveImageToPhotosAlbum:fail auth deny'})},
  showModal:o=>{modals++;if(o.success){if(outcome==='modal-failed')o.fail({errMsg:'modal:fail'});else o.success({confirm:outcome==='settings-failed'})}},
  openSetting:o=>o.fail({errMsg:'settings:fail'}),showToast:()=>toasts++
 })
 await page.download();assert.equal(page.data.saving,false);assert.equal(toasts,0);assert.ok(modals>0)
 if(['network','http'].includes(outcome))assert.equal(saves,0)
})
