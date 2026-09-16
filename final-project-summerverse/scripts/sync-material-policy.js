const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'miniprogram/utils/material-policy.js'));
for (const name of ['dataService', 'deepseekProxy']) fs.writeFileSync(path.join(root, `cloudfunctions/${name}/material-policy.js`), source);
fs.copyFileSync(path.join(root, 'cloudfunctions/dataService/material-storage-policy.js'), path.join(root, 'cloudfunctions/deepseekProxy/material-storage-policy.js'));
