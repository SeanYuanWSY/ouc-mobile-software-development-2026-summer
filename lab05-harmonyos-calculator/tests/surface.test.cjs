const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('./typescript-runtime.cjs');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText, file);
const { sampleSurface, SURFACE_PRESETS } = require('../entry/src/main/ets/core/Surface.ts');
const { Calculator } = require('../entry/src/main/ets/core/Calculator.ts');
let checks = 0;
function equal(actual, expected) { assert.equal(actual, expected); checks++; }
const c = new Calculator();
equal(c.evaluate('x^2-y^2', false, 0, 3, 2, true).value, 5);
equal(c.evaluate('2x+y', false, 0, 3, 2, true).value, 8);
assert.ok(c.evaluate('x+1').error); checks++;
const plane = sampleSurface('z = x+y', -2, 2, -2, 2);
equal(plane.low, -4); equal(plane.high, 4); equal(plane.faces.length, 1024); equal(plane.valid, 1089);
const constant = sampleSurface('5', -2, 2, -2, 2);
equal(constant.low, 5); equal(constant.high, 5);
assert.ok(constant.faces.every(f => f.points.every(p => p.y === 0))); checks++;
const saddle = sampleSurface('x²-y²', -2, 2, -2, 2);
equal(saddle.low, -4); equal(saddle.high, 4);
const half = sampleSurface('sqrt(9-x^2-y^2)', -5, 5, -5, 5);
assert.ok(half.omitted > 0 && half.faces.length > 0 && half.gaps > 0); checks++;
const pole = sampleSurface('1/x', -2, 2, -2, 2);
assert.ok(pole.omitted > 0 && pole.faces.every(f => !f.points.some(p => p.x === 0))); checks++;
const clipped = sampleSurface('100*x', -2, 2, -2, 2, 50);
assert.ok(clipped.omitted > 0 && clipped.high <= 50 && clipped.low >= -50); checks++;
for (const preset of SURFACE_PRESETS) {
  const s = sampleSurface(preset.expression, -5, 5, -5, 5);
  assert.ok(s.faces.length > 0);
  for (const f of s.faces) for (const p of f.points) assert.ok(Number.isFinite(p.x + p.y + p.z) && Math.abs(p.x) <= 1 && Math.abs(p.y) <= .8000000001 && Math.abs(p.z) <= 1);
  checks++;
}
['', 'x+', 'foo(x)', 'process.exit()', 'Ans+x', 'sqrt(-1)', 'x=y', 'xy', 'sin(', '1/0'].forEach(f => { assert.throws(() => sampleSurface(f, -2, 2, -2, 2)); checks++; });
[[2, -2, -2, 2, 50, 32], [-2, 2, 1, 1, 50, 32], [-2, 2, -2, 2, 0, 32], [-2, 2, -2, 2, 50, 100]].forEach(args => { assert.throws(() => sampleSurface('x+y', ...args)); checks++; });
console.log(`PASS: ${checks} surface cases; variable isolation, exact ranges, flat functions, presets, holes, poles, clipping and invalid input.`);
