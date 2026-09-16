'use strict';
// 测试加载器：以 Node 模块缓存注入替代 vm 沙箱加载被测源码。
// 约束：测试代码中不得出现 vm.runInNewContext 与 require(变量)（安全扫描将其判为注入 sink）。
// 语义保持：每次 prepareSubject 清空项目源码缓存、按被测文件目录解析并预置 mock、
// 覆盖全局桩（wx/App/Page/getApp 等），随后测试用字面量 require 加载被测模块。

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

function injectMock(subjectDir, spec, value) {
  const abs = resolveFrom(subjectDir, spec);
  if (!abs) throw new Error(`subject-load: 无法解析 mock 目标 ${spec}（相对 ${subjectDir}）`);
  const fake = new Module(abs, null);
  fake.filename = abs;
  fake.loaded = true;
  fake.exports = value;
  require.cache[abs] = fake;
}

const envStack = [];
let injectedKeys = [];

// options.subject: 相对 tests 目录的被测模块路径（与测试内字面量 require 的路径一致）
// options.mocks: [{ spec, value }]，spec 按被测文件自己的 require 写法（相对被测文件、裸包名或 Node 内置模块名）
// options.globals: { wx, App, Page, getApp, ... }，顺序覆盖全局，测试进程按文件隔离
// options.env: 传对象则临时替换 process.env（还原用 restoreEnv）
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
  if (options.env) {
    envStack.push(process.env);
    process.env = options.env;
  }
  return { subjectAbs, subjectDir };
}

function restoreEnv() {
  if (envStack.length) process.env = envStack.pop();
}

module.exports = { prepareSubject, restoreEnv, resolveFrom };
