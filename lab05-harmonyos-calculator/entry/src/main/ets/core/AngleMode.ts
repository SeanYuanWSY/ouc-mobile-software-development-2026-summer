import { Calculator } from './Calculator';

export class ModeResult {
  resolvedExpression: string = '';
  value: number = 0;
  error: string = '';
}

// Freeze Ans to its original operand so DEG -> RAD -> DEG does not accumulate results.
export function evaluateAngleMode(expression: string, degrees: boolean, answer: number, frozenExpression: string = ''): ModeResult {
  const result = new ModeResult();
  result.resolvedExpression = frozenExpression || expression.replace(/\bAns\b/g, '(' + answer.toString() + ')');
  const calculation = new Calculator().evaluate(result.resolvedExpression, degrees);
  result.value = calculation.value;
  result.error = calculation.error;
  return result;
}
