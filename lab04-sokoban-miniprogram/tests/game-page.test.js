const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { isSolved } = require('../utils/sokoban.js')

const gameWxml = fs.readFileSync(path.join(__dirname, '../pages/game/game.wxml'), 'utf8')
assert.ok(
  gameWxml.indexOf('<block wx:if="{{!showResult}}">') < gameWxml.indexOf('<canvas'),
  '成绩页显示时必须销毁 Canvas，避免真机原生层遮挡成绩按钮'
)

const storage = Object.create(null)
const modals = []
let pageDefinition = null
let loadingVisible = false
let drawDelay = 0
let redirectedUrl = ''

const canvasContext = {
  setFillStyle() {},
  fillRect() {},
  drawImage() {},
  setStrokeStyle() {},
  setLineWidth() {},
  strokeRect() {},
  draw(reserve, callback) {
    if (!callback) return
    if (drawDelay) {
      setTimeout(callback, drawDelay)
    } else {
      callback()
    }
  }
}

global.wx = {
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
  getStorageSync: (key) => storage[key] || '',
  setStorageSync: (key, value) => { storage[key] = value },
  setNavigationBarTitle() {},
  createCanvasContext: () => canvasContext,
  showToast() {},
  vibrateShort() {},
  showLoading() { loadingVisible = true },
  hideLoading() { loadingVisible = false },
  showModal: (options) => { modals.push(options) },
  redirectTo(options) { redirectedUrl = options.url },
  reLaunch() {}
}

global.Page = (definition) => {
  pageDefinition = definition
}

require('../pages/game/game.js')

