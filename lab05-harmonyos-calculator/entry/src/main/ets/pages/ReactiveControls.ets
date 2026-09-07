@Component
export struct ModePill {
  @Prop label: string = '';
  @Prop selected: boolean = false;
  action: () => void = () => {};
  build() {
    Button(this.label).fontSize(13).fontColor(this.selected ? '#FFFFFF' : '#536A7D')
      .backgroundColor(this.selected ? '#187B85' : '#E8EFF5').height(34).borderRadius(10)
      .onClick(() => this.action())
  }
}

@Component
export struct ScientificKey {
  @Prop label: string = '';
  @Prop value: string = '';
  action: (value: string) => void = () => {};
  build() {
    Button(this.label).fontSize(13).padding({ left: 2, right: 2 }).fontColor('#365A70').backgroundColor('#FFFFFF')
      .width('100%').borderRadius(10).height(30).onClick(() => this.action(this.value))
  }
}
