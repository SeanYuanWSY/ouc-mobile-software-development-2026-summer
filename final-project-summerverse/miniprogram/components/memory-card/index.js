const { CATEGORIES, MOODS } = require('../../utils/constants');
Component({
  properties: {
    memory: { type: Object, value: {} },
    compact: { type: Boolean, value: false }
  },
  observers: {
    memory(memory) {
      if (!memory) return;
      this.setData({
        category: CATEGORIES[memory.category] || CATEGORIES.life,
        mood: MOODS[memory.mood] || MOODS.calm,
        cover: (memory.media || []).find((item) => item.type === 'image')?.url
          || (memory.media || []).find((item) => item.type === 'image')?.fileID
          || ''
      });
    }
  },
  data: { category: CATEGORIES.life, mood: MOODS.calm, cover: '' },
  methods: {
    open() { this.triggerEvent('open', { id: this.data.memory._id }); }
  }
});
