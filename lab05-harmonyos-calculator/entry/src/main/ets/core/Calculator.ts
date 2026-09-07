// Recursive descent parser. No eval or executable user input.
// Precedence: sum -> product -> unary -> power (right associative) -> postfix.
export class Calculation {
  value: number = 0;
  error: string = '';
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error('结果超出范围或不在实数域');
  return value;
}

export function pretty(value: number): string {
  if (Object.is(value, -0) || value === 0) return '0';
  return Number(value.toPrecision(12)).toString();
}

export class Calculator {
  private input: string = '';
  private pos: number = 0;
  private degrees: boolean = true;
  private answer: number = 0;
  private variableX: number = 0;
  private variableY: number = 0;
  private variables: boolean = false;
  evaluate(expression: string, degrees: boolean = true, answer: number = 0, variableX: number = 0, variableY: number = 0, variables: boolean = false): Calculation {
    const result = new Calculation();
    this.input = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/\s/g, '');
    this.pos = 0;
    this.degrees = degrees;
    this.answer = answer;
    this.variableX = variableX; this.variableY = variableY; this.variables = variables;
    try {
      if (this.input.length === 0) throw new Error('请先输入算式');
      if (this.input.length > 300) throw new Error('算式过长，请分步计算');
      result.value = this.sum();
      if (this.pos !== this.input.length) throw new Error('无法识别的位置：' + this.input.slice(this.pos, this.pos + 8));
      if (!Number.isFinite(result.value)) throw new Error('结果超出范围或不在实数域');
    } catch (e) {
      result.error = (e as Error).message;
    }
    return result;
  }
  private take(s: string): boolean {
    if (this.input.slice(this.pos, this.pos + s.length) !== s) return false;
    this.pos += s.length;
    return true;
  }
  private sum(): number {
    let x = this.product();
    while (true) {
      if (this.take('+')) x = finite(x + this.product());
      else if (this.take('-')) x = finite(x - this.product());
      else return x;
    }
  }
  private product(): number {
    let x = this.unary();
    while (true) {
      if (this.take('*')) x = finite(x * this.unary());
      else if (this.take('/')) {
        const y = this.unary();
        if (y === 0) throw new Error('除数不能为 0');
        x = finite(x / y);
      } else if (this.pos < this.input.length && /[a-zA-Z(]/.test(this.input.charAt(this.pos))) {
        x = finite(x * this.unary()); // 2π, 2(3+4), 2sin(30)
      } else return x;
    }
  }
  private unary(): number {
    if (this.take('+')) return this.unary();
    if (this.take('-')) return -this.unary();
    return this.power();
  }
  private power(): number {
    const x = this.postfix();
    if (this.take('^')) return finite(Math.pow(x, this.unary()));
    return x;
  }
  private postfix(): number {
    let x = finite(this.atom());
    while (true) {
      if (this.take('%')) x /= 100;
      else if (this.take('!')) {
        if (!Number.isInteger(x) || x < 0 || x > 170) throw new Error('阶乘只支持 0～170 的整数');
        let f = 1;
        for (let i = 2; i <= x; i++) f *= i;
        x = f;
      } else return x;
    }
  }
  private atom(): number {
    if (this.take('(')) {
      const x = this.sum();
      if (!this.take(')')) throw new Error('缺少右括号 )');
      return x;
    }
    const rest = this.input.slice(this.pos);
    const num = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (num !== null) {
      this.pos += num[0].length;
      return finite(Number(num[0]));
    }
    const name = rest.match(/^[a-zA-Z][a-zA-Z0-9]*/);
    if (name === null) throw new Error('此处需要数字或函数');
    const fn = name[0];
    this.pos += fn.length;
    if (fn === 'pi') return Math.PI;
    if (fn === 'e') return Math.E;
    if (fn === 'Ans') return finite(this.answer);
    if (this.variables && fn === 'x') return finite(this.variableX);
    if (this.variables && fn === 'y') return finite(this.variableY);
    if (!this.take('(')) throw new Error('函数需要括号，如 sin(30)');
    const x = this.sum();
    if (fn === 'log' && this.take(',')) {
      const argument = this.sum();
      if (!this.take(')')) throw new Error('自选底数格式：log(底数,真数)');
      if (x <= 0 || x === 1) throw new Error('对数底数必须大于 0 且不等于 1');
      if (argument <= 0) throw new Error('对数真数必须大于 0');
      return finite(Math.log(argument) / Math.log(x));
    }
    if (!this.take(')')) throw new Error('缺少右括号 )');
    const rad = this.degrees ? x * Math.PI / 180 : x;
    const angle = this.degrees ? 180 / Math.PI : 1;
    switch (fn) {
      case 'sin': return Math.sin(rad);
      case 'cos': return Math.cos(rad);
      case 'tan':
        if (Math.abs(Math.cos(rad)) < 1e-14) throw new Error('此角度的 tan 无定义');
        return Math.tan(rad);
      case 'asin':
      case 'acos':
        if (Math.abs(x) > 1) throw new Error('反三角函数输入应在 −1～1');
        return (fn === 'asin' ? Math.asin(x) : Math.acos(x)) * angle;
      case 'atan': return Math.atan(x) * angle;
      case 'sqrt':
        if (x < 0) throw new Error('实数平方根要求输入 ≥ 0');
        return Math.sqrt(x);
      case 'cbrt': return Math.cbrt(x);
      case 'ln':
      case 'log':
      case 'log10':
        if (x <= 0) throw new Error('对数要求输入 > 0');
        return fn === 'ln' ? Math.log(x) : Math.log10(x);
      case 'abs': return Math.abs(x);
      case 'exp': return Math.exp(x);
      default: throw new Error('未知函数：' + fn);
    }
  }
}

