Page({
  data: {
    bannerImage: '../../image/image copy 3.png',
    name: '王绥源',
    title: '智能科学与技术专业',
    school: '中国海洋大学',
    introduction: '平时喜欢跑步和健身，在规律运动中保持专注与活力；也持续关注人工智能与深度学习，乐于在学习与实践中探索技术的更多可能。',
    tags: ['跑步', '健身', '人工智能', '深度学习']
  },

  onShareAppMessage() {
    return {
      title: '这是我的小程序名片',
      path: '/pages/index/index'
    }
  }
})
