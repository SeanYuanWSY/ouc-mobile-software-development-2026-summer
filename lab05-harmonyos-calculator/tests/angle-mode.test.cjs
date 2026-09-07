const fs = require('node:fs');
const ts = require('./typescript-runtime.cjs');
const assert = require('node:assert/strict');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText, file);
const { evaluateAngleMode } = require('../entry/src/main/ets/core/AngleMode.ts');
let checks = 0;
function near(value, expected) { assert.ok(Math.abs(value - expected) < 1e-12, `${value} != ${expected}`); checks++; }
for (const [expression, degreeValue, radianValue] of [
  ['sin(30)', .5, Math.sin(30)], ['cos(60)', .5, Math.cos(60)],
  ['tan(45)', 1, Math.tan(45)], ['asin(0.5)', 30, Math.PI / 6],
  ['acos(0)', 90, Math.PI / 2], ['atan(1)', 45, Math.PI / 4],
  ['log10(100)+sqrt(9)', 5, 5]
]) {
  let first = evaluateAngleMode(expression, true, 0);
  near(first.value, degreeValue);
  let second = evaluateAngleMode(expression, false, first.value, first.resolvedExpression);
  near(second.value, radianValue);
  near(evaluateAngleMode(expression, true, second.value, second.resolvedExpression).value, degreeValue);
}
let replay = evaluateAngleMode('Ans+sin(30)', true, 10);
near(replay.value, 10.5);
for (let i = 0; i < 10; i++) {
  replay = evaluateAngleMode('Ans+sin(30)', false, replay.value, replay.resolvedExpression);
  near(replay.value, 10 + Math.sin(30));
  replay = evaluateAngleMode('Ans+sin(30)', true, replay.value, replay.resolvedExpression);
  near(replay.value, 10.5);
}
assert.ok(evaluateAngleMode('tan(90)', true, 0).error); checks++;
assert.equal(evaluateAngleMode('tan(90)', false, 0).error, ''); checks++;
assert.ok(evaluateAngleMode('sin(', false, 0).error); checks++;
assert.ok(evaluateAngleMode('', true, 0).error); checks++;
near(evaluateAngleMode('sin(pi/2)', false, 0).value, 1);
console.log(`PASS: ${checks} angle-mode assertions; trig/inverse switching, repeated toggles with Ans, unchanged non-angular functions and errors.`);
