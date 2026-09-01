const TILE = {
  VOID: 0,
  WALL: 1,
  FLOOR: 2,
  GOAL: 3,
  BOX: 4,
  PLAYER: 5
}

const DIRECTIONS = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 }
}

function positionKey(row, col) {
  return `${row},${col}`
}

function cloneState(state) {
  return {
    base: state.base.map((row) => row.slice()),
    boxes: state.boxes.map((box) => ({ row: box.row, col: box.col })),
    player: { row: state.player.row, col: state.player.col },
    steps: state.steps,
    pushes: state.pushes
  }
}

function createState(rawMap) {
  const base = rawMap.map((row) => row.slice())
  const boxes = []
  let player = null

  for (let row = 0; row < base.length; row += 1) {
    for (let col = 0; col < base[row].length; col += 1) {
      if (base[row][col] === TILE.BOX) {
        boxes.push({ row, col })
        base[row][col] = TILE.FLOOR
      } else if (base[row][col] === TILE.PLAYER) {
        player = { row, col }
        base[row][col] = TILE.FLOOR
      }
    }
  }

  if (!player) throw new Error('关卡缺少玩家起点')

  return {
    base,
    boxes,
    player,
    steps: 0,
    pushes: 0
  }
}

function isWalkable(state, row, col) {
  const line = state.base[row]
  return Boolean(line && (line[col] === TILE.FLOOR || line[col] === TILE.GOAL))
}

function findBoxIndex(state, row, col) {
  return state.boxes.findIndex((box) => box.row === row && box.col === col)
}

function move(state, directionName) {
  const direction = DIRECTIONS[directionName]
  if (!direction) return { moved: false, pushed: false, state }

  const target = {
    row: state.player.row + direction.row,
    col: state.player.col + direction.col
  }

  if (!isWalkable(state, target.row, target.col)) {
    return { moved: false, pushed: false, state }
  }

  const targetBoxIndex = findBoxIndex(state, target.row, target.col)
  const next = cloneState(state)
  let pushed = false

  if (targetBoxIndex >= 0) {
    const boxTarget = {
      row: target.row + direction.row,
      col: target.col + direction.col
    }
    const boxBlocked = findBoxIndex(state, boxTarget.row, boxTarget.col) >= 0
    if (!isWalkable(state, boxTarget.row, boxTarget.col) || boxBlocked) {
      return { moved: false, pushed: false, state }
    }
    next.boxes[targetBoxIndex] = boxTarget
    next.pushes += 1
    pushed = true
  }

  next.player = target
  next.steps += 1
  return { moved: true, pushed, state: next }
}

function isSolved(state) {
  return state.boxes.length > 0 && state.boxes.every((box) => (
    state.base[box.row][box.col] === TILE.GOAL
  ))
}

function getGoalCount(state) {
  return state.base.reduce((total, row) => total + row.filter((tile) => tile === TILE.GOAL).length, 0)
}

function getCompletedBoxCount(state) {
  return state.boxes.filter((box) => state.base[box.row][box.col] === TILE.GOAL).length
}

function stateSignature(state) {
  const boxes = state.boxes
    .map((box) => positionKey(box.row, box.col))
    .sort()
    .join('|')
  return `${positionKey(state.player.row, state.player.col)}:${boxes}`
}

function isStaticBlock(state, row, col) {
  const line = state.base[row]
  return !line || line[col] === TILE.VOID || line[col] === TILE.WALL || typeof line[col] === 'undefined'
}

function hasCornerDeadlock(state) {
  return state.boxes.some((box) => {
    if (state.base[box.row][box.col] === TILE.GOAL) return false
    const up = isStaticBlock(state, box.row - 1, box.col)
    const down = isStaticBlock(state, box.row + 1, box.col)
    const left = isStaticBlock(state, box.row, box.col - 1)
    const right = isStaticBlock(state, box.row, box.col + 1)
    return (up && left) || (up && right) || (down && left) || (down && right)
  })
}

function reconstructPath(parents, solvedSignature) {
  const path = []
  let signature = solvedSignature
  let entry = parents.get(signature)

  while (entry) {
    path.push(entry.direction)
    signature = entry.previous
    entry = parents.get(signature)
  }

  return path.reverse()
}

function solveShortest(initialState, maxStates = 250000) {
  const initialSignature = stateSignature(initialState)
  if (isSolved(initialState)) {
    return { solved: true, path: [], explored: 1, limitReached: false }
  }

  const queue = [{ state: initialState, signature: initialSignature }]
  const parents = new Map([[initialSignature, null]])

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]

    for (const direction of Object.keys(DIRECTIONS)) {
      const result = move(current.state, direction)
      if (!result.moved || hasCornerDeadlock(result.state)) continue

      const signature = stateSignature(result.state)
      if (parents.has(signature)) continue

      parents.set(signature, {
        previous: current.signature,
        direction
      })

      if (isSolved(result.state)) {
        return {
          solved: true,
          path: reconstructPath(parents, signature),
          explored: parents.size,
          limitReached: false
        }
      }

      if (parents.size >= maxStates) {
        return { solved: false, path: [], explored: parents.size, limitReached: true }
      }

      queue.push({ state: result.state, signature })
    }
  }

  return { solved: false, path: [], explored: parents.size, limitReached: false }
}

module.exports = {
  TILE,
  DIRECTIONS,
  createState,
  cloneState,
  move,
  isSolved,
  getGoalCount,
  getCompletedBoxCount,
  stateSignature,
  hasCornerDeadlock,
  solveShortest
}
