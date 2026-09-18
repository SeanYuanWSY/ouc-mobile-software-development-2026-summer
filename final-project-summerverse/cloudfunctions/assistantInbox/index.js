const cloud = require('wx-server-sdk');
const { createInbox } = require('./service');
const { requireValue, failure } = require('./policy');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const run = createInbox(cloud.database({ throwOnNotFound: false }));
exports.main = async (event = {}) => {
  try {
    requireValue(event && typeof event === 'object' && !Array.isArray(event));
    // Never expose this function through an HTTP route. Explicitly reject HTTP envelopes as defense in depth.
    requireValue(!['httpMethod', 'headers', 'body'].some(key => Object.hasOwn(event, key)), 'UNAUTHORIZED');
    const { OPENID } = cloud.getWXContext();
    // WeChat adds userInfo and tcbContext to SDK calls. Neither supplies business identity or config.
    // Preserve all other fields so the business schemas still reject unknown input.
    const input = { ...event };
    delete input.userInfo;
    delete input.tcbContext;
    return { ok: true, data: await run(OPENID, input) };
  } catch (e) { return failure(e); }
};
