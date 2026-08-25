// index.js
Page({
  data: {
    wording: 'girl',
    imageSrc: '../../image/girl.png'
  },

  onClick() {
    const isGirl = this.data.wording === 'girl'

    this.setData({
      wording: isGirl ? 'boy' : 'girl',
      imageSrc: isGirl
        ? '../../image/boy.png'
        : '../../image/girl.png'
    })
  }
})
