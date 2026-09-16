// Deployment packages are isolated; maintain one policy source and verify its copied artifact in tests.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'cloudfunctions/assistantInbox'), { recursive: true });
fs.copyFileSync(path.join(root, 'cloudfunctions/assistantGateway/policy.js'), path.join(root, 'cloudfunctions/assistantInbox/policy.js'));
fs.copyFileSync(path.join(root, 'cloudfunctions/assistantGateway/jobs.js'), path.join(root, 'cloudfunctions/assistantInbox/jobs.js'));
