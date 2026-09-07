const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('./typescript-runtime.cjs');
const file = path.resolve(__dirname, '../entry/src/main/ets/core/Geometry.ts');
const mod = new Module(file);
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText, file);
const { solidInfo, solidMesh, viewFaces, rotatePoint, Vec3 } = mod.exports;
let checks = 0;
function near(actual, expected) { assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(Math.abs(expected), 1e-100), `${actual} != ${expected}`); checks++; }
const cases = [[0, 4, 3, 5, 60, 94], [1, 3, 1, 1, 27, 54], [2, 2, 1, 1, 32 * Math.PI / 3, 16 * Math.PI], [3, 2, 1, 5, 20 * Math.PI, 28 * Math.PI], [4, 3, 1, 4, 12 * Math.PI, 24 * Math.PI], [5, 6, 1, 4, 48, 96]];
for (const [kind, a, b, h, volume, area] of cases) {
  const info = solidInfo(kind, a, b, h); near(info.volume, volume); near(info.area, area);
  const double = solidInfo(kind, a * 2, b * 2, h * 2); near(double.volume, volume * 8); near(double.area, area * 4);
  const mesh = solidMesh(kind, a, b, h);
  assert.ok(mesh.length >= 5); checks++;
  for (const yaw of [0, .7, Math.PI, 2 * Math.PI]) {
    const faces = viewFaces(mesh, yaw, -.4);
    assert.equal(faces.length, mesh.length);
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i]; assert.ok(f.points.length >= 3);
      assert.ok(Number.isFinite(f.light) && f.light >= 0 && f.light <= 1);
      if (i) assert.ok(faces[i - 1].depth <= f.depth);
      for (const p of f.points) assert.ok(Number.isFinite(p.x + p.y + p.z) && Math.hypot(p.x, p.y, p.z) <= 1 + 1e-12);
    }
    checks++;
  }
}
const p = new Vec3(3, 4, 5);
const rotated = rotatePoint(p, 1.5, -.7); near(Math.hypot(rotated.x, rotated.y, rotated.z), Math.hypot(3, 4, 5));
const circle = rotatePoint(p, Math.PI * 2, 0); near(circle.x, p.x); near(circle.y, p.y); near(circle.z, p.z);
[[0, 0, 1, 1], [2, -1, 1, 1], [6, 1, 1, 1], [1, Infinity, 1, 1], [1, NaN, 1, 1]].forEach(args => { assert.throws(() => solidInfo(...args)); checks++; });
console.log(`PASS: ${checks} geometry cases; exact formulas, scaling, six meshes, depth ordering, bounded projections and invalid dimensions.`);
