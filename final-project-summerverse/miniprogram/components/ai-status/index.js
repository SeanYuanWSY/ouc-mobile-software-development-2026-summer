Component({
  properties: {
    ready: { type: Boolean, value: false },
    label: { type: String, value: '' }
  },
  methods: {
    open() { this.triggerEvent('open'); }
  }
});
