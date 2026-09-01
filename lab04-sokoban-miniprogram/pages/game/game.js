const { getLevel, getLevelNumber, getNextLevel } = require('../../utils/levels.js')
const { calculateResult } = require('../../utils/scoring.js')
const {
  TILE,
  createState,
  cloneState,
  move,
  isSolved,
  getGoalCount,
  getCompletedBoxCount,
  stateSignature,
  solveShortest
} = require('../../utils/sokoban.js')

const PROGRESS_KEY = 'sokobanProgressV1'
const ICONS = {
  wall: '/images/icons/stone.png',
  floor: '/images/icons/ice.png',
  goal: '/images/icons/pig.png',
  box: '/images/icons/box.png',
  player: '/images/icons/bird.png'
}
const DIRECTION_ARROWS = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→'
}
const DIRECTION_WORDS = {
  up: '上',
  down: '下',
  left: '左',
  right: '右'
}
function formatTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const rest = safeSeconds % 60
  const minuteText = minutes < 10 ? `0${minutes}` : String(minutes)
  const secondText = rest < 10 ? `0${rest}` : String(rest)
  return `${minuteText}:${secondText}`
}

function hasBestRecord(record) {
  return Boolean(record && Number.isFinite(Number(record.bestMoves)))
}

function getRecordTimeMs(record) {
  if (!record) return Infinity
  const milliseconds = Number(record.bestTimeMs)
  if (Number.isFinite(milliseconds) && milliseconds > 0) return milliseconds
  const seconds = Number(record.bestTime)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Infinity
}

function formatMoveSequence(path, count) {
  return path.slice(0, count).map((direction) => DIRECTION_ARROWS[direction]).join(' ')
}

function buildStrategyHint(state, path) {
  let replay = cloneState(state)
  const previewLimit = Math.min(path.length, 10)

  for (let index = 0; index < previewLimit; index += 1) {
    const direction = path[index]
    const result = move(replay, direction)
    if (!result.moved) break
    if (result.pushed) {
      if (index === 0) return `下一步向${DIRECTION_WORDS[direction]}推动前方的箱子。`
      const route = formatMoveSequence(path, Math.min(index, 6))
      const suffix = index > 6 ? ' …' : ''
      return `先按 ${route}${suffix} 调整站位，再向${DIRECTION_WORDS[direction]}推动箱子。`
    }
    replay = result.state
  }

  return `先按 ${formatMoveSequence(path, Math.min(path.length, 5))} 靠近下一个可推动的箱子。`
}

