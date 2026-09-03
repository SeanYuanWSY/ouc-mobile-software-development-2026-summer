Component({
  properties: {
    emoji: { type: String, value: '🌱' },
    title: { type: String, value: '这里还是空的' },
    copy: { type: String, value: '记录第一件真实发生的事，让故事开始生长。' },
    buttonText: { type: String, value: '' }
  },
  methods: {
    handleTap() { this.triggerEvent('action'); }
  }
});
