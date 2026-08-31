// 本地新闻数据，标题、日期与图片均来自中国海洋大学新闻网公开报道。
// 摘要与正文为课程演示所需的精简整理，原文链接随每条新闻一并保留。
const news = [
  {
    id: '122559',
    title: '中国海洋大学2026级研究生开学典礼举行',
    poster: '/images/news-opening.jpg',
    content: '海纳新知，逐梦启航。8月24日，中国海洋大学2026级研究生开学典礼在崂山校区综合体育馆举行。来自五湖四海的新同学齐聚海大园，从这里开启新的学习与科研旅程。典礼通过迎新寄语、奖学金表彰和新生发言等环节，鼓励研究生胸怀蓝色梦想，在探索未知中增长本领。',
    summary: '六千余名研究生新生齐聚海大园，开启逐梦新征程。',
    add_date: '2026-08-24',
    category: '迎新',
    reading_time: '约 2 分钟',
    source_name: '中国海洋大学新闻网',
    source_url: 'https://news.ouc.edu.cn/2026/0824/c91a122559/page.htm'
  },
  {
    id: '122555',
    title: '中国海洋大学2026级研究生入学报到',
    poster: '/images/news-welcome.jpg',
    content: '8月23日，中国海洋大学2026级研究生迎新工作如期开展。新生们怀揣求知热忱与学术理想走进校园，各迎新点有序完成身份核验、材料领取和住宿指引。学校师生与志愿者在现场提供细致服务，帮助新同学快速熟悉校园，在温暖而热烈的氛围中完成入学报到。',
    summary: '新生从五湖四海汇聚于此，在海大开启新的学术旅程。',
    add_date: '2026-08-24',
    category: '校园',
    reading_time: '约 2 分钟',
    source_name: '中国海洋大学新闻网',
    source_url: 'https://news.ouc.edu.cn/2026/0824/c91a122555/page.htm'
  },
  {
    id: '117197',
    title: '中国海大志愿者完成第五届跨国公司领导人青岛峰会志愿服务',
    poster: '/images/news-volunteers.jpg',
    content: '8月27日至29日，第五届跨国公司领导人青岛峰会在青岛国际会议中心举办。中国海洋大学选派115名志愿者参与会务、媒体接待、酒店接待和交通抵离等服务工作，累计服务3000余小时。志愿者们以认真负责的态度完成各项任务，展现了海大学子的青春风采。',
    summary: '115名海大志愿者累计服务3000余小时，点亮青春名片。',
    add_date: '2024-08-31',
    category: '志愿',
    reading_time: '约 2 分钟',
    source_name: '中国海洋大学新闻网',
    source_url: 'https://news.ouc.edu.cn/2024/0831/c91a117197/page.htm'
  },
  {
    id: '117188',
    title: '贵州省人大干部综合能力提升培训班在中国海洋大学举办',
    poster: '/images/news-training.jpg',
    content: '8月26日至30日，贵州省人大干部综合能力提升培训班在中国海洋大学举办。培训围绕理论学习、履职能力、新媒体与舆情应对等主题开展专题讲座和现场教学，为参训学员搭建了交流学习的平台。',
    summary: '专题讲座与现场教学结合，搭建高质量交流学习平台。',
    add_date: '2024-08-30',
    category: '学习',
    reading_time: '约 1 分钟',
    source_name: '中国海洋大学新闻网',
    source_url: 'https://news.ouc.edu.cn/2024/0830/c550a117188/page.htm'
  },
  {
    id: '117172',
    title: '中国海洋大学开展2024级本科生集中入学教育',
    poster: '/images/news-orientation.jpg',
    content: '为帮助2024级本科生尽快适应大学生活，学校在崂山校区体育馆开展集中入学教育。活动涵盖心理健康、传染病防控和校园安全等内容，引导新生了解校园生活、增强安全意识并合理规划大学阶段的发展。',
    summary: '从心理健康到校园安全，为新生送上大学第一课。',
    add_date: '2024-08-29',
    category: '新生',
    reading_time: '约 2 分钟',
    source_name: '中国海洋大学新闻网',
    source_url: 'https://news.ouc.edu.cn/2024/0829/c550a117172/page.htm'
  }
]

function cloneNews(item) {
  return Object.assign({}, item)
}

function getAllNews() {
  return news.map(cloneNews)
}

function getNewsList() {
  return news.map(function (item) {
    return {
      id: item.id,
      title: item.title,
      poster: item.poster,
      summary: item.summary,
      add_date: item.add_date,
      category: item.category,
      reading_time: item.reading_time,
      source_name: item.source_name,
      source_url: item.source_url
    }
  })
}

function getNewsDetail(newsId) {
  for (let i = 0; i < news.length; i += 1) {
    if (news[i].id === String(newsId)) {
      return {
        code: '200',
        news: cloneNews(news[i])
      }
    }
  }

  return {
    code: '404',
    news: {}
  }
}

function isNewsId(value) {
  return news.some(function (item) {
    return item.id === String(value)
  })
}

module.exports = {
  getAllNews: getAllNews,
  getNewsList: getNewsList,
  getNewsDetail: getNewsDetail,
  isNewsId: isNewsId
}
