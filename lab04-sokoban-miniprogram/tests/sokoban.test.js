const assert = require('assert')
const { LEVELS, ORDERED_LEVELS, getLevelNumber, getNextLevel } = require('../utils/levels.js')
const { createState, move, isSolved, solveShortest, TILE } = require('../utils/sokoban.js')

function countTiles(map, tile) {
  return map.reduce((total, row) => total + row.filter((value) => value === tile).length, 0)
}

let checkedIntermediateStates = 0

assert.deepStrictEqual(
  ORDERED_LEVELS.map((level) => level.id),
  [5, 2, 6, 7, 8, 1, 3, 4],
  '关卡应按难度递增展示，同时保留原始关卡 ID'
)
ORDERED_LEVELS.forEach((level, index) => {
  assert.strictEqual(getLevelNumber(level.id), index + 1, '展示编号应与难度顺序一致')
  assert.ok(
    index === 0 || level.minimumMoves >= ORDERED_LEVELS[index - 1].minimumMoves,
    '后续关卡的最短步数不应低于前一关'
  )
  const expectedNext = ORDERED_LEVELS[index + 1] || null
  assert.strictEqual(getNextLevel(level.id), expectedNext, '下一关应沿难度顺序推进')
})

LEVELS.forEach((level) => {
  assert.strictEqual(level.map.length, 8, `第 ${level.id} 关应为 8 行`)
  level.map.forEach((row) => assert.strictEqual(row.length, 8, `第 ${level.id} 关应为 8 列`))
  assert.strictEqual(countTiles(level.map, TILE.PLAYER), 1, `第 ${level.id} 关只能有一个角色`)
  assert.strictEqual(
    countTiles(level.map, TILE.BOX),
    countTiles(level.map, TILE.GOAL),
    `第 ${level.id} 关箱子数应等于目标数`
  )
  const solution = solveShortest(createState(level.map))
  assert.ok(solution.solved, `第 ${level.id} 关必须可解`)
  assert.strictEqual(
    solution.path.length,
    level.minimumMoves,
    `第 ${level.id} 关标注的最短步数应与求解器一致`
  )

  let replay = createState(level.map)
  solution.path.forEach((direction) => {
    const result = move(replay, direction)
    assert.ok(result.moved, `第 ${level.id} 关自动演示路径不应包含无效移动`)
    replay = result.state
  })
  assert.ok(isSolved(replay), `第 ${level.id} 关自动演示应能到达通关状态`)

  let stateAtPrefix = createState(level.map)
  for (let prefix = 0; prefix <= solution.path.length; prefix += 1) {
    const remaining = solveShortest(stateAtPrefix)
    assert.ok(remaining.solved, `第 ${level.id} 关最优路径第 ${prefix} 步后应仍可解`)
    let completed = stateAtPrefix
    remaining.path.forEach((direction) => {
      completed = move(completed, direction).state
    })
    assert.ok(isSolved(completed), `第 ${level.id} 关第 ${prefix} 步后的提示路径应能通关`)
    checkedIntermediateStates += 1
    if (prefix < solution.path.length) {
      stateAtPrefix = move(stateAtPrefix, solution.path[prefix]).state
    }
  }
  console.log(`第 ${level.id} 关可解，最少移动 ${solution.path.length} 步`)
})

console.log(`全部关卡结构与可解性检查通过，已验证 ${checkedIntermediateStates} 个中间局面`)
