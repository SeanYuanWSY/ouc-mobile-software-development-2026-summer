function getGrade(score) {
  if (score >= 95) return 'S'
  if (score >= 85) return 'A'
  if (score >= 75) return 'B'
  return 'C'
}

function calculateResult(options) {
  const minimumMoves = Math.max(1, Number(options.minimumMoves) || 1)
  const moves = Math.max(minimumMoves, Number(options.moves) || minimumMoves)
  const extraMoves = Math.max(0, moves - minimumMoves)
  const routeScore = Math.max(60, Math.round(minimumMoves / moves * 100))
  const completedByAuto = Boolean(options.completedByAuto)
  const assisted = Boolean(options.assisted)
  if (completedByAuto) {
    return {
      score: null,
      grade: '—',
      title: '演示完成',
      comment: '已看完当前局面的最优路线，本次演示不计入个人成绩。',
      extraMoves
    }
  }

  const score = assisted ? Math.min(routeScore, 80) : routeScore
  const grade = getGrade(score)

  let title = '成功破局'
  if (grade === 'S') title = '冰原大师'
  else if (grade === 'A') title = '路线高手'
  else if (grade === 'B') title = '稳稳通关'

  let comment = extraMoves === 0 ? '最优路线，一步不多。' : `比最优路线多 ${extraMoves} 步。`
  if (assisted) comment = `${comment} 本局使用了提示，最高记 80 分。`

  return { score, grade, title, comment, extraMoves }
}

module.exports = {
  getGrade,
  calculateResult
}
