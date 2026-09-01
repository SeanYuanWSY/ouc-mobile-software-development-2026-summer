const assert = require('assert')

let pageDefinition = null
let navigatedUrl = ''

global.wx = {
  getStorageSync() {
    return {
      1: { bestMoves: 51, bestTime: 20 },
      5: { completed: true, lastCompletionAssisted: true }
    }
  },
  navigateTo(options) {
    navigatedUrl = options.url
  }
}

global.Page = (definition) => {
  pageDefinition = definition
}

require('../pages/index/index.js')

const page = Object.assign({}, pageDefinition, {
  data: Object.assign({}, pageDefinition.data)
})
page.setData = function setData(nextData) {
  this.data = Object.assign({}, this.data, nextData)
}

page.onShow()
assert.strictEqual(page.data.completedCount, 2, '普通通关和辅助通关都应计入已通关')
assert.strictEqual(page.data.totalBestMoves, 51, '辅助通关不应计入最佳总步数')
assert.deepStrictEqual(page.data.levels.map((level) => level.id), [5, 2, 6, 7, 8, 1, 3, 4])
assert.strictEqual(page.data.levels.find((level) => level.id === 1).recordText, 'S · 100 分 · 51 步')
assert.strictEqual(page.data.levels.find((level) => level.id === 5).recordText, '辅助通关')
assert.strictEqual(page.data.levels.find((level) => level.id === 5).completed, true)
assert.strictEqual(page.data.levels.find((level) => level.id === 5).displayNumber, 1)
assert.ok(
  page.data.levels.find((level) => level.id === 5).previewTiles.every((tile) => (
    !tile.baseIcon || tile.baseIcon.startsWith('/images/icons/')
  )),
  '扩展关卡预览应复用真实游戏素材'
)

page.chooseLevel({ currentTarget: { dataset: { level: 5 } } })
assert.strictEqual(navigatedUrl, '/pages/game/game?level=5')

console.log('首页通关状态与最佳成绩分离测试通过')
