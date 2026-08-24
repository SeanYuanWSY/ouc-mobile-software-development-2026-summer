// index.js
Page({
  data: {
    wording: 'girl',
    imageSrc: '../../image/1b0ac8377d2d85b1925d444019ad68fc.png'
  },

  onClick() {
    const isGirl = this.data.wording === 'girl'

    this.setData({
      wording: isGirl ? 'boy' : 'girl',
      imageSrc: isGirl
        ? '../../image/90c3cc0cc2e07d8a80744089ce048655.png'
        : '../../image/1b0ac8377d2d85b1925d444019ad68fc.png'
    })
  }
})
