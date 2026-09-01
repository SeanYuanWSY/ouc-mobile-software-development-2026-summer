const LEVELS = [
  {
    id: 1,
    order: 6,
    title: '破冰启程',
    difficulty: '挑战',
    source: '课程关卡',
    minimumMoves: 51,
    preview: '/images/level01.png',
    map: [
      [0, 1, 1, 1, 1, 1, 0, 0],
      [0, 1, 2, 2, 1, 1, 1, 0],
      [0, 1, 5, 4, 2, 2, 1, 0],
      [1, 1, 1, 2, 1, 2, 1, 1],
      [1, 3, 1, 2, 1, 2, 2, 1],
      [1, 3, 4, 2, 2, 1, 2, 1],
      [1, 3, 2, 2, 2, 4, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1]
    ]
  },
  {
    id: 2,
    order: 2,
    title: '曲径寻路',
    difficulty: '新手',
    source: '课程关卡',
    minimumMoves: 10,
    preview: '/images/level02.png',
    map: [
      [0, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 3, 1, 0, 0, 0],
      [0, 0, 1, 2, 1, 1, 1, 1],
      [1, 1, 1, 4, 2, 4, 3, 1],
      [1, 3, 2, 4, 5, 1, 1, 1],
      [1, 1, 1, 1, 4, 1, 0, 0],
      [0, 0, 0, 1, 3, 1, 0, 0],
      [0, 0, 0, 1, 1, 1, 0, 0]
    ]
  },
  {
    id: 3,
    order: 7,
    title: '纵横冰阵',
    difficulty: '挑战',
    source: '课程关卡',
    minimumMoves: 51,
    preview: '/images/level03.png',
    map: [
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 3, 3, 1, 0, 0],
      [0, 1, 1, 2, 3, 1, 1, 0],
      [0, 1, 2, 2, 4, 3, 1, 0],
      [1, 1, 2, 2, 5, 4, 1, 1],
      [1, 2, 2, 1, 4, 4, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1]
    ]
  },
  {
    id: 4,
    order: 8,
    title: '终极围城',
    difficulty: '困难',
    source: '课程关卡',
    minimumMoves: 61,
    preview: '/images/level04.png',
    map: [
      [0, 1, 1, 1, 1, 1, 1, 0],
      [0, 1, 3, 2, 3, 3, 1, 0],
      [0, 1, 3, 2, 4, 3, 1, 0],
      [1, 1, 1, 2, 2, 4, 1, 1],
      [1, 2, 4, 2, 2, 4, 2, 1],
      [1, 2, 1, 4, 1, 1, 2, 1],
      [1, 2, 2, 2, 5, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1]
    ]
  },
  {
    id: 5,
    order: 1,
    title: '极地训练',
    difficulty: '教学',
    source: '扩展关卡',
    minimumMoves: 3,
    map: [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 2, 3, 2, 2, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 2, 4, 2, 2, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 2, 5, 2, 2, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1]
    ]
  },
  {
    id: 6,
    order: 3,
    title: '双箱协奏',
    difficulty: '新手',
    source: '扩展关卡',
    minimumMoves: 10,
    map: [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 3, 2, 2, 3, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 4, 2, 2, 4, 2, 1],
      [1, 2, 2, 5, 2, 2, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1]
    ]
  },
  {
    id: 7,
    order: 4,
    title: '回廊换位',
    difficulty: '进阶',
    source: '扩展关卡',
    minimumMoves: 12,
    map: [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 3, 2, 2, 4, 2, 2, 1],
      [1, 2, 1, 1, 2, 5, 2, 1],
      [1, 3, 2, 2, 4, 2, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1]
    ]
  },
  {
    id: 8,
    order: 5,
    title: '极光三连',
    difficulty: '进阶',
    source: '扩展关卡',
    minimumMoves: 12,
    map: [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 3, 2, 3, 2, 3, 1],
      [1, 2, 4, 2, 4, 2, 4, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 2, 1, 2, 1, 2, 1],
      [1, 5, 2, 2, 2, 2, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1, 1]
    ]
  }
]

const ORDERED_LEVELS = LEVELS.slice().sort((first, second) => first.order - second.order)

function getLevel(levelId) {
  const id = Number(levelId)
  return LEVELS.find((level) => level.id === id) || ORDERED_LEVELS[0]
}

function getLevelNumber(levelId) {
  const index = ORDERED_LEVELS.findIndex((level) => level.id === Number(levelId))
  return index >= 0 ? index + 1 : 1
}

function getNextLevel(levelId) {
  const index = ORDERED_LEVELS.findIndex((level) => level.id === Number(levelId))
  return index >= 0 && index < ORDERED_LEVELS.length - 1 ? ORDERED_LEVELS[index + 1] : null
}

module.exports = {
  LEVELS,
  ORDERED_LEVELS,
  getLevel,
  getLevelNumber,
  getNextLevel
}
