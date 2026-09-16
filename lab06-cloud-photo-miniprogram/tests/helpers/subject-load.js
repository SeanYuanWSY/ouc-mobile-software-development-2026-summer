'use strict';
// 测试加载器（lab06 副本）：以 Node 模块缓存注入替代 vm 沙箱加载被测源码。
// 约束：测试代码中不得出现 vm.runInNewContext 与 require(变量)（安全扫描将其判为注入 sink）。

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_ROOTS = [
  path.join(PROJECT_ROOT, 'miniprogram'),
  path.join(PROJECT_ROOT, 'cloudfunctions'),
];

function resolveFrom(baseDir, spec) {
  if (spec.startsWith('.') || spec.startsWith('/')) {
    for (const candidate of [spec, `${spec}.js`, `${spec}.json`, path.join(spec, 'index.js')]) {
      const abs = path.resolve(baseDir, candidate);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
    }
    return null;
  }
  let dir = baseDir;
  for (;;) {
    const pkgDir = path.join(dir, 'node_modules', spec);
    if (fs.existsSync(pkgDir)) {
      const manifest = path.join(pkgDir, 'package.json');
      if (fs.existsSync(manifest)) {
        const main = JSON.parse(fs.readFileSync(manifest, 'utf8')).main || 'index.js';
        for (const candidate of [main, `${main}.js`, 'index.js']) {
          const abs = path.join(pkgDir, candidate);
          if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
        }
      }
      const direct = [pkgDir, `${pkgDir}.js`].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (direct) return direct;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isFreshTarget(filename) {
  return SOURCE_ROOTS.some((root) => filename.startsWith(root)) && !filename.includes(`${path.sep}node_modules${path.sep}`);
}

function clearProjectCache() {
  for (const key of Object.keys(require.cache)) {
    if (isFreshTarget(key)) delete require.cache[key];
  }
}

let injectedKeys = [];

function injectMock(subjectDir, spec, value) {
  const builtin = Module.builtinModules.includes(spec) || spec.startsWith('node:');
  const abs = builtin ? spec : resolveFrom(subjectDir, spec);
  if (!abs) throw new Error(`subject-load: 无法解析 mock 目标 ${spec}（相对 ${subjectDir}）`);
  const fake = new Module(abs, null);
  fake.filename = abs;
  fake.loaded = true;
  fake.exports = value;
  require.cache[abs] = fake;
  injectedKeys.push(abs);
}

function clearInjectedMocks() {
  for (const key of injectedKeys) delete require.cache[key];
  injectedKeys = [];
}

function prepareSubject(options) {
  const subjectAbs = resolveFrom(path.join(__dirname, '..'), options.subject);
  if (!subjectAbs) throw new Error(`subject-load: 无法解析被测模块 ${options.subject}`);
  clearInjectedMocks();
  clearProjectCache();
  const subjectDir = path.dirname(subjectAbs);
  for (const { spec, value } of options.mocks || []) injectMock(subjectDir, spec, value);
  for (const [name, value] of Object.entries(options.globals || {})) global[name] = value;
  return { subjectAbs, subjectDir };
}

module.exports = { prepareSubject, resolveFrom };
