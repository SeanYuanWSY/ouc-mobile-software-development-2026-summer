const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSubject } = require('./helpers/subject-load');

test('记忆保存响应丢失后保留同一请求与已上传附件，重试不回滚也不重复上传', async () => {
  let page, uploads = 0, rollback = 0, sequence = 0;
  const writes = [], notices = [];
  const repository = { makeRequestId: () => `request-${++sequence}`, async saveMemory(input) {
    writes.push(structuredClone(input));
    if (writes.length === 1) throw Object.assign(new Error('response lost'), { outcomeUnknown: true });
    if (writes.length === 2) throw Object.assign(new Error('cloud offline before dispatch'), { code: 'CLOUD_UNAVAILABLE' });
    return { data: { ...input, _id: 'saved' }, mode: 'cloud' };
  } };
  const media = { async persistAll() { uploads++; return [{ type: 'image', fileID: 'cloud://owned/image.jpg', _newlyPersisted: true }]; },
    stripPersistenceMetadata(item) { return { type: item.type, fileID: item.fileID }; }, async rollbackPersisted() { rollback++; return { failed: [] }; } };
  prepareSubject({
    subject: '../miniprogram/pages/record/index',
    mocks: [
      { spec: '../../services/repository', value: repository },
      { spec: '../../services/media', value: media },
    ],
    globals: { Page(p) { page = p; },
      wx: { showLoading() {}, hideLoading() {}, showToast() {}, switchTab() {}, showModal(options) { notices.push(options); options.success?.({ confirm: true }); } } },
  });
  require('../miniprogram/pages/record/index');
  page.setData = (value) => Object.assign(page.data, value);
  page.data.form.title = '请只保存一次';
  page.data.form.media = [{ type: 'image', tempFilePath: '/temporary/photo.jpg' }];
  await page.save();
  assert(page._pendingSave); assert.equal(page.data.saving, false);
  assert(notices.some((item) => item.title === '保存结果待确认'));
  await page.save();
  assert(page._pendingSave); assert.equal(rollback, 0);
  await page.save();
  assert.equal(uploads, 1); assert.equal(rollback, 0); assert.equal(writes.length, 3);
  assert.equal(writes[0].requestId, writes[1].requestId);
  assert.equal(writes[0].requestId, writes[2].requestId);
  assert.deepEqual(writes[0].media, writes[1].media);
  assert.equal(page._pendingSave, null);
});
