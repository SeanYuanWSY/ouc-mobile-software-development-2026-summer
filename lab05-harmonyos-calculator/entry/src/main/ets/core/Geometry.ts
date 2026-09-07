export class Vec3 {
  constructor(public x: number, public y: number, public z: number) {}
}
export class Face3 {
  constructor(public points: Vec3[]) {}
}
export class SolidInfo {
  constructor(public volume: number, public area: number, public formula: string) {}
}
export const SOLID_NAMES: string[] = ['长方体', '正方体', '球体', '圆柱', '圆锥', '正四棱锥'];

export function solidInfo(kind: number, a: number, b: number, h: number): SolidInfo {
  if (!Number.isInteger(kind) || kind < 0 || kind > 5 || [a, b, h].some((v: number) => !Number.isFinite(v) || v <= 0 || v > 10000)) {
    throw new Error('尺寸须为 0～10000 之间的正数');
  }
  switch (kind) {
    case 0: return new SolidInfo(a * b * h, 2 * (a * b + a * h + b * h), 'V = 长 × 宽 × 高\nS = 2(长×宽 + 长×高 + 宽×高)');
    case 1: return new SolidInfo(a * a * a, 6 * a * a, 'V = a³\nS = 6a²');
    case 2: return new SolidInfo(4 / 3 * Math.PI * a * a * a, 4 * Math.PI * a * a, 'V = 4πr³ / 3\nS = 4πr²');
    case 3: return new SolidInfo(Math.PI * a * a * h, 2 * Math.PI * a * (a + h), 'V = πr²h\nS = 2πr(r + h)，包含上下底面');
    case 4: return new SolidInfo(Math.PI * a * a * h / 3, Math.PI * a * (a + Math.hypot(a, h)), 'V = πr²h / 3\nS = πr(r + √(r² + h²))，包含底面');
    default: return new SolidInfo(a * a * h / 3, a * a + 2 * a * Math.hypot(a / 2, h), 'V = a²h / 3\nS = a² + 2a√((a/2)² + h²)，包含底面');
  }
}

// Mesh dimensions are in the user's units. The renderer alone normalizes to the viewport.
export function solidMesh(kind: number, a: number, b: number, h: number): Face3[] {
  solidInfo(kind, a, b, h);
  const faces: Face3[] = [];
  if (kind === 0 || kind === 1 || kind === 5) {
    const width = a / 2;
    const depth = (kind === 0 ? b : a) / 2;
    const height = (kind === 1 ? a : h) / 2;
    const p: Vec3[] = [new Vec3(-width, -height, -depth), new Vec3(width, -height, -depth), new Vec3(width, -height, depth), new Vec3(-width, -height, depth),
      new Vec3(-width, height, -depth), new Vec3(width, height, -depth), new Vec3(width, height, depth), new Vec3(-width, height, depth)];
    faces.push(new Face3([p[0], p[3], p[2], p[1]]));
    if (kind === 5) {
      const apex = new Vec3(0, height, 0);
      for (let i = 0; i < 4; i++) faces.push(new Face3([p[i], p[(i + 1) % 4], apex]));
    } else {
      faces.push(new Face3([p[4], p[5], p[6], p[7]]));
      for (let i = 0; i < 4; i++) faces.push(new Face3([p[i], p[(i + 1) % 4], p[(i + 1) % 4 + 4], p[i + 4]]));
    }
    return faces;
  }
  const steps = 32;
  if (kind === 2) {
    const latitudes = 16;
    for (let j = 0; j < latitudes; j++) {
      const t0 = -Math.PI / 2 + j * Math.PI / latitudes;
      const t1 = -Math.PI / 2 + (j + 1) * Math.PI / latitudes;
      for (let i = 0; i < steps; i++) {
        const p0 = i * 2 * Math.PI / steps;
        const p1 = (i + 1) * 2 * Math.PI / steps;
        faces.push(new Face3([spherePoint(a, t0, p0), spherePoint(a, t0, p1), spherePoint(a, t1, p1), spherePoint(a, t1, p0)]));
      }
    }
    return faces;
  }
  const bottom: Vec3[] = [];
  const top: Vec3[] = [];
  for (let i = 0; i < steps; i++) {
    const theta = i * 2 * Math.PI / steps;
    bottom.push(new Vec3(a * Math.cos(theta), -h / 2, a * Math.sin(theta)));
    top.push(new Vec3(a * Math.cos(theta), h / 2, a * Math.sin(theta)));
  }
  faces.push(new Face3(bottom.slice().reverse()));
  if (kind === 3) faces.push(new Face3(top));
  for (let i = 0; i < steps; i++) {
    const next = (i + 1) % steps;
    faces.push(new Face3(kind === 3 ? [bottom[i], bottom[next], top[next], top[i]] : [bottom[i], bottom[next], new Vec3(0, h / 2, 0)]));
  }
  return faces;
}
function spherePoint(radius: number, latitude: number, longitude: number): Vec3 {
  return new Vec3(radius * Math.cos(latitude) * Math.cos(longitude), radius * Math.sin(latitude), radius * Math.cos(latitude) * Math.sin(longitude));
}
export function rotatePoint(p: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw); const sy = Math.sin(yaw);
  const cp = Math.cos(pitch); const sp = Math.sin(pitch);
  const x = p.x * cy + p.z * sy;
  const z = -p.x * sy + p.z * cy;
  return new Vec3(x, p.y * cp - z * sp, p.y * sp + z * cp);
}
export class DrawFace {
  constructor(public points: Vec3[], public depth: number, public light: number) {}
}
export function viewFaces(mesh: Face3[], yaw: number, pitch: number): DrawFace[] {
  let radius = 0;
  for (const f of mesh) for (const p of f.points) radius = Math.max(radius, Math.hypot(p.x, p.y, p.z));
  const result: DrawFace[] = [];
  for (const f of mesh) {
    const points = f.points.map((p: Vec3): Vec3 => rotatePoint(new Vec3(p.x / radius, p.y / radius, p.z / radius), yaw, pitch));
    let depth = 0;
    for (const p of points) depth += p.z / points.length;
    // A cross product at the last corner avoids the coincident vertices at sphere poles.
    const u = new Vec3(points[1].x - points[0].x, points[1].y - points[0].y, points[1].z - points[0].z);
    const last = points[points.length - 1];
    const v = new Vec3(last.x - points[0].x, last.y - points[0].y, last.z - points[0].z);
    const nx = u.y * v.z - u.z * v.y; const ny = u.z * v.x - u.x * v.z; const nz = u.x * v.y - u.y * v.x;
    const length = Math.hypot(nx, ny, nz);
    const light = length > 1e-12 ? 0.48 + 0.46 * Math.abs((-nx * .4 + ny * .7 + nz * .6) / length) : .7;
    result.push(new DrawFace(points, depth, Math.min(1, light)));
  }
  result.sort((a: DrawFace, b: DrawFace): number => a.depth - b.depth);
  return result;
}
