const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const collections = ['memories', 'goals', 'profiles', 'step_snapshots'];

exports.main = async () => {
  const results = [];
  for (const name of collections) {
    try {
      await db.createCollection(name);
      results.push({ name, status: 'created' });
    } catch (error) {
      const message = error.message || '';
      results.push({ name, status: /exist|already/i.test(message) ? 'exists' : 'error', message });
    }
  }
  return { ok: results.every((item) => item.status !== 'error'), data: results };
};
