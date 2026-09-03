Component({
  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    taped: { type: Boolean, value: false },
    plain: { type: Boolean, value: false }
  },
  options: { multipleSlots: true }
});
