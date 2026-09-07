import { SOLID_NAMES, solidInfo, solidMesh, viewFaces, Vec3, rotatePoint, DrawFace } from '../core/Geometry';
import { pretty } from '../core/Calculator';

@Component
export struct GeometryPanel {
  @State kind: number = 0;
  @State a: number = 4;
  @State b: number = 3;
  @State h: number = 5;
  @State yaw: number = 35;
  @State pitch: number = -20;
  @State zoom: number = 1;
  @State wire: boolean = false;
  @State unit: string = 'cm';
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private ready: boolean = false;
  private startYaw: number = 0;
  private startPitch: number = 0;

  draw(): void {
    if (!this.ready) return;
    const ctx = this.context;
    const width = ctx.width;
    const height = ctx.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#F0F6FA'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#E0EAF0'; ctx.lineWidth = .6;
    for (let x = 0; x < width; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    const scale = Math.min(width, height) * .34 * this.zoom;
    const cx = width / 2; const cy = height / 2;
    const faces = viewFaces(solidMesh(this.kind, this.a, this.b, this.h), this.yaw * Math.PI / 180, this.pitch * Math.PI / 180);
    for (const face of faces) {
      ctx.beginPath();
      for (let i = 0; i < face.points.length; i++) {
        const p = face.points[i];
        if (i === 0) ctx.moveTo(cx + p.x * scale, cy - p.y * scale);
        else ctx.lineTo(cx + p.x * scale, cy - p.y * scale);
      }
      ctx.closePath();
      if (!this.wire) {
        ctx.fillStyle = 'rgb(' + Math.round(55 + 85 * face.light) + ',' + Math.round(128 + 85 * face.light) + ',' + Math.round(155 + 80 * face.light) + ')';
        ctx.fill();
      }
      ctx.strokeStyle = this.wire ? '#397F98' : '#548FA4';
      ctx.lineWidth = this.wire ? .65 : .45;
      ctx.stroke();
    }
    const axis: Vec3[] = [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)];
    const colors: string[] = ['#B84E54', '#167765', '#4C65B5'];
    const labels: string[] = ['X', 'Y', 'Z'];
    for (let i = 0; i < 3; i++) {
      const p = rotatePoint(axis[i], this.yaw * Math.PI / 180, this.pitch * Math.PI / 180);
      ctx.beginPath(); ctx.moveTo(38, height - 37); ctx.lineTo(38 + p.x * 23, height - 37 - p.y * 23);
      ctx.strokeStyle = colors[i]; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.fillStyle = colors[i]; ctx.font = '11px sans-serif';
      ctx.fillText(labels[i], 35 + p.x * 32, height - 33 - p.y * 32);
    }
    ctx.fillStyle = '#546879'; ctx.font = '11px sans-serif';
    ctx.fillText('正交投影 · 拖动旋转', width - 133, height - 16);
  }
  @Builder
  dimension(label: string, value: number, changed: (v: number) => void) {
    Column({ space: 2 }) {
      Row() {
        Text(label).fontColor('#4B6173').fontSize(13)
        Blank()
        Text(value.toFixed(1) + ' ' + this.unit).fontColor('#172E42').fontSize(14).fontWeight(FontWeight.Medium)
      }.width('100%')
      Slider({ value: value, min: 1, max: 10, step: .1 }).selectedColor('#187B85').trackColor('#DBE7EE')
        .blockColor('#187B85').onChange((v: number) => { changed(v); this.draw(); })
        .accessibilityText(label)
    }.width('100%')
  }
  build() {
    Column({ space: 14 }) {
      Row() {
        Column({ space: 4 }) {
          Text('立体几何实验室').fontSize(23).fontWeight(FontWeight.Bold).fontColor('#172E42')
          Text('转一转，看清形状与公式的关系').fontSize(12).fontColor('#536A7D')
        }.alignItems(HorizontalAlign.Start)
        Blank()
        Text('3D').fontSize(16).fontWeight(FontWeight.Bold).fontColor('#187B85').padding(9).backgroundColor('#E0F2F0').borderRadius(12)
      }.width('100%')
      Row({ space: 8 }) {
        Select(SOLID_NAMES.map((name: string): SelectOption => { return { value: name }; }))
          .selected(this.kind).value(SOLID_NAMES[this.kind]).fontColor('#172E42').backgroundColor('#E9F0F5').layoutWeight(1)
          .onSelect((i: number) => { this.kind = i; this.draw(); })
        Button(this.wire ? '线框' : '实体').fontSize(13).fontColor('#187B85').backgroundColor('#E0F2F0')
          .onClick(() => { this.wire = !this.wire; this.draw(); })
        Button('复位').fontSize(13).fontColor('#526B7C').backgroundColor('#E9F0F5').onClick(() => {
          this.yaw = 35; this.pitch = -20; this.zoom = 1; this.draw();
        })
      }.width('100%')
      Canvas(this.context).width('100%').height(265).borderRadius(18).clip(true)
        .onReady(() => { this.ready = true; this.draw(); })
        .onAreaChange(() => this.draw())
        .accessibilityText(SOLID_NAMES[this.kind] + '三维视图，可拖动旋转，也可使用下方角度滑块')
        .gesture(PanGesture().onActionStart(() => { this.startYaw = this.yaw; this.startPitch = this.pitch; })
          .onActionUpdate((e: GestureEvent) => {
            this.yaw = ((this.startYaw + e.offsetX * .6) % 360 + 360) % 360;
            this.pitch = Math.max(-85, Math.min(85, this.startPitch - e.offsetY * .5));
            this.draw();
          }))
      Column({ space: 8 }) {
        Row() {
          Text('尺寸参数').fontSize(15).fontWeight(FontWeight.Medium).fontColor('#172E42')
          Blank()
          Select([{ value: 'cm' }, { value: 'm' }]).value(this.unit).fontColor('#187B85').backgroundColor('#E9F0F5')
            .onSelect((i: number) => this.unit = i === 0 ? 'cm' : 'm')
        }.width('100%')
        this.dimension(this.kind >= 2 && this.kind <= 4 ? '半径 r' : this.kind === 0 ? '长 a' : '边长 a', this.a, (v: number) => this.a = v)
        if (this.kind === 0) { this.dimension('宽 b', this.b, (v: number) => this.b = v) }
        if (this.kind !== 1 && this.kind !== 2) { this.dimension('高 h', this.h, (v: number) => this.h = v) }
        Text('尺寸按所选单位解释；图形自动适配窗口，保持各边比例。').fontSize(11).fontColor('#536A7D').lineHeight(17)
      }.padding(16).backgroundColor('#FFFFFF').borderRadius(18).width('100%')
      Row({ space: 10 }) {
        Column({ space: 6 }) {
          Text('体积 V').fontSize(12).fontColor('#536A7D')
          Text(pretty(solidInfo(this.kind, this.a, this.b, this.h).volume)).fontSize(23).minFontSize(14).maxFontSize(23).maxLines(1).fontColor('#176D78').copyOption(CopyOptions.LocalDevice)
          Text(this.unit + '³').fontSize(12).fontColor('#536A7D')
        }.padding(15).layoutWeight(1).backgroundColor('#E0F2F0').borderRadius(16).alignItems(HorizontalAlign.Start)
        Column({ space: 6 }) {
          Text('表面积 S').fontSize(12).fontColor('#536A7D')
          Text(pretty(solidInfo(this.kind, this.a, this.b, this.h).area)).fontSize(23).minFontSize(14).maxFontSize(23).maxLines(1).fontColor('#176D78').copyOption(CopyOptions.LocalDevice)
          Text(this.unit + '²').fontSize(12).fontColor('#536A7D')
        }.padding(15).layoutWeight(1).backgroundColor('#E0F2F0').borderRadius(16).alignItems(HorizontalAlign.Start)
      }.width('100%')
      Text(solidInfo(this.kind, this.a, this.b, this.h).formula).fontSize(14).lineHeight(24).fontColor('#364F64')
        .padding(16).width('100%').backgroundColor('#FFFFFF').borderRadius(16)
      Column({ space: 6 }) {
        Text('视角与缩放').fontSize(15).fontColor('#172E42').width('100%')
        Text('水平角 ' + this.yaw.toFixed(0) + '°').fontSize(12).fontColor('#536A7D').width('100%')
        Slider({ value: this.yaw, min: 0, max: 360, step: 1 }).selectedColor('#187B85').onChange((v: number) => { this.yaw = v; this.draw(); }).accessibilityText('水平旋转角度')
        Text('俯仰角 ' + this.pitch.toFixed(0) + '°').fontSize(12).fontColor('#536A7D').width('100%')
        Slider({ value: this.pitch, min: -85, max: 85, step: 1 }).selectedColor('#187B85').onChange((v: number) => { this.pitch = v; this.draw(); }).accessibilityText('俯仰角度')
        Text('缩放 ' + this.zoom.toFixed(2) + '×').fontSize(12).fontColor('#536A7D').width('100%')
        Slider({ value: this.zoom, min: .6, max: 1.3, step: .05 }).selectedColor('#187B85').onChange((v: number) => { this.zoom = v; this.draw(); }).accessibilityText('图形缩放')
      }.padding(16).width('100%').backgroundColor('#FFFFFF').borderRadius(16)
    }.width('100%')
  }
}
