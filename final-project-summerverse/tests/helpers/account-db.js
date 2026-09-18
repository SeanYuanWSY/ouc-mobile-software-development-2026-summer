const assert = require('node:assert/strict');
function database() {
  let state = {}, queue = Promise.resolve();
  const collection = (store, name) => ({
    doc: id => ({
      get: async () => ({ data: store[name]?.[id] ? structuredClone({ ...store[name][id], _id: id }) : null }),
      set: async ({ data }) => { (store[name] ||= {})[id] = structuredClone(data); },
      update: async ({ data }) => { assert(store[name]?.[id]); Object.assign(store[name][id], structuredClone(data)); }
    }),
    where: condition => {
      let limit = 100;
      const q = { orderBy: () => q, limit: n => { limit = n; return q; }, get: async () => ({ data: Object.entries(store[name] || {}).filter(([, v]) => Object.entries(condition).every(([k, x]) => v[k] === x)).slice(0, limit).map(([id, v]) => ({ ...structuredClone(v), _id: id })) }) };
      return q;
    }
  });
  return { collection: name => collection(state, name), snapshot: () => structuredClone(state), runTransaction: fn => {
    const work = queue.then(async () => { const copy = structuredClone(state); const result = await fn({ collection: n => ({ doc: collection(copy, n).doc }) }); state = copy; return result; });
    queue = work.catch(() => {}); return work;
  } };
}
module.exports = { database };
