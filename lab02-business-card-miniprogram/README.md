# 实验二：名片小程序

一个用于介绍个人信息的微信小程序名片。页面以横向头图为视觉入口，用卡片布局呈现姓名、专业、学校、个人简介和关键词，并支持使用微信原生能力分享名片。

![名片头图](image/image%20copy%203.png)

## 实验目标

- 熟悉小程序中图片资源、页面数据和样式的协作方式；
- 使用 16:9 名片头图和自定义内容完成个人介绍页面；
- 使用原生分享能力将名片发送给他人。

## 功能说明

- 使用 16:9 头图作为名片顶部视觉区域，并通过 `aspectFill` 铺满展示框；
- 将姓名、专业、学校、简介和关键词集中维护在页面 `data` 中；
- 使用 `wx:for` 渲染可自动换行的关键词标签；
- 使用圆角、阴影和浅色配色组成完整的名片卡片；
- 通过 `open-type="share"` 和 `onShareAppMessage` 调用小程序原生分享功能。

页面由上到下依次展示名片头图、姓名与学校信息、个人简介、关键词和分享按钮。头图负责快速传达个人风格，下半部分使用可修改的页面数据展示个人介绍。

## 运行方式

1. 打开微信开发者工具，选择“导入项目”。
2. 选择当前 `lab02-business-card-miniprogram/` 目录；该目录包含项目所需的 `app.json`。
3. 点击“编译”，在模拟器中查看名片页面。
4. 点击“分享我的名片”，即可检查分享预览和跳转路径。

## 项目结构

```text
lab02-business-card-miniprogram/
├── app.js
├── app.json
├── app.wxss
├── image/
│   └── image copy 3.png       # 16:9 名片头图
├── pages/
│   └── index/
│       ├── index.js           # 页面数据和分享配置
│       ├── index.json         # 页面导航栏配置
│       ├── index.wxml         # 页面结构和数据绑定
│       └── index.wxss         # 名片布局与视觉样式
├── project.config.json
└── sitemap.json
```

## 实现要点

### 页面结构：WXML

页面通过数据绑定渲染头图和个人资料，并使用原生分享按钮触发分享流程：

```xml
<image wx:if="{{bannerImage}}" class="banner-image" src="{{bannerImage}}" mode="aspectFill"></image>
<text class="name">{{name}}</text>
<text wx:for="{{tags}}" wx:key="*this" class="tag">{{item}}</text>
<button class="share-button" open-type="share">分享我的名片</button>
```

### 页面数据与头图

个人资料和头图路径集中定义在 [pages/index/index.js](pages/index/index.js)：

```js
data: {
  bannerImage: '../../image/image copy 3.png',
  name: '王绥源',
  title: '智能科学与技术专业',
  school: '中国海洋大学',
  tags: ['跑步', '健身', '人工智能', '深度学习']
}
```

修改名片内容时，更新上述字段即可；WXML 会通过数据绑定自动刷新对应区域。若替换头图，请将新图片放入 `image/` 目录，并同步修改 `bannerImage` 路径。

### 分享配置

分享按钮使用小程序的原生分享入口，标题和返回页面由 `onShareAppMessage` 配置：

```js
onShareAppMessage() {
  return {
    title: '这是我的小程序名片',
    path: '/pages/index/index'
  }
}
```

## 交互流程

```text
打开页面
    ↓
读取 data 中的头图和个人资料
    ↓
WXML 渲染名片、简介和关键词
    ↓ 点击“分享我的名片”
调用微信原生分享面板
    ↓
按 onShareAppMessage 配置分享标题和页面路径
```

## 技术要点

| 文件 | 职责 |
| --- | --- |
| `pages/index/index.wxml` | 组织头图、个人资料、关键词和分享按钮，并绑定页面数据。 |
| `pages/index/index.wxss` | 控制卡片圆角、阴影、间距、字体和标签的自适应换行。 |
| `pages/index/index.js` | 保存个人资料，维护头图路径，并配置原生分享的标题与路径。 |
| `image/` | 存放本实验使用的名片头图资源。 |

本项目不依赖后端服务；个人资料和图片均为本地页面资源。
