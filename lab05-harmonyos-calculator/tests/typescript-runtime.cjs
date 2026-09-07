const path = require('node:path');
if (process.env.TYPESCRIPT_PATH) {
  module.exports = require(process.env.TYPESCRIPT_PATH);
} else if (process.env.DEVECO_STUDIO_DIR) {
  module.exports = require(path.join(process.env.DEVECO_STUDIO_DIR, 'tools/hvigor/hvigor/node_modules/typescript'));
} else {
  try { module.exports = require('typescript'); }
  catch (error) { throw new Error('Set TYPESCRIPT_PATH or DEVECO_STUDIO_DIR, or run bash scripts/test.sh.', { cause: error }); }
}
