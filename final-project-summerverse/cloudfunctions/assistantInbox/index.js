const cloud = require('wx-server-sdk');
const { createInbox } = require('./service');
const { requireValue, failure } = require('./policy');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const run = createInbox(cloud.database({ throwOnNotFound: false }));
exports.main = async (event = {}) => {
  try {
    // Never expose this function through an HTTP route. Explicitly reject HTTP envelopes as defense in depth.
    requireValue(!event.httpMethod && !event.headers && !event.body, 'UNAUTHORIZED');
    const { OPENID } = cloud.getWXContext();
    return { ok: true, data: await run(OPENID, event) };
  } catch (e) { return failure(e); }
};
