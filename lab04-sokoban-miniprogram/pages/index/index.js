const { LEVELS, ORDERED_LEVELS } = require('../../utils/levels.js')
const { calculateResult } = require('../../utils/scoring.js')

const PROGRESS_KEY = 'sokobanProgressV1'

Page({
  data: {
    levels: [],
    completedCount: 0,
    totalBestMoves: 0,
    totalLevelCount: LEVELS.length
  },

  onShow() {
    this.loadProgress()
  },

  loadProgress() {
    const progress = wx.getStorageSync(PROGRESS_KEY) || {}
    let completedCount = 0
    let totalBestMoves = 0
    const levels = ORDERED_LEVELS.map((level, index) => {
      const record = progress[level.id] || null
      const completed = Boolean(record && (record.completed || Number.isFinite(Number(record.bestMoves))))
      const hasBest = Boolean(record && Number.isFinite(Number(record.bestMoves)))
      const bestResult = hasBest ? calculateResult({
        minimumMoves: level.minimumMoves,
        moves: record.bestMoves,
        assisted: false,
        completedByAuto: false
      }) : null
      if (completed) {
        completedCount += 1
      }
      if (hasBest) {
        totalBestMoves += Number(record.bestMoves) || 0
      }
      return Object.assign({}, level, {
        displayNumber: index + 1,
        record,
        completed,
        previewTiles: level.preview ? [] : level.map.reduce((tiles, row) => tiles.concat(
          row.map((tile) => ({
            tile,
            baseIcon: tile === 0 ? '' : (tile === 1 ? '/images/icons/stone.png' : '/images/icons/ice.png'),
            pieceIcon: tile === 3
              ? '/images/icons/pig.png'
              : (tile === 4 ? '/images/icons/box.png' : (tile === 5 ? '/images/icons/bird.png' : ''))
          }))
        ), []),
        recordText: hasBest
          ? `${bestResult.grade} · ${bestResult.score} 分 · ${record.bestMoves} 步`
          : (completed ? '辅助通关' : `最短 ${level.minimumMoves} 步`)
      })
    })

    this.setData({ levels, completedCount, totalBestMoves })
  },

  chooseLevel(event) {
    const level = Number(event.currentTarget.dataset.level)
    wx.navigateTo({ url: `/pages/game/game?level=${level}` })
  },

  onShareAppMessage() {
    return {
      title: `冰原推箱：${LEVELS.length} 个关卡与最优解演示`,
      path: '/pages/index/index'
    }
  }
})
