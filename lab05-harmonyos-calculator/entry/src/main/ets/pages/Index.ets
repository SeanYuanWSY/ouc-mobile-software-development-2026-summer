import { ModePill, ScientificKey } from './ReactiveControls';
import { evaluateAngleMode } from '../core/AngleMode';
import { GeometryPanel } from './GeometryPanel';
import { FunctionSurface } from './FunctionSurface';
import { Calculator, pretty, UNIT_GROUPS, convert, statistics, quadratic, UnitGroup } from '../core/Calculator';
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';

class HistoryItem {
  expression: string = '';
  result: string = '';
  degrees: boolean = true;
  time: string = '';
}

@Entry
@Component
struct Index {
  @State tab: number = 0;
  @State expression: string = '';
  @State answer: number = 0;
  @State display: string = '0';
  @State message: string = '';
  @State degrees: boolean = true;
  @State inverse: boolean = false;
  @State memory: number = 0;
  @State history: HistoryItem[] = [];
  @State category: number = 0;
  @State from: number = 0;
  @State to: number = 1;
  @State quantity: string = '1';
  @State converted: string = '';
  @State a: string = '1';
  @State b: string = '-3';
  @State c: string = '2';
  @State roots: string = '';
  @State data: string = '85, 92, 78, 96, 89';
  @State statsRows: string[] = [];
  @State statsError: string = '';
  @State tool: number = 0;
  @State visualization: number = 0;
  @State justCalculated: boolean = false;
  @State showGuide: boolean = false;
  @State showLog: boolean = false;
  @State logBase: string = '2';
  @State logArgument: string = '8';
  private store?: preferences.Preferences;
  private engine: Calculator = new Calculator();
  private lastInput: string = '';
  private lastResolved: string = '';
  private bg: string = '#F4F7FB';
  private card: string = '#FFFFFF';
  private muted: string = '#536A7D';
  private mint: string = '#187B85';