Page({
  data: {
    level: 1,
    levelNumber: 1,
    levelTitle: '',
    difficulty: '',
    canvasSize: 320,
    cellSize: 40,
    steps: 0,
    pushes: 0,
    completedBoxes: 0,
    goalCount: 0,
    elapsedText: '00:00',
    bestText: '暂无记录',
    canUndo: false,
    isComplete: false,
    source: '',
    minimumMoves: 0,
    hintText: '卡住时可以先查看一步或思路提示。',
    assistanceUsed: false,
    isSolving: false,
    isAutoPlaying: false,
    showAutoPanel: false,
    attemptNumber: 0,
    autoPlayUnlocked: false,
    autoUnlockText: '第二次挑战自动解锁',
    showResult: false,
    resultScore: 0,
    resultHasScore: true,
    resultGrade: 'S',
    resultTitle: '',
    resultComment: '',
    resultTime: '00:00',
    resultSteps: 0,
    resultPushes: 0,
    resultIsNewBest: false,
    hasNextLevel: false
  },

  onLoad(options) {
    this.levelConfig = getLevel(options.level)
    const levelId = this.levelConfig.id
    const levelNumber = getLevelNumber(levelId)
    this.history = []
    this.touchStartPoint = null
    this.timer = null
    this.autoTimer = null
    this.startedAt = 0
    this.elapsedSeconds = 0
    this.elapsedMilliseconds = 0
    this.assistanceUsed = false
    this.solutionCache = Object.create(null)
    this.solutionRequestId = 0
    this.gameGeneration = 0
    this.isUnloaded = false
    this.isPageVisible = true

    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const heightLimit = windowInfo.windowHeight < 720 ? 258 : 300
    const canvasSize = Math.min(windowInfo.windowWidth - 72, heightLimit)
    const progress = wx.getStorageSync(PROGRESS_KEY) || {}
    const record = progress[levelId]

    this.setData({
      level: levelId,
      levelNumber,
      levelTitle: this.levelConfig.title,
      difficulty: this.levelConfig.difficulty,
      source: this.levelConfig.source,
      minimumMoves: this.levelConfig.minimumMoves,
      canvasSize,
      cellSize: canvasSize / 8,
      bestText: hasBestRecord(record) ? `${record.bestMoves} 步 · ${formatTime(record.bestTime)}` : '暂无记录'
    })
    wx.setNavigationBarTitle({ title: `第 ${levelNumber} 关 · ${this.levelConfig.title}` })
  },

  onReady() {
    this.ctx = wx.createCanvasContext('gameCanvas', this)
    this.beginAttempt()
    this.restartGame(false)
  },

  onHide() {
    this.isPageVisible = false
    this.cancelSolutionRequest(true)
    const wasAutoPlaying = this.data.isAutoPlaying
    this.stopAutoPlay(false)
    if (wasAutoPlaying) {
      this.setData({ hintText: '自动演示已暂停，返回后可继续操作或重新演示。' })
    }
    this.pauseTimer()
  },

  onShow() {
    this.isPageVisible = true
    if (this.game && this.game.steps > 0 && !this.data.isComplete) this.startTimer()
  },

  onUnload() {
    this.isUnloaded = true
    this.cancelSolutionRequest(false)
    this.stopAutoPlay(false)
    this.pauseTimer()
  },

  startTimer() {
    if (this.timer || this.data.isComplete) return
    this.startedAt = Date.now() - this.elapsedMilliseconds
    this.timer = setInterval(() => {
      this.elapsedMilliseconds = Math.max(0, Date.now() - this.startedAt)
      this.elapsedSeconds = Math.floor(this.elapsedMilliseconds / 1000)
      this.setData({ elapsedText: formatTime(this.elapsedSeconds) })
    }, 1000)
  },

  pauseTimer() {
    if (!this.timer) return
    this.elapsedMilliseconds = Math.max(this.elapsedMilliseconds, Date.now() - this.startedAt)
    this.elapsedSeconds = Math.floor(this.elapsedMilliseconds / 1000)
    clearInterval(this.timer)
    this.timer = null
  },

  beginAttempt() {
    const progress = wx.getStorageSync(PROGRESS_KEY) || {}
    const oldRecord = progress[this.levelConfig.id] || {}
    const attemptNumber = Math.max(0, Number(oldRecord.attemptCount) || 0) + 1
    const record = Object.assign({}, oldRecord, { attemptCount: attemptNumber })
    progress[this.levelConfig.id] = record
    wx.setStorageSync(PROGRESS_KEY, progress)
    const completedBefore = Boolean(oldRecord.completed || hasBestRecord(oldRecord))
    const autoPlayUnlocked = completedBefore || attemptNumber >= 2
    this.setData({
      attemptNumber,
      autoPlayUnlocked,
      autoUnlockText: completedBefore
        ? '已通关，可随时复盘最优解'
        : (autoPlayUnlocked ? `第 ${attemptNumber} 次挑战，已解锁` : '第二次挑战自动解锁')
    })
  },

  restartGame(showToast = true) {
    this.cancelSolutionRequest(false)
    this.stopAutoPlay(false)
    this.pauseTimer()
    this.gameGeneration += 1
    this.game = createState(this.levelConfig.map)
    this.history = []
    this.elapsedSeconds = 0
    this.elapsedMilliseconds = 0
    this.startedAt = 0
    this.assistanceUsed = false
    this.setData({
      steps: 0,
      pushes: 0,
      completedBoxes: 0,
      goalCount: getGoalCount(this.game),
      elapsedText: '00:00',
      canUndo: false,
      isComplete: false,
      showResult: false,
      assistanceUsed: false,
      isSolving: false,
      isAutoPlaying: false,
      hintText: '卡住时可以先查看一步或思路提示。'
    }, () => this.drawCanvas())
    if (showToast) wx.showToast({ title: '已重新开始', icon: 'none' })
  },

  handleRestart() {
    if (this.data.isAutoPlaying || this.data.isSolving) return
    if (!this.game || this.game.steps === 0) {
      wx.showToast({ title: '还没有移动，先试一试吧', icon: 'none' })
      return
    }
    wx.showModal({
      title: '重新开始本关？',
      content: '当前移动记录会被清空，最佳成绩不会受到影响。',
      confirmText: '重新开始',
      confirmColor: '#5969e8',
      success: (result) => {
        if (result.confirm) {
          this.beginAttempt()
          this.restartGame()
        }
      }
    })
  },

  handleMove(event) {
    this.movePlayer(event.currentTarget.dataset.direction)
  },

  movePlayer(direction, options = {}) {
    if (!this.game || this.data.isComplete) return false
    if ((this.data.isAutoPlaying || this.data.isSolving) && !options.auto) return false
    const previous = cloneState(this.game)
    const result = move(this.game, direction)
    if (!result.moved) {
      if (!options.auto) wx.vibrateShort({ type: 'light' })
      return false
    }

    if (this.game.steps === 0) this.startTimer()
    this.history.push(previous)
    this.game = result.state
    if (result.pushed && !options.auto) wx.vibrateShort({ type: 'light' })

    const solved = isSolved(this.game)
    const generation = this.gameGeneration
    this.setData({
      steps: this.game.steps,
      pushes: this.game.pushes,
      completedBoxes: getCompletedBoxCount(this.game),
      canUndo: this.history.length > 0,
      isComplete: solved
    }, () => {
      this.drawCanvas(() => {
        if (this.isUnloaded || generation !== this.gameGeneration) return
        if (solved) {
          if (options.auto) this.stopAutoPlay(false)
          this.finishLevel(Boolean(options.auto))
          return
        }
        if (options.onComplete) options.onComplete()
      })
    })
    return true
  },

  undoMove() {
    if (!this.history.length || this.data.isComplete || this.data.isAutoPlaying || this.data.isSolving) return
    this.game = this.history.pop()
    this.setData({
      steps: this.game.steps,
      pushes: this.game.pushes,
      completedBoxes: getCompletedBoxCount(this.game),
      canUndo: this.history.length > 0
    }, () => this.drawCanvas())
  },

  onBoardTouchStart(event) {
    this.touchStartPoint = null
    if (this.data.isAutoPlaying || this.data.isSolving) return
    const touch = event.touches && event.touches[0]
    if (!touch) return
    this.touchStartPoint = { x: touch.clientX, y: touch.clientY, time: Date.now() }
  },

  onBoardTouchEnd(event) {
    const touch = event.changedTouches && event.changedTouches[0]
    const start = this.touchStartPoint
    this.touchStartPoint = null
    if (this.data.isAutoPlaying || this.data.isSolving) return
    if (!touch || !start || Date.now() - start.time > 900) return

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 22) return

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      this.movePlayer(deltaX > 0 ? 'right' : 'left')
    } else {
      this.movePlayer(deltaY > 0 ? 'down' : 'up')
    }
  },

  onBoardTouchMove() {
    // 由 WXML 的 catchtouchmove 拦截棋盘滑动，避免触发页面滚动。
  },

  onBoardTouchCancel() {
    this.touchStartPoint = null
  },

  toggleAutoPanel() {
    if (this.data.isAutoPlaying) {
      this.stopAutoPlay()
      return
    }
    this.setData({ showAutoPanel: !this.data.showAutoPanel })
  },

  requestEarlyUnlock() {
    if (this.data.autoPlayUnlocked) return
    this.unlockAutoPlay()
  },

  unlockAutoPlay() {
    if (this.isUnloaded) return
    this.setData({
      autoPlayUnlocked: true,
      autoUnlockText: '本次挑战已提前解锁',
      showAutoPanel: true
    })
    wx.showToast({ title: '已解锁自动通关', icon: 'none' })
  },

  cancelSolutionRequest(showMessage) {
    this.solutionRequestId += 1
    if (!this.data || !this.data.isSolving) return
    wx.hideLoading()
    if (!this.isUnloaded) {
      this.setData({
        isSolving: false,
        hintText: showMessage
          ? '路线计算已取消，可重新选择提示。'
          : this.data.hintText
      })
    }
  },

  cacheSolutionPath(initialState, path) {
    let replay = cloneState(initialState)
    path.forEach((direction, index) => {
      this.solutionCache[stateSignature(replay)] = path.slice(index)
      const result = move(replay, direction)
      if (result.moved) replay = result.state
    })
  },

  withCurrentSolution(callback) {
    if (!this.game || this.data.isComplete || this.data.isSolving || this.data.isAutoPlaying) return
    const signature = stateSignature(this.game)
    const cachedPath = this.solutionCache[signature]
    if (cachedPath) {
      callback(cachedPath.slice())
      return
    }

    const requestId = ++this.solutionRequestId
    this.setData({ isSolving: true, hintText: '正在计算当前局面的最短路线…' }, () => {
      wx.showLoading({ title: '计算最优路线', mask: true })
      setTimeout(() => {
        if (requestId !== this.solutionRequestId || this.isUnloaded || !this.isPageVisible) return
        const snapshot = cloneState(this.game)
        const result = solveShortest(snapshot)
        wx.hideLoading()
        this.setData({ isSolving: false })

        if (!result.solved) {
          this.setData({
            hintText: result.limitReached
              ? '当前局面过于复杂，建议先撤销几步。'
              : '当前局面已经无解，请撤销或重新开始。'
          })
          wx.showModal({
            title: result.limitReached ? '未找到路线' : '当前局面无解',
            content: '箱子可能被推进了死角，可以先撤销几步，或者重新开始本关。',
            showCancel: false,
            confirmText: '知道了',
            confirmColor: '#5969e8'
          })
          return
        }

        this.cacheSolutionPath(snapshot, result.path)
        callback(result.path.slice())
      }, 80)
    })
  },

  markAssistanceUsed(hintText) {
    this.assistanceUsed = true
    this.setData({ assistanceUsed: true, hintText })
  },

  showOneStepHint() {
    this.withCurrentSolution((path) => {
      this.markAssistanceUsed(`下一步：${formatMoveSequence(path, 1)}`)
    })
  },

  showTwoStepHint() {
    this.withCurrentSolution((path) => {
      const count = Math.min(2, path.length)
      this.markAssistanceUsed(`接下来 ${count} 步：${formatMoveSequence(path, count)}`)
    })
  },

  showStrategyHint() {
    this.withCurrentSolution((path) => {
      this.markAssistanceUsed(buildStrategyHint(this.game, path))
    })
  },

  toggleAutoPlay() {
    if (this.data.isAutoPlaying) {
      this.stopAutoPlay()
      return
    }
    if (!this.data.autoPlayUnlocked) {
      this.setData({ showAutoPanel: true })
      wx.showToast({ title: '首次挑战尚未解锁', icon: 'none' })
      return
    }
    this.withCurrentSolution((path) => {
      this.assistanceUsed = true
      this.setData({
        assistanceUsed: true,
        isAutoPlaying: true,
        hintText: `开始演示当前局面的最优解，共 ${path.length} 步。`
      }, () => this.playSolutionStep(path, 0))
    })
  },

  playSolutionStep(path, index) {
    if (!this.data.isAutoPlaying || index >= path.length) return
    const direction = path[index]
    this.setData({
      hintText: `自动演示 ${index + 1} / ${path.length} · ${DIRECTION_ARROWS[direction]}`
    })
    const moved = this.movePlayer(direction, {
      auto: true,
      onComplete: () => {
        if (!this.data.isAutoPlaying) return
        this.autoTimer = setTimeout(() => this.playSolutionStep(path, index + 1), 300)
      }
    })
    if (!moved) {
      this.stopAutoPlay(false)
      this.setData({ hintText: '自动演示已中断，请重新计算路线。' })
    }
  },

  stopAutoPlay(showToast = true) {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer)
      this.autoTimer = null
    }
    const wasPlaying = this.data && this.data.isAutoPlaying
    if (wasPlaying && !this.isUnloaded) {
      this.setData({
        isAutoPlaying: false,
        hintText: showToast ? '自动演示已停止，可继续自己操作。' : this.data.hintText
      })
      if (showToast) wx.showToast({ title: '已停止自动演示', icon: 'none' })
    }
  },

  drawCanvas(callback) {
    if (!this.ctx || !this.game) return
    const ctx = this.ctx
    const cell = this.data.cellSize
    const size = this.data.canvasSize

    ctx.setFillStyle('#171a29')
    ctx.fillRect(0, 0, size, size)

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const tile = this.game.base[row][col]
        const x = col * cell
        const y = row * cell
        if (tile === TILE.VOID) {
          ctx.setFillStyle('#171a29')
          ctx.fillRect(x, y, cell, cell)
          continue
        }
        const baseIcon = tile === TILE.WALL ? ICONS.wall : ICONS.floor
        ctx.drawImage(baseIcon, x, y, cell, cell)
        if (tile === TILE.GOAL) ctx.drawImage(ICONS.goal, x, y, cell, cell)
      }
    }

    this.game.boxes.forEach((box) => {
      const x = box.col * cell
      const y = box.row * cell
      ctx.drawImage(ICONS.box, x, y, cell, cell)
      if (this.game.base[box.row][box.col] === TILE.GOAL) {
        ctx.setStrokeStyle('#ffd66b')
        ctx.setLineWidth(Math.max(2, cell * .07))
        ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6)
      }
    })

    ctx.drawImage(
      ICONS.player,
      this.game.player.col * cell,
      this.game.player.row * cell,
      cell,
      cell
    )
    ctx.draw(false, callback)
  },

  finishLevel(completedByAuto = false) {
    if (this.isUnloaded) return
    this.pauseTimer()
    const finalElapsedMs = Math.max(1, this.elapsedMilliseconds)
    const finalElapsedSeconds = Math.max(1, Math.ceil(finalElapsedMs / 1000))
    this.elapsedMilliseconds = finalElapsedMs
    this.elapsedSeconds = finalElapsedSeconds
    this.setData({ elapsedText: formatTime(finalElapsedSeconds) })
    const progress = wx.getStorageSync(PROGRESS_KEY) || {}
    const oldRecord = progress[this.data.level]
    const assisted = this.assistanceUsed
    const result = calculateResult({
      minimumMoves: this.levelConfig.minimumMoves,
      moves: this.game.steps,
      assisted,
      completedByAuto
    })
    const isNewBest = !assisted && (
      !hasBestRecord(oldRecord) || this.game.steps < oldRecord.bestMoves || (
        this.game.steps === oldRecord.bestMoves && finalElapsedMs < getRecordTimeMs(oldRecord)
      )
    )
    const now = Date.now()
    const nextRecord = Object.assign({}, oldRecord, {
      completed: true,
      lastCompletedAt: now,
      lastCompletionAssisted: assisted,
      lastScore: result.score,
      lastGrade: result.grade
    })
    if (isNewBest) {
      Object.assign(nextRecord, {
        bestMoves: this.game.steps,
        bestPushes: this.game.pushes,
        bestTime: finalElapsedSeconds,
        bestTimeMs: finalElapsedMs,
        bestScore: result.score,
        bestGrade: result.grade,
        completedAt: now
      })
      this.setData({ bestText: `${this.game.steps} 步 · ${formatTime(finalElapsedSeconds)}` })
    }
    progress[this.data.level] = nextRecord
    wx.setStorageSync(PROGRESS_KEY, progress)

    this.nextLevel = getNextLevel(this.data.level)
    this.setData({
      showResult: true,
      resultScore: result.score,
      resultHasScore: result.score !== null,
      resultGrade: result.grade,
      resultTitle: result.title,
      resultComment: result.comment,
      resultTime: formatTime(finalElapsedSeconds),
      resultSteps: this.game.steps,
      resultPushes: this.game.pushes,
      resultIsNewBest: isNewBest,
      hasNextLevel: Boolean(this.nextLevel)
    })
  },

  handleResultPrimary() {
    if (this.nextLevel) {
      wx.redirectTo({ url: `/pages/game/game?level=${this.nextLevel.id}` })
    } else {
      wx.reLaunch({ url: '/pages/index/index' })
    }
  },

  handleResultReplay() {
    this.beginAttempt()
    this.setData({ showResult: false }, () => {
      this.ctx = wx.createCanvasContext('gameCanvas', this)
      this.restartGame(false)
    })
  },

  onShareAppMessage() {
    if (this.data.showResult) {
      return {
        title: this.data.resultHasScore
          ? `我在冰原推箱第 ${this.data.levelNumber} 关获得 ${this.data.resultScore} 分`
          : `我完成了冰原推箱第 ${this.data.levelNumber} 关的最优解演示`,
        path: `/pages/game/game?level=${this.data.level}`
      }
    }
    return {
      title: `冰原推箱第 ${this.data.levelNumber} 关，你能用更少步数吗？`,
      path: `/pages/game/game?level=${this.data.level}`
    }
  }
})
