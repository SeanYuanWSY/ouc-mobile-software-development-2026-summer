import { Calculator } from './Calculator';
import { Vec3, Face3 } from './Geometry';

export class SurfaceData {
  faces: Face3[] = [];
  low: number = 0;
  high: number = 0;
  valid: number = 0;
  omitted: number = 0;
  gaps: number = 0;
}
export class SurfacePreset {
  constructor(public name: string, public expression: string) {}
}
export const SURFACE_PRESETS: SurfacePreset[] = [
  new SurfacePreset('波纹', 'sin(sqrt(x^2+y^2))'),
  new SurfacePreset('马鞍', 'x^2-y^2'),
  new SurfacePreset('山峰', '3*exp(-(x^2+y^2)/2)'),
  new SurfacePreset('抛物面', '(x^2+y^2)/4'),
  new SurfacePreset('波浪', 'sin(x)*cos(y)'),
  new SurfacePreset('半球', 'sqrt(9-x^2-y^2)')
];

export function sampleSurface(expression: string, xmin: number, xmax: number, ymin: number, ymax: number, limit: number = 50, steps: number = 32): SurfaceData {
  if (![xmin, xmax, ymin, ymax, limit].every((v: number) => Number.isFinite(v)) || xmin >= xmax || ymin >= ymax || limit <= 0 || limit > 1e6 || Math.max(Math.abs(xmin), Math.abs(xmax), Math.abs(ymin), Math.abs(ymax)) > 1e4) throw new Error('区间须从小到大，坐标绝对值 ≤ 10000；高度上限须为 0～1000000 的正数');
  if (!Number.isInteger(steps) || steps < 8 || steps > 60) throw new Error('网格精度须为 8～60');
  const text = expression.trim().replace(/^z\s*=\s*/i, '').replace(/²/g, '^2').replace(/³/g, '^3');
  if (!text || text.length > 200) throw new Error('请输入 1～200 字符的函数表达式');
  const identifiers = text.replace(/\d(?:\.\d*)?[eE][+-]?\d+/g, '0').match(/[a-zA-Z][a-zA-Z0-9]*/g) || [];
  const allowed: string[] = ['x', 'y', 'pi', 'e', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'cbrt', 'ln', 'log', 'log10', 'abs', 'exp'];
  for (const id of identifiers) if (!allowed.includes(id)) throw new Error('不支持 ' + id + '；变量请用 x、y，乘法请写 *');
  const engine = new Calculator();
  const data = new SurfaceData();
  const values: number[] = [];
  let firstError = '';
  const evaluate = (x: number, y: number): number => {
    const r = engine.evaluate(text, false, 0, x, y, true);
    if (r.error && !firstError) firstError = r.error;
    return r.error || Math.abs(r.value) > limit ? NaN : r.value;
  };
  for (let j = 0; j <= steps; j++) {
    for (let i = 0; i <= steps; i++) {
      const z = evaluate(xmin + (xmax - xmin) * i / steps, ymin + (ymax - ymin) * j / steps);
      values.push(z);
      if (Number.isFinite(z)) {
        if (data.valid === 0) { data.low = z; data.high = z; }
        else { data.low = Math.min(data.low, z); data.high = Math.max(data.high, z); }
        data.valid++;
      } else data.omitted++;
    }
  }
  if (data.valid === 0) throw new Error(firstError ? '此区间没有可绘制点：' + firstError : '所有采样值超过高度上限，请调大上限或调整区间');
  const span = data.high - data.low;
  const point = (i: number, j: number, z: number): Vec3 => new Vec3(-1 + 2 * i / steps, span > 0 ? (z - data.low) / span * 1.6 - .8 : 0, -1 + 2 * j / steps);
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < steps; i++) {
      const corners: number[] = [values[j * (steps + 1) + i], values[j * (steps + 1) + i + 1], values[(j + 1) * (steps + 1) + i + 1], values[(j + 1) * (steps + 1) + i]];
      if (corners.some((z: number) => !Number.isFinite(z))) { data.gaps++; continue; }
      const mid = evaluate(xmin + (xmax - xmin) * (i + .5) / steps, ymin + (ymax - ymin) * (j + .5) / steps);
      const mean = (corners[0] + corners[1] + corners[2] + corners[3]) / 4;
      // Avoid connecting across detected poles/domain holes. Finite sampling is not a symbolic continuity proof.
      if (!Number.isFinite(mid) || (span > 0 && Math.abs(mid - mean) > span * .25)) { data.gaps++; continue; }
      data.faces.push(new Face3([point(i, j, corners[0]), point(i + 1, j, corners[1]), point(i + 1, j + 1, corners[2]), point(i, j + 1, corners[3])]));
    }
  }
  if (data.faces.length === 0) throw new Error('有效点不足以组成曲面，请调整区间或提高高度上限');
  return data;
}