export class UnitGroup {
  name: string;
  units: string[];
  factors: number[];
  constructor(name: string, units: string[], factors: number[]) {
    this.name = name; this.units = units; this.factors = factors;
  }
}
export const UNIT_GROUPS: UnitGroup[] = [
  new UnitGroup('长度', ['米 m', '千米 km', '厘米 cm', '毫米 mm', '英寸 in', '英尺 ft', '英里 mi'], [1, 1000, 0.01, 0.001, 0.0254, 0.3048, 1609.344]),
  new UnitGroup('质量', ['千克 kg', '克 g', '毫克 mg', '吨 t', '磅 lb', '盎司 oz'], [1, 0.001, 0.000001, 1000, 0.45359237, 0.028349523125]),
  new UnitGroup('温度', ['摄氏 °C', '华氏 °F', '开尔文 K'], [1, 1, 1]),
  new UnitGroup('面积', ['平方米 m²', '平方千米 km²', '公顷 ha', '亩', '平方英尺 ft²'], [1, 1e6, 10000, 2000 / 3, 0.09290304]),
  new UnitGroup('体积', ['升 L', '毫升 mL', '立方米 m³', '美制加仑 gal'], [1, 0.001, 1000, 3.785411784]),
  new UnitGroup('速度', ['米/秒 m/s', '千米/时 km/h', '英里/时 mph', '节 kn'], [1, 1 / 3.6, 0.44704, 1852 / 3600]),
  new UnitGroup('数据', ['字节 B', 'KB（1000 B）', 'MB', 'GB', 'KiB（1024 B）', 'MiB', 'GiB'], [1, 1000, 1e6, 1e9, 1024, 1048576, 1073741824])
];
export function convert(value: number, category: number, from: number, to: number): number {
  const group = UNIT_GROUPS[category];
  if (!Number.isFinite(value) || !group || from < 0 || to < 0 || from >= group.units.length || to >= group.units.length) throw new Error('请输入有效的数值和单位');
  if (category === 2) {
    const c = from === 0 ? value : from === 1 ? (value - 32) * 5 / 9 : value - 273.15;
    if (c < -273.15 - 1e-10) throw new Error('温度不能低于绝对零度');
    return finite(to === 0 ? c : to === 1 ? c * 9 / 5 + 32 : c + 273.15);
  }
  const result = value * group.factors[from] / group.factors[to];
  if (!Number.isFinite(result)) throw new Error('换算结果超出范围');
  return result;
}

export class Stats {
  count: number = 0; sum: number = 0; mean: number = 0; median: number = 0;
  min: number = 0; max: number = 0; populationSD: number = 0; sampleSD: number = 0;
}
export function statistics(input: string): Stats {
  const parts = input.trim().split(/[\s,，;；]+/);
  if (input.trim() === '' || parts.length > 1000) throw new Error('请输入 1～1000 个数字，用空格或逗号分隔');
  const values: number[] = [];
  const s = new Stats();
  let m2 = 0;
  for (const token of parts) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) throw new Error('无法识别的数据：' + token);
    const x = Number(token);
    if (!Number.isFinite(x)) throw new Error('数据超出范围');
    values.push(x);
    s.count++;
    s.sum += x;
    const delta = x - s.mean;
    s.mean += delta / s.count;
    m2 += delta * (x - s.mean); // Welford avoids subtracting large squared sums.
  }
  values.sort((a: number, b: number) => a - b);
  s.min = values[0]; s.max = values[s.count - 1];
  if (m2 === 0 && s.min !== s.max) throw new Error('数据差异过小，超出浮点精度范围，请先放大数据');
  s.median = s.count % 2 ? values[Math.floor(s.count / 2)] : values[s.count / 2 - 1] / 2 + values[s.count / 2] / 2;
  s.populationSD = Math.sqrt(Math.max(0, m2 / s.count));
  s.sampleSD = s.count > 1 ? Math.sqrt(Math.max(0, m2 / (s.count - 1))) : NaN;
  if (!Number.isFinite(s.sum) || !Number.isFinite(s.mean) || !Number.isFinite(s.populationSD)) throw new Error('数据计算超出范围');
  return s;
}
export function quadratic(a: number, b: number, c: number): string {
  if (![a, b, c].every((x: number) => Number.isFinite(x))) throw new Error('系数必须是有限数值');
  if (a === 0) return b === 0 ? (c === 0 ? '恒等式：任意实数都是解' : '矛盾式：无解') : '一次方程：x = ' + pretty(finite(-c / b));
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
  if (a / scale === 0 || (b !== 0 && b / scale === 0) || (c !== 0 && c / scale === 0)) throw new Error('系数量级差异过大，超出浮点精度范围');
  a /= scale; b /= scale; c /= scale;
  if ((b !== 0 && b * b === 0) || (c !== 0 && 4 * a * c === 0)) throw new Error('判别式超出浮点精度范围，请调整系数');
  const d = b * b - 4 * a * c;
  if (d < 0) return '共轭复根\nx₁ = ' + pretty(finite(-b / (2 * a))) + ' + ' + pretty(finite(Math.sqrt(-d) / (2 * Math.abs(a)))) + 'i\nx₂ = ' + pretty(finite(-b / (2 * a))) + ' − ' + pretty(finite(Math.sqrt(-d) / (2 * Math.abs(a)))) + 'i';
  if (d === 0) return '两个相等的实根\nx₁ = x₂ = ' + pretty(finite(-b / (2 * a)));
  const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(d));
  const x1 = q / a;
  const x2 = c / q;
  if (!Number.isFinite(x1) || !Number.isFinite(x2)) throw new Error('根超出数值范围');
  return '两个不同的实根\nx₁ = ' + pretty(x1) + '\nx₂ = ' + pretty(x2);
}
