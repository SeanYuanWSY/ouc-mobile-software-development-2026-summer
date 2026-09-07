import { sampleSurface, SurfaceData, SURFACE_PRESETS, SurfacePreset } from '../core/Surface';
import { rotatePoint, Vec3 } from '../core/Geometry';
import { pretty } from '../core/Calculator';

class SurfaceFace {
  points: Vec3[];
  depth: number;
  level: number;
  constructor(points: Vec3[], depth: number, level: number) {
    this.points = points; this.depth = depth; this.level = level;
  }
}

@Component
export struct FunctionSurface {
  @State expression: string = 'sin(sqrt(x^2+y^2))';
  @State xmin: string = '-5';
  @State xmax: string = '5';
  @State ymin: string = '-5';
  @State ymax: string = '5';
  @State cap: string = '50';
  @State yaw: number = 35;
  @State pitch: number = 30;
  @State zoom: number = 1;
  @State wire: boolean = false;
  @State error: string = '';
  @State summary: string = '';
  @State drawn: string = '';
  @State dirty: boolean = false;
  @State density: number = 32;
  private model: SurfaceData = new SurfaceData();
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private ready: boolean = false;
  private startYaw: number = 0;
  private startPitch: number = 0;

  plot(): void {
    try {
      if ([this.xmin, this.xmax, this.ymin, this.ymax, this.cap].some((s: string) => s.trim() === '')) throw new Error('请填写完整区间与高度上限');
      this.model = sampleSurface(this.expression, Number(this.xmin), Number(this.xmax), Number(this.ymin), Number(this.ymax), Number(this.cap), this.density);
      this.error = ''; this.dirty = false;
      this.drawn = this.expression.trim().replace(/^z\s*=\s*/i, '');
      this.summary = 'x ∈ [' + this.xmin + ', ' + this.xmax + ']，y ∈ [' + this.ymin + ', ' + this.ymax + ']\n采样 z ∈ [' + pretty(this.model.low) + ', ' + pretty(this.model.high) + ']\n' + this.model.valid + ' 个有效点 · ' + this.model.omitted + ' 个无效/超限点 · ' + this.model.gaps + ' 个网格留空';
      this.draw();
    } catch (e) {
      this.error = (e as Error).message; this.model = new SurfaceData(); this.drawn = ''; this.summary = ''; this.draw();
    }
  }
  draw(): void {
    if (!this.ready) return;
    const c = this.ctx; const w = c.width; const h = c.height;
    c.clearRect(0, 0, w, h); c.fillStyle = '#F0F6FA'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#E1EAF1'; c.lineWidth = .5;
    for (let i = 0; i < w; i += 24) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke(); }
    for (let i = 0; i < h; i += 24) { c.beginPath(); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); }
    const yr = this.yaw * Math.PI / 180; const pr = this.pitch * Math.PI / 180;
    const scale = Math.min(w, h) * .27 * this.zoom;
    const faces: SurfaceFace[] = this.model.faces.map((f): SurfaceFace => {
      const pts = f.points.map((p: Vec3): Vec3 => rotatePoint(p, yr, pr));
      let depth = 0; let level = 0;
      for (let i = 0; i < pts.length; i++) { depth += pts[i].z / pts.length; level += (f.points[i].y + .8) / 1.6 / pts.length; }
      return new SurfaceFace(pts, depth, level);
    });
    faces.sort((a: SurfaceFace, b: SurfaceFace): number => a.depth - b.depth);
    for (const face of faces) {
      c.beginPath();
      for (let i = 0; i < face.points.length; i++) {
        const p = face.points[i];
        if (i === 0) c.moveTo(w / 2 + p.x * scale, h / 2 - p.y * scale);
        else c.lineTo(w / 2 + p.x * scale, h / 2 - p.y * scale);
      }
      c.closePath();
      if (!this.wire) {
        c.fillStyle = 'rgb(' + Math.round(76 + 122 * face.level) + ',' + Math.round(145 + 56 * face.level) + ',' + Math.round(207 - 94 * face.level) + ')'; c.fill();
      }
      c.strokeStyle = this.wire ? '#40798D' : '#6899A1'; c.lineWidth = this.wire ? .6 : .3; c.stroke();
    }
    const axes: Vec3[] = [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 1, 0)];
    const names: string[] = ['x', 'y', 'z']; const colors: string[] = ['#B84E54', '#4770B0', '#167765'];
    for (let i = 0; i < 3; i++) {
      const p = rotatePoint(axes[i], yr, pr); c.beginPath(); c.moveTo(37, h - 40); c.lineTo(37 + 25 * p.x, h - 40 - 25 * p.y);
      c.strokeStyle = colors[i]; c.lineWidth = 1.7; c.stroke(); c.fillStyle = colors[i]; c.font = '12px sans-serif';
      c.fillText(names[i], 33 + 35 * p.x, h - 36 - 35 * p.y);
    }
    c.fillStyle = '#546879'; c.font = '11px sans-serif'; c.fillText('拖动旋转 · 蓝色低 / 黄色高', w - 175, h - 15);
  }
  @Builder
  field(label: string, value: string, change: (v: string) => void) {
    Column({ space: 4 }) {
      Text(label).fontSize(12).fontColor('#536A7D').width('100%')
      TextInput({ text: value }).height(40).fontSize(14).fontColor('#172E42').backgroundColor('#E8EFF5')
        .maxLength(16).onChange((v: string) => { change(v); this.dirty = true; })
    }.layoutWeight(1)
  }
  build() {
    Column({ space: 12 }) {
      Text('让函数，成为形状').fontSize(23).fontWeight(FontWeight.Bold).fontColor('#172E42').width('100%')
      Text('输入 z = f(x, y) · 三角函数使用弧度').fontSize(12).fontColor('#536A7D').width('100%')
      Column({ space: 10 }) {
        Text('z =').fontSize(18).fontColor('#187B85').width('100%')
        TextInput({ text: this.expression, placeholder: '例如 x^2-y^2' }).height(48).fontSize(17).fontColor('#172E42')
          .backgroundColor('#EDF3F7').maxLength(200).onChange((v: string) => { this.expression = v; this.dirty = true; }).onSubmit(() => this.plot())
        Select(SURFACE_PRESETS.map((p: SurfacePreset): SelectOption => { return { value: p.name }; })).value('试试示例函数')
          .width('100%').fontColor('#187B85').backgroundColor('#E0F2F0').onSelect((i: number) => {
            this.expression = SURFACE_PRESETS[i].expression; this.xmin = '-5'; this.xmax = '5'; this.ymin = '-5'; this.ymax = '5'; this.cap = '50'; this.plot();
          })
        Button('绘制曲面').width('100%').height(44).fontColor('#FFFFFF').backgroundColor('#187B85').onClick(() => this.plot())
      }.padding(14).width('100%').backgroundColor('#FFFFFF').borderRadius(18)
      if (this.error) { Text(this.error).fontColor('#A84F1D').fontSize(13).width('100%') }
      if (this.dirty) { Text('参数已修改，点击「绘制曲面」更新图形。').fontColor('#A84F1D').fontSize(12).width('100%') }
      if (this.drawn) { Text('当前曲面：z = ' + this.drawn).fontColor('#364F64').fontSize(13).width('100%') }
      Canvas(this.ctx).height(300).width('100%').borderRadius(18).clip(true)
        .onReady(() => { this.ready = true; this.plot(); }).onAreaChange(() => this.draw())
        .accessibilityText('函数三维曲面，可拖动旋转，下方也有视角滑块')
        .gesture(PanGesture().onActionStart(() => { this.startYaw = this.yaw; this.startPitch = this.pitch; })
          .onActionUpdate((e: GestureEvent) => { this.yaw = ((this.startYaw + e.offsetX * .6) % 360 + 360) % 360; this.pitch = Math.max(-85, Math.min(85, this.startPitch - e.offsetY * .5)); this.draw(); }))
      Row({ space: 8 }) {
        Button(this.wire ? '线框' : '彩色曲面').fontSize(13).fontColor('#187B85').backgroundColor('#E0F2F0').onClick(() => { this.wire = !this.wire; this.draw(); })
        Button('复位视角').fontSize(13).fontColor('#536A7D').backgroundColor('#E8EFF5').onClick(() => { this.yaw = 35; this.pitch = 30; this.zoom = 1; this.draw(); })
      }.width('100%')
      Text(this.summary).fontColor('#536A7D').fontSize(12).lineHeight(20).width('100%')
      Column({ space: 10 }) {
        Text('绘图区间').fontColor('#172E42').fontSize(16).width('100%')
        Row({ space: 8 }) { this.field('x 最小值', this.xmin, (v: string) => this.xmin = v); this.field('x 最大值', this.xmax, (v: string) => this.xmax = v) }
        Row({ space: 8 }) { this.field('y 最小值', this.ymin, (v: string) => this.ymin = v); this.field('y 最大值', this.ymax, (v: string) => this.ymax = v) }
        Row({ space: 8 }) {
          this.field('|z| 高度上限', this.cap, (v: string) => this.cap = v)
          Select([{ value: '标准 · 32' }, { value: '精细 · 48' }]).value(this.density === 32 ? '标准 · 32' : '精细 · 48')
            .layoutWeight(1).fontColor('#187B85').backgroundColor('#E8EFF5').onSelect((i: number) => { this.density = i === 0 ? 32 : 48; this.dirty = true; })
        }
        Text('视角：水平 ' + this.yaw.toFixed(0) + '° / 俯仰 ' + this.pitch.toFixed(0) + '°').fontSize(12).fontColor('#536A7D').width('100%')
        Slider({ value: this.yaw, min: 0, max: 360, step: 1 }).selectedColor('#187B85').onChange((v: number) => { this.yaw = v; this.draw(); }).accessibilityText('水平视角')
        Slider({ value: this.pitch, min: -85, max: 85, step: 1 }).selectedColor('#187B85').onChange((v: number) => { this.pitch = v; this.draw(); }).accessibilityText('俯仰视角')
        Text('缩放 ' + this.zoom.toFixed(2) + '×').fontSize(12).fontColor('#536A7D').width('100%')
        Slider({ value: this.zoom, min: .6, max: 1.25, step: .05 }).selectedColor('#187B85').onChange((v: number) => { this.zoom = v; this.draw(); }).accessibilityText('曲面缩放')
      }.padding(14).backgroundColor('#FFFFFF').borderRadius(18).width('100%')
      Text('支持 + − * / ^、括号、sin/cos/tan、sqrt、exp、ln、log、abs、π。乘法建议明确写 *。\n这是二元函数曲面 z=f(x,y)；只含 x 的函数会沿 y 方向延展。\n三轴独立缩放以便观察，实际范围见图下数字；颜色表示高度。采用有限网格近似，未定义、超限和检测到的突变网格留空，不能据此证明函数连续。')
        .fontSize(12).fontColor('#536A7D').lineHeight(21).width('100%')
    }.width('100%')
  }
}
