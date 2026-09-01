const assert = require('assert')
const { calculateResult } = require('../utils/scoring.js')

assert.deepStrictEqual(
  calculateResult({ minimumMoves: 10, moves: 10, assisted: false, completedByAuto: false }),
  { score: 100, grade: 'S', title: '冰原大师', comment: '最优路线，一步不多。', extraMoves: 0 }
)

const extraMoves = calculateResult({ minimumMoves: 10, moves: 12, assisted: false, completedByAuto: false })
assert.strictEqual(extraMoves.score, 83)
assert.strictEqual(extraMoves.grade, 'B')
assert.strictEqual(extraMoves.comment, '比最优路线多 2 步。')

const hinted = calculateResult({ minimumMoves: 10, moves: 10, assisted: true, completedByAuto: false })
assert.strictEqual(hinted.score, 80, '使用提示后最高应为 80 分')
assert.strictEqual(hinted.grade, 'B')

const auto = calculateResult({ minimumMoves: 10, moves: 10, assisted: true, completedByAuto: true })
assert.strictEqual(auto.score, null, '自动演示不应计算个人分数')
assert.strictEqual(auto.grade, '—')
assert.strictEqual(auto.title, '演示完成')

console.log('通关评分规则测试通过')