function createPage() {
  const page = Object.assign({}, pageDefinition, {
    data: Object.assign({}, pageDefinition.data)
  })
  page.setData = function setData(nextData, callback) {
    this.data = Object.assign({}, this.data, nextData)
    if (callback) callback()
  }
  return page
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function swipe(page, start, end) {
  page.onBoardTouchStart({ touches: [{ clientX: start.x, clientY: start.y }] })
  page.onBoardTouchMove({ touches: [{ clientX: end.x, clientY: end.y }] })
  page.onBoardTouchEnd({ changedTouches: [{ clientX: end.x, clientY: end.y }] })
}

function assertSwipeDirection(page, end, expectedRowDelta, expectedColDelta) {
  page.restartGame(false)
  const initial = Object.assign({}, page.game.player)
  swipe(page, { x: 100, y: 100 }, end)
  assert.strictEqual(page.game.player.row, initial.row + expectedRowDelta)
  assert.strictEqual(page.game.player.col, initial.col + expectedColDelta)
}

async function run() {
  const earlyUnlockPage = createPage()
  earlyUnlockPage.onLoad({ level: 6 })
  earlyUnlockPage.onReady()
  assert.strictEqual(earlyUnlockPage.data.autoPlayUnlocked, false)
  earlyUnlockPage.requestEarlyUnlock()
  assert.strictEqual(earlyUnlockPage.data.autoPlayUnlocked, true, '点击后应立即解锁自动通关')
  earlyUnlockPage.onUnload()

  const page = createPage()
  page.onLoad({ level: 5 })
  page.onReady()
  assert.strictEqual(page.data.attemptNumber, 1, '首次进入应记录为第 1 次挑战')
  assert.strictEqual(page.data.autoPlayUnlocked, false, '首次挑战不应直接开放自动通关')

  assertSwipeDirection(page, { x: 100, y: 50 }, -1, 0)
  assertSwipeDirection(page, { x: 100, y: 150 }, 1, 0)
  assertSwipeDirection(page, { x: 50, y: 100 }, 0, -1)
  assertSwipeDirection(page, { x: 150, y: 100 }, 0, 1)

  page.restartGame(false)
  swipe(page, { x: 100, y: 100 }, { x: 112, y: 108 })
  assert.strictEqual(page.game.steps, 0, '距离过短的手势不应触发移动')
  page.onBoardTouchStart({ touches: [{ clientX: 100, clientY: 100 }] })
  page.onBoardTouchCancel()
  page.onBoardTouchEnd({ changedTouches: [{ clientX: 100, clientY: 40 }] })
  assert.strictEqual(page.game.steps, 0, '已取消的手势不应触发移动')

  page.elapsedMilliseconds = 750
  page.startTimer()
  page.pauseTimer()
  const pausedMilliseconds = page.elapsedMilliseconds
  assert.ok(pausedMilliseconds >= 750, '暂停计时不应丢失不足一秒的时间')
  page.startTimer()
  page.pauseTimer()
  assert.ok(page.elapsedMilliseconds >= pausedMilliseconds, '恢复计时后时间不应倒退')
  page.restartGame(false)

  page.showTwoStepHint()
  assert.strictEqual(page.data.isSolving, true)
  page.onHide()
  page.onShow()
  await wait(140)
  assert.strictEqual(page.data.isSolving, false)
  assert.strictEqual(page.data.assistanceUsed, false, '已取消的路线计算不应标记辅助')
  assert.strictEqual(loadingVisible, false, '取消路线计算后应关闭加载提示')

  page.showOneStepHint()
  await wait(140)
  assert.strictEqual(page.data.hintText, '下一步：↑')
  assert.strictEqual(page.data.assistanceUsed, true)

  page.restartGame(false)
  page.toggleAutoPlay()
  assert.strictEqual(page.data.isAutoPlaying, false, '未解锁时不应启动自动通关')
  assert.strictEqual(page.data.showAutoPanel, true, '未解锁时应展开解锁说明')
  page.beginAttempt()
  assert.strictEqual(page.data.attemptNumber, 2)
  assert.strictEqual(page.data.autoPlayUnlocked, true, '第二次挑战应自动解锁')
  page.toggleAutoPlay()
  await wait(900)
  assert.ok(isSolved(page.game), '自动演示应完成第 5 关')
  assert.strictEqual(storage.sokobanProgressV1[5].completed, true, '自动通关应记录已完成')
  assert.strictEqual(storage.sokobanProgressV1[5].bestMoves, undefined, '自动通关不应写入最佳纪录')
  assert.strictEqual(page.data.showResult, true, '通关后应显示独立成绩页')
  assert.strictEqual(page.data.resultScore, null, '自动演示不应显示个人分数')
  assert.strictEqual(page.data.resultGrade, '—')
  assert.strictEqual(page.data.resultHasScore, false)
  page.handleResultReplay()
  assert.strictEqual(page.data.showResult, false, '再次挑战时应先移除成绩页并重建棋盘')
  assert.strictEqual(page.game.steps, 0)
  page.toggleAutoPlay()
  await wait(900)
  assert.ok(isSolved(page.game), '成绩页关闭并重建 Canvas 后仍应能够自动通关')
  page.handleResultPrimary()
  assert.strictEqual(redirectedUrl, '/pages/game/game?level=2', '下一关应进入难度顺序中的第 2 关')

  storage.sokobanProgressV1[5].bestMoves = 3
  storage.sokobanProgressV1[5].bestTime = 0
  page.restartGame(false)
  page.movePlayer('up')
  page.movePlayer('up')
  page.movePlayer('up')
  assert.ok(isSolved(page.game), '手动操作应完成第 5 关')
  assert.strictEqual(storage.sokobanProgressV1[5].bestMoves, 3, '无辅助通关应写入最佳纪录')
  assert.ok(storage.sokobanProgressV1[5].bestTime >= 1, '快速通关不应记录为 00:00')
  assert.ok(storage.sokobanProgressV1[5].bestTimeMs > 0, '最佳用时应保留毫秒精度')
  assert.strictEqual(page.data.resultScore, 100, '最优手动通关应获得 100 分')
  assert.strictEqual(page.data.resultGrade, 'S')

  const savedBest = Object.assign({}, storage.sokobanProgressV1[5])
  page.restartGame(false)
  page.showOneStepHint()
  await wait(140)
  page.movePlayer('up')
  page.movePlayer('up')
  page.movePlayer('up')
  assert.ok(isSolved(page.game), '查看提示后仍可由玩家手动完成关卡')
  assert.strictEqual(page.data.resultScore, 80, '使用提示后手动通关最高应为 80 分')
  assert.strictEqual(page.data.resultGrade, 'B')
  assert.strictEqual(storage.sokobanProgressV1[5].bestMoves, savedBest.bestMoves)
  assert.strictEqual(storage.sokobanProgressV1[5].bestTimeMs, savedBest.bestTimeMs, '提示后手动通关不应覆盖手动最佳纪录')
  assert.strictEqual(storage.sokobanProgressV1[5].lastCompletionAssisted, true)

  page.onUnload()

  drawDelay = 60
  const modalCount = modals.length
  const unloadedPage = createPage()
  unloadedPage.onLoad({ level: 5 })
  unloadedPage.onReady()
  await wait(80)
  unloadedPage.movePlayer('up')
  unloadedPage.movePlayer('up')
  unloadedPage.movePlayer('up')
  unloadedPage.onUnload()
  await wait(100)
  assert.strictEqual(modals.length, modalCount, '页面卸载后不应弹出通关窗口')

  const restartedPage = createPage()
  restartedPage.onLoad({ level: 5 })
  restartedPage.onReady()
  await wait(80)
  restartedPage.movePlayer('up')
  restartedPage.movePlayer('up')
  restartedPage.movePlayer('up')
  restartedPage.restartGame(false)
  await wait(100)
  assert.strictEqual(modals.length, modalCount, '重开后旧对局不应弹出通关窗口')
  assert.strictEqual(restartedPage.game.steps, 0)
  restartedPage.onUnload()
  drawDelay = 0

  console.log('提示、自动通关与成绩隔离测试通过')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
