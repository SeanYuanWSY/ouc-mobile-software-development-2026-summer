const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('./typescript-runtime.cjs');
const file = path.resolve(__dirname, '../entry/src/main/ets/core/Calculator.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } });
const mod = new Module(file); mod._compile(compiled.outputText, file);
const { Calculator, convert, statistics, quadratic, pretty } = mod.exports;
let count = 0;
function near(actual, expected, epsilon = 1e-11) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon * Math.max(1, Math.abs(expected)), `${actual} ≠ ${expected}`); count++;
}
function calc(expression, expected, degrees = true, ans = 0) {
  const r = new Calculator().evaluate(expression, degrees, ans);
  assert.equal(r.error, '', `${expression}: ${r.error}`); near(r.value, expected);
}
function bad(expression) { assert.ok(new Calculator().evaluate(expression).error, expression); count++; }
calc('1+2×3', 7); calc('(1+2)*3', 9); calc('-2^2', -4); calc('(-2)^2', 4);
calc('2^3^2', 512); calc('2^-3', .125); calc('2(3+4)', 14); calc('2π', 2 * Math.PI);
calc('sin(30)', .5); calc('cos(60)', .5); calc('tan(45)', 1);
calc('sin(pi/2)', 1, false); calc('asin(0.5)', 30); calc('acos(0)', 90); calc('atan(1)', Math.PI / 4, false);
calc('sqrt(81)+cbrt(-8)', 7); calc('ln(e)', 1); calc('log(1000)', 3); calc('abs(-3)', 3);
calc('0!', 1); calc('5!', 120); calc('200×15%', 30); calc('200+10%', 200.1);
calc('1e-6*1E6', 1); calc('Ans*3', 21, true, 7); calc('.5+.25', .75); calc('2sin(30)', 1);
['1/0', 'sqrt(-1)', 'ln(0)', 'log(-3)', 'asin(2)', 'tan(90)', '(-1)!', '2.5!', '171!', '2+', '(2+3', '1..2', 'foo(1)', 'alert(1)', '2^1024', '', '2)'].forEach(bad);
near(convert(1, 0, 0, 2), 100); near(convert(1, 0, 4, 0), .0254);
near(convert(0, 2, 0, 1), 32); near(convert(32, 2, 1, 0), 0); near(convert(0, 2, 2, 0), -273.15);
near(convert(1, 6, 6, 3), 1.073741824); near(convert(36, 5, 1, 0), 10);
assert.throws(() => convert(-274, 2, 0, 1)); count++;
for (let group = 0; group < 7; group++) { near(convert(convert(123.4, group, 0, 1), group, 1, 0), 123.4); }
const s = statistics('2, 4，4 4\n5;5；7 9');
near(s.mean, 5); near(s.median, 4.5); near(s.populationSD, 2); near(s.sampleSD, Math.sqrt(32 / 7)); near(s.sum, 40);
near(statistics('1000000000001 1000000000002 1000000000003').sampleSD, 1);
assert.ok(Number.isNaN(statistics('5').sampleSD)); count++;
['', '1,hello', '1,,NaN', '1 2 Infinity', '0xFF'].forEach(x => { assert.throws(() => statistics(x)); count++; });
assert.match(quadratic(1, -3, 2), /x₁ = 2\nx₂ = 1/); count++;
assert.match(quadratic(1, 2, 1), /x₁ = x₂ = -1/); count++;
assert.match(quadratic(1, 0, 1), /1i/); count++;
assert.match(quadratic(0, 2, -4), /x = 2/); count++;
assert.match(quadratic(0, 0, 0), /任意/); count++;
assert.match(quadratic(0, 0, 1), /无解/); count++;
assert.match(quadratic(1, 1e8, 1), /-1e-8/); count++;
assert.equal(pretty(-0), '0'); count++;
['1e309^0', '(1e309-1e309)^0', '1/(0^(-1))'].forEach(bad);
[[1e200, 0, -1e-200], [1e-200, 0, 1e200], [0, 1e-308, 1e308]].forEach(args => { assert.throws(() => quadratic(...args)); count++; });
assert.throws(() => statistics('1e-200 -1e-200')); count++;
assert.throws(() => convert(1e308, 2, 0, 1)); count++;
calc('log10(2)', Math.log10(2)); calc('log(2)', Math.log10(2));
calc('ln(2)', Math.log(2)); calc('log(2,8)', 3); calc('log(0.5,8)', -3);
calc('log(2+1,3^4)', 4); calc('log(2,log(10,100))', 1);
['log(1,8)', 'log(0,8)', 'log(-2,8)', 'log(2,0)', 'log(2,-8)', 'log(2,)', 'log(,8)', 'log(2,8,4)', 'ln(2,8)', 'log10(2,8)'].forEach(bad);
console.log(`PASS: ${count} mathematical assertions; parser, domains, conversions, statistics, equations.`);