  aboutToAppear(): void {
    this.loadHistory();
    this.changeUnit();
  }
  async loadHistory(): Promise<void> {
    try {
      this.store = await preferences.getPreferences(this.getUIContext().getHostContext() as common.UIAbilityContext, 'orbit');
      const raw = await this.store.get('history', '[]') as string;
      this.history = JSON.parse(raw) as HistoryItem[];
    } catch (e) {
      this.message = '历史记录暂不可用，本次计算仍可使用';
    }
  }
  async saveHistory(): Promise<void> {
    try {
      if (!this.store) throw new Error('存储未就绪');
      await this.store.put('history', JSON.stringify(this.history));
      await this.store.flush();
    } catch (e) { this.message = '计算已完成，但历史记录未能保存'; }
  }
  press(key: string): void {
    this.message = '';
    if (key !== '=') { this.lastInput = ''; this.lastResolved = ''; }
    if (key === 'AC') { this.expression = ''; this.display = '0'; this.justCalculated = false; return; }
    if (key === '⌫') { this.expression = this.expression.slice(0, -1); this.justCalculated = false; return; }
    if (key === '=') { this.calculate(); return; }
    if (key === '±') { this.expression = this.expression ? '-(' + this.expression + ')' : '-'; this.justCalculated = false; return; }
    if (this.justCalculated) {
      this.expression = ['+', '−', '×', '÷', '^', '!', '%'].includes(key) ? 'Ans' : '';
      this.justCalculated = false;
    }
    if (this.expression.length + key.length > 300) { this.message = '算式最多 300 字符'; return; }
    this.expression += key;
  }
  calculate(): void {
    const result = evaluateAngleMode(this.expression, this.degrees, this.answer, this.expression === this.lastInput ? this.lastResolved : '');
    this.lastInput = this.expression;
    this.lastResolved = result.resolvedExpression;
    if (result.error) { this.message = result.error; this.display = '—'; return; }
    const item = new HistoryItem();
    item.expression = result.resolvedExpression;
    item.result = pretty(result.value);
    item.degrees = this.degrees;
    item.time = new Date().toLocaleTimeString();
    this.answer = result.value;
    this.display = item.result;
    this.history = [item, ...this.history].slice(0, 100);
    this.justCalculated = true;
    this.saveHistory();
  }
  switchAngleMode(degrees: boolean): void {
    if (this.degrees === degrees) return;
    this.degrees = degrees;
    this.message = '';
    if (this.expression.trim() === '') {
      this.display = '0'; this.changeUnit(); return;
    }
    const result = evaluateAngleMode(this.expression, degrees, this.answer, this.expression === this.lastInput ? this.lastResolved : '');
    this.lastInput = this.expression;
    this.lastResolved = result.resolvedExpression;
    if (result.error) {
      this.display = '—';
      this.message = (degrees ? 'DEG 角度制：' : 'RAD 弧度制：') + result.error;
    } else {
      this.display = pretty(result.value);
      this.answer = result.value;
    }
    // Switching previews the current expression; only pressing = appends a history entry.
    this.changeUnit();
  }
  memoryAdd(): void {
    const result = this.expression ? this.engine.evaluate(this.expression, this.degrees, this.answer) : this.engine.evaluate(this.display);
    if (result.error) { this.message = result.error; return; }
    if (!Number.isFinite(this.memory + result.value)) { this.message = '记忆数值超出范围'; return; }
    this.memory += result.value;
    this.message = '已加入记忆：' + pretty(this.memory);
  }
  customLog(): void {
    const base = this.engine.evaluate(this.logBase, this.degrees, this.answer);
    const argument = this.engine.evaluate(this.logArgument, this.degrees, this.answer);
    if (base.error || argument.error) { this.message = base.error || argument.error; return; }
    this.expression = 'log(' + base.value.toString() + ',' + argument.value.toString() + ')';
    this.justCalculated = false;
    this.calculate();
  }
  copy(text: string): void {
    pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text)).then(() => {
      this.getUIContext().getPromptAction().showToast({ message: '已复制' });
    }).catch(() => { this.message = '复制失败，请重试'; });
  }
  changeUnit(): void {
    try {
      if (this.quantity.trim() === '') throw new Error('请输入数值');
      const result = this.engine.evaluate(this.quantity, this.degrees, this.answer);
      if (result.error) throw new Error(result.error);
      this.converted = pretty(convert(result.value, this.category, this.from, this.to));
    } catch (e) { this.converted = (e as Error).message; }
  }
  solve(): void {
    try {
      if ([this.a, this.b, this.c].some((s: string) => s.trim() === '')) throw new Error('请填写全部三个系数');
      this.roots = quadratic(Number(this.a), Number(this.b), Number(this.c));
    } catch (e) { this.roots = (e as Error).message; }
  }
  analyze(): void {
    try {
      const s = statistics(this.data);
      this.statsError = '';
      this.statsRows = ['数据个数|' + s.count, '总和|' + pretty(s.sum), '平均数|' + pretty(s.mean), '中位数|' + pretty(s.median), '最小值|' + pretty(s.min), '最大值|' + pretty(s.max), '总体标准差 σ|' + pretty(s.populationSD), '样本标准差 s|' + (s.count > 1 ? pretty(s.sampleSD) : '至少需要 2 个数')];
    } catch (e) { this.statsRows = []; this.statsError = (e as Error).message; }
  }
  @Builder
  calcKey(label: string, value: string, accent: boolean = false) {
    Button(label).fontSize(accent ? 23 : 21).fontWeight(FontWeight.Medium)
      .fontColor(accent ? this.mint : '#172E42').backgroundColor(accent ? '#DDEFEF' : '#FFFFFF')
      .borderRadius(15).height(42).layoutWeight(1).accessibilityText(label === '⌫' ? '删除最后一个字符' : label)
      .onClick(() => this.press(value))
  }
  @Builder
  header() {
    Row() {
      Column({ space: 3 }) {
        Text('星算 Orbit').fontSize(25).fontWeight(FontWeight.Bold).fontColor('#172E42')
        Text('让每一个结果，都有依据').fontSize(12).fontColor(this.muted)
      }.alignItems(HorizontalAlign.Start)
      Blank()
      Button('?').width(34).height(34).fontSize(18).fontColor(this.mint).backgroundColor(this.card)
        .accessibilityText('计算规则与使用说明').onClick(() => this.showGuide = !this.showGuide)
    }.width('100%').margin({ bottom: 16 })
  }
  @Builder
  calculatorPage() {
    Column({ space: 6 }) {
      Row({ space: 8 }) {
        Button('DEG · 度').fontSize(13).height(34).borderRadius(10)
          .fontColor(this.degrees ? '#FFFFFF' : this.muted).backgroundColor(this.degrees ? this.mint : '#E8EFF5')
          .onClick(() => this.switchAngleMode(true))
        Button('RAD · 弧度').fontSize(13).height(34).borderRadius(10)
          .fontColor(!this.degrees ? '#FFFFFF' : this.muted).backgroundColor(!this.degrees ? this.mint : '#E8EFF5')
          .onClick(() => this.switchAngleMode(false))
        Blank()
        Text(this.memory !== 0 ? 'M  ' + pretty(this.memory) : '科学计算').fontSize(12).fontColor(this.muted).maxLines(1)
      }.width('100%')
      Column({ space: 6 }) {
        TextInput({ text: this.expression, placeholder: '输入算式 · 如 2×sin(30)' })
          .backgroundColor(Color.Transparent).fontColor('#364F64').placeholderColor('#647A8C')
          .fontSize(19).textAlign(TextAlign.End).padding(0).height(32).maxLength(300)
          .onChange((v: string) => { this.expression = v; this.justCalculated = false; this.message = ''; this.lastInput = ''; this.lastResolved = ''; })
          .onSubmit(() => this.calculate())
        Text(this.display).fontSize(42).fontWeight(FontWeight.Medium).fontColor('#172E42')
          .maxLines(1).minFontSize(14).maxFontSize(42).height(56).textAlign(TextAlign.End).width('100%')
          .copyOption(CopyOptions.LocalDevice)
        Row() {
          Text(this.message || (this.degrees ? '角度制 · 结果保留 12 位有效数字' : '弧度制 · 结果保留 12 位有效数字'))
            .fontSize(11).fontColor(this.message ? '#A84F1D' : this.muted).layoutWeight(1)
          Button('复制').height(27).fontSize(11).fontColor(this.mint).backgroundColor(Color.Transparent)
            .onClick(() => this.copy(this.display))
        }
      }.padding(12).width('100%').backgroundColor(this.card).borderRadius(20)
      Row({ space: 6 }) {
        ModePill({ label: 'M+', selected: false, action: () => this.memoryAdd() })
        ModePill({ label: 'MR', selected: false, action: () => this.press('(' + this.memory.toString() + ')') })
        ModePill({ label: 'MC', selected: false, action: () => { this.memory = 0; this.message = '记忆已清空'; } })
        Blank()
        ModePill({ label: '反函数', selected: this.inverse, action: () => this.inverse = !this.inverse })
      }.width('100%')
      Row({ space: 6 }) {
        ScientificKey({ label: this.inverse ? 'sin⁻¹' : 'sin', value: this.inverse ? 'asin(' : 'sin(', action: (v: string) => this.press(v) }).layoutWeight(1)
        ScientificKey({ label: this.inverse ? 'cos⁻¹' : 'cos', value: this.inverse ? 'acos(' : 'cos(', action: (v: string) => this.press(v) }).layoutWeight(1)
        ScientificKey({ label: this.inverse ? 'tan⁻¹' : 'tan', value: this.inverse ? 'atan(' : 'tan(', action: (v: string) => this.press(v) }).layoutWeight(1)
        ScientificKey({ label: '(', value: '(', action: (v: string) => this.press(v) }).layoutWeight(1)
        ScientificKey({ label: ')', value: ')', action: (v: string) => this.press(v) }).layoutWeight(1)
      }
      Row({ space: 6 }) {
        ScientificKey({ label: 'ln', value: 'ln(', action: (v: string) => this.press(v) }).layoutWeight(1)
        ScientificKey({ label: 'log10', value: 'log10(', action: (v: string) => this.press(v) }).layoutWeight(1)
        ScientificKey({ label: '√', value: 'sqrt(', action: (v: string) => this.press(v) }).layoutWeight(1)
        ScientificKey({ label: 'xʸ', value: '^', action: (v: string) => this.press(v) }).layoutWeight(1)
        ScientificKey({ label: 'x!', value: '!', action: (v: string) => this.press(v) }).layoutWeight(1)
      }
      Row({ space: 6 }) {
        ScientificKey({ label: 'π', value: 'π', action: (v: string) => this.press(v) }).layoutWeight(1)
        ScientificKey({ label: 'e', value: 'e', action: (v: string) => this.press(v) }).layoutWeight(1)
        ScientificKey({ label: '|x|', value: 'abs(', action: (v: string) => this.press(v) }).layoutWeight(1)
        ScientificKey({ label: '∛', value: 'cbrt(', action: (v: string) => this.press(v) }).layoutWeight(1)
        ScientificKey({ label: 'Ans', value: 'Ans', action: (v: string) => this.press(v) }).layoutWeight(1)
      }
      Row() {
        Text('log10：底数 10 · ln：底数 e').fontSize(11).fontColor(this.muted).layoutWeight(1)
        Button(this.showLog ? '收起底数' : '自选底数').fontSize(12).height(30).fontColor(this.mint)
          .backgroundColor('#E0F2F0').onClick(() => this.showLog = !this.showLog)
      }.width('100%')
      if (this.showLog) {
        Column({ space: 8 }) {
          Text('logₐ(x)：求 a 的几次方等于 x').fontSize(13).fontColor('#364F64').width('100%')
          Row({ space: 8 }) {
            Column({ space: 4 }) {
              Text('底数 a（>0 且 ≠1）').fontSize(11).fontColor(this.muted)
              TextInput({ text: this.logBase }).fontColor('#172E42').backgroundColor('#E8EFF5').height(40).maxLength(80)
                .onChange((v: string) => this.logBase = v)
            }.layoutWeight(1)
            Column({ space: 4 }) {
              Text('真数 x（>0）').fontSize(11).fontColor(this.muted)
              TextInput({ text: this.logArgument }).fontColor('#172E42').backgroundColor('#E8EFF5').height(40).maxLength(80)
                .onChange((v: string) => this.logArgument = v)
            }.layoutWeight(1)
          }
          Button('计算自选底数对数').height(36).width('100%').fontColor('#FFFFFF').backgroundColor(this.mint).onClick(() => this.customLog())
        }.padding(12).width('100%').backgroundColor('#FFFFFF').borderRadius(14)
      }
      Row({ space: 8 }) { this.calcKey('AC', 'AC', true); this.calcKey('⌫', '⌫', true); this.calcKey('%', '%', true); this.calcKey('÷', '÷', true) }
      Row({ space: 8 }) { this.calcKey('7', '7'); this.calcKey('8', '8'); this.calcKey('9', '9'); this.calcKey('×', '×', true) }
      Row({ space: 8 }) { this.calcKey('4', '4'); this.calcKey('5', '5'); this.calcKey('6', '6'); this.calcKey('−', '−', true) }
      Row({ space: 8 }) { this.calcKey('1', '1'); this.calcKey('2', '2'); this.calcKey('3', '3'); this.calcKey('+', '+', true) }
      Row({ space: 8 }) {
        this.calcKey('±', '±'); this.calcKey('0', '0'); this.calcKey('.', '.')
        Button('=').fontSize(26).fontWeight(FontWeight.Bold).fontColor(this.bg).backgroundColor(this.mint)
          .height(42).borderRadius(15).layoutWeight(1).onClick(() => this.calculate())
      }
    }.width('100%')
  }
  @Builder
  title(text: string, detail: string) {
    Column({ space: 6 }) {
      Text(text).fontSize(23).fontWeight(FontWeight.Bold).fontColor('#172E42')
      Text(detail).fontSize(13).fontColor(this.muted).lineHeight(20)
    }.alignItems(HorizontalAlign.Start).width('100%').margin({ bottom: 18 })
  }
  @Builder
  input(label: string, value: string, change: (v: string) => void) {
    Column({ space: 7 }) {
      Text(label).fontSize(12).fontColor(this.muted).width('100%')
      TextInput({ text: value }).fontColor('#172E42').backgroundColor('#E8EFF5').borderRadius(12)
        .height(48).maxLength(100).onChange(change)
    }.layoutWeight(1).alignItems(HorizontalAlign.Start)
  }
  @Builder
  toolsPage() {
    Column({ space: 15 }) {
      Row({ space: 8 }) {
        ModePill({ label: '单位换算', selected: this.tool === 0, action: () => this.tool = 0 })
        ModePill({ label: '方程求解', selected: this.tool === 1, action: () => this.tool = 1 })
        ModePill({ label: '数据统计', selected: this.tool === 2, action: () => this.tool = 2 })
      }.width('100%')
      if (this.tool === 0) {
        Column({ space: 16 }) {
          this.title('跨越单位的边界', '7 类常用单位，即时换算。输入框也支持算式。')
          Select(UNIT_GROUPS.map((g: UnitGroup): SelectOption => { return { value: g.name }; })).selected(this.category)
            .value(UNIT_GROUPS[this.category].name).fontColor(this.mint).backgroundColor('#E8EFF5').width('100%')
            .onSelect((index: number) => { this.category = index; this.from = 0; this.to = 1; this.changeUnit(); })
          TextInput({ text: this.quantity, placeholder: '输入数值或算式' }).fontColor('#172E42').backgroundColor('#E8EFF5')
            .fontSize(23).height(60).maxLength(100).onChange((v: string) => { this.quantity = v; this.changeUnit(); })
          Text('从').fontColor(this.muted).fontSize(12).width('100%')
          Select(UNIT_GROUPS[this.category].units.map((u: string): SelectOption => { return { value: u }; }))
            .selected(this.from).value(UNIT_GROUPS[this.category].units[this.from]).fontColor('#172E42')
            .backgroundColor('#E8EFF5').width('100%').onSelect((i: number) => { this.from = i; this.changeUnit(); })
          Button('⇅  交换单位').fontColor(this.mint).backgroundColor(Color.Transparent).onClick(() => {
            const previous = this.from; this.from = this.to; this.to = previous; this.changeUnit();
          })
          Text('到').fontColor(this.muted).fontSize(12).width('100%')
          Select(UNIT_GROUPS[this.category].units.map((u: string): SelectOption => { return { value: u }; }))
            .selected(this.to).value(UNIT_GROUPS[this.category].units[this.to]).fontColor('#172E42')
            .backgroundColor('#E8EFF5').width('100%').onSelect((i: number) => { this.to = i; this.changeUnit(); })
          Text(this.converted).fontSize(30).fontColor(this.mint).width('100%').copyOption(CopyOptions.LocalDevice)
          Text(UNIT_GROUPS[this.category].units[this.to]).fontSize(13).fontColor(this.muted).width('100%')
          Text(this.category === 6 ? 'GB 使用十进制；GiB 使用二进制，避免存储容量混淆。' : '离线计算 · 无需网络或账户').fontSize(12).fontColor(this.muted).lineHeight(20)
        }.padding(20).backgroundColor(this.card).borderRadius(20).width('100%').alignItems(HorizontalAlign.Start)
      } else if (this.tool === 1) {
        Column({ space: 16 }) {
          this.title('把未知数，变成答案', '求解一元二次方程，自动处理一次方程、重根与复根。')
          Text('ax² + bx + c = 0').fontSize(27).fontColor(this.mint)
          Row({ space: 10 }) {
            this.input('系数 a', this.a, (v: string) => { this.a = v; this.roots = ''; })
            this.input('系数 b', this.b, (v: string) => { this.b = v; this.roots = ''; })
            this.input('常数 c', this.c, (v: string) => { this.c = v; this.roots = ''; })
          }
          Button('求解方程').width('100%').height(48).fontColor(this.bg).backgroundColor(this.mint).onClick(() => this.solve())
          if (this.roots) { Text(this.roots).fontSize(20).fontColor('#172E42').lineHeight(34).copyOption(CopyOptions.LocalDevice) }
          Text('判别式 Δ = b² − 4ac\nΔ > 0：两个实根；Δ = 0：重根；Δ < 0：复根。\na = 0 时按一次方程处理。').fontColor(this.muted).fontSize(13).lineHeight(23)
        }.padding(20).backgroundColor(this.card).borderRadius(20).width('100%').alignItems(HorizontalAlign.Start)
      } else {
        Column({ space: 16 }) {
          this.title('读懂一组数据', '成绩、实验测量与日常记录，快速得到描述统计。')
          TextArea({ text: this.data, placeholder: '用空格、逗号或换行分隔数字' }).height(130)
            .fontColor('#172E42').backgroundColor('#E8EFF5').maxLength(12000).onChange((v: string) => { this.data = v; this.statsRows = []; this.statsError = ''; })
          Button('计算统计量').width('100%').height(48).fontColor(this.bg).backgroundColor(this.mint).onClick(() => this.analyze())
          if (this.statsError) { Text(this.statsError).fontColor('#A84F1D').fontSize(14) }
          ForEach(this.statsRows, (row: string) => {
            Row() {
              Text(row.split('|')[0]).fontColor(this.muted).fontSize(14)
              Blank()
              Text(row.split('|')[1]).fontColor('#172E42').fontSize(17).copyOption(CopyOptions.LocalDevice)
            }.width('100%').padding({ top: 6, bottom: 6 })
          })
          Text('总体标准差除以 n；样本标准差除以 n−1。\n最多 1000 个数据，使用稳定的在线方差算法。').fontColor(this.muted).fontSize(12).lineHeight(21)
        }.padding(20).backgroundColor(this.card).borderRadius(20).width('100%').alignItems(HorizontalAlign.Start)
      }
    }.width('100%')
  }
  @Builder
  historyPage() {
    Column({ space: 12 }) {
      this.title('留住每一次推导', '最近 100 条计算保存在本机。点击记录即可重新编辑。')
      if (this.history.length === 0) {
        Text('∑').fontSize(64).fontColor(this.mint).margin({ top: 70 })
        Text('还没有计算记录').fontSize(20).fontColor('#172E42')
        Text('完成第一道算式，结果就会出现在这里。').fontSize(13).fontColor(this.muted)
      } else {
        Row() {
          Text(this.history.length + ' 条记录').fontColor(this.muted).fontSize(13)
          Blank()
          Button('清空历史').fontSize(12).fontColor('#A84F1D').backgroundColor(this.card).onClick(() => {
            this.getUIContext().getPromptAction().showDialog({ title: '清空计算历史？', message: '将删除本机保存的计算记录。', buttons: [{ text: '取消', color: '#778899' }, { text: '清空', color: '#CC5533' }] }).then((r) => {
              if (r.index === 1) { this.history = []; this.saveHistory(); }
            });
          })
        }.width('100%')
        ForEach(this.history, (item: HistoryItem, index: number) => {
          Column({ space: 10 }) {
            Row() {
              Text((item.degrees ? 'DEG' : 'RAD') + ' · ' + item.time).fontSize(11).fontColor(this.muted)
              Blank()
              Button('复制结果').fontSize(11).fontColor(this.mint).backgroundColor(Color.Transparent).height(26)
                .onClick(() => this.copy(item.result))
            }
            Text(item.expression).fontSize(16).fontColor('#364F64').width('100%')
            Text('= ' + item.result).fontSize(25).fontColor(this.mint).width('100%')
          }.padding(16).backgroundColor(this.card).borderRadius(16).width('100%').onClick(() => {
            this.lastInput = ''; this.lastResolved = '';
            this.expression = item.expression; this.degrees = item.degrees; this.justCalculated = false; this.message = ''; this.tab = 0;
          })
        }, (item: HistoryItem, index: number) => index + item.time + item.expression)
      }
    }.width('100%')
  }
  build() {
    Column() {
      Scroll() {
        Column() {
          this.header()
          if (this.showGuide) {
            Column({ space: 12 }) {
              this.title('使用说明', '离线、无广告，不申请网络权限。')
              Text('• DEG 是角度，RAD 是弧度。sin(30) 在 DEG 下等于 0.5。\n• 先乘除后加减；乘方从右向左。−2^2 = −4，(−2)^2 = 4。\n• % 表示除以 100：200×15% = 30；200+10% = 200.1。\n• 支持 2π、2(3+4)、1e-6；函数需要完整括号。\n• Ans 使用上次完整精度结果；M+ 累加记忆，MR 读取，MC 清空。\n• 所有运算使用双精度浮点数，显示 12 位有效数字；极大数或极端接近的数可能有舍入误差。\n• 历史记录保留最近 100 条。换算与工具结果可长按复制。')
                .fontSize(14).fontColor('#364F64').lineHeight(25)
              Button('开始计算').backgroundColor(this.mint).fontColor(this.bg).onClick(() => this.showGuide = false)
            }.padding(20).backgroundColor(this.card).borderRadius(20)
          } else if (this.tab === 0) { this.calculatorPage() }
          else if (this.tab === 1) { this.toolsPage() }
          else if (this.tab === 2) { this.historyPage() }
          else {
            Row({ space: 10 }) {
              ModePill({ label: '函数曲面', selected: this.visualization === 0, action: () => this.visualization = 0 })
              ModePill({ label: '几何体', selected: this.visualization === 1, action: () => this.visualization = 1 })
            }.width('100%').margin({ bottom: 16 })
            if (this.visualization === 0) { FunctionSurface() }
            else { GeometryPanel() }
          }
        }.padding({ top: 18, left: 18, right: 18, bottom: 18 }).width('100%').constraintSize({ maxWidth: 620 })
      }.layoutWeight(1).width('100%').scrollBar(BarState.Off)
      Row({ space: 3 }) {
        ModePill({ label: '⌘  计算', selected: this.tab === 0, action: () => { this.tab = 0; this.showGuide = false; } })
        ModePill({ label: '⇄  工具', selected: this.tab === 1, action: () => { this.tab = 1; this.showGuide = false; } })
        ModePill({ label: '◇  绘图', selected: this.tab === 3, action: () => { this.tab = 3; this.showGuide = false; } })
        ModePill({ label: '◷  历史', selected: this.tab === 2, action: () => { this.tab = 2; this.showGuide = false; } })
      }.justifyContent(FlexAlign.SpaceEvenly).width('100%').padding({ top: 12, bottom: 16 }).backgroundColor('#E9F0F6')
    }.width('100%').height('100%').backgroundColor(this.bg)
  }
}
