const PROFILE_KEY = 'lab03:userProfile'
const LIKED_IDS_KEY = 'lab03:likedNewsIds'
const FAVORITE_IDS_KEY = 'lab03:favoriteNewsIds'
const LIKED_ORDER_VERSION_KEY = 'lab03:likedOrderVersion'
const PROFILE_LIKED_IDS_KEY = 'lab03:profileLikedNewsIds'
const PROFILE_FAVORITE_IDS_KEY = 'lab03:profileFavoriteNewsIds'
const PROFILE_LIKED_ORDER_VERSION_KEY = 'lab03:profileLikedOrderVersion'
const PROFILE_FAVORITE_ARTICLE_PREFIX = 'lab03:profileFavorite:'
const PROFILE_INTERACTION_VERSION_KEY = 'lab03:profileInteractionVersion'
const PENDING_AVATAR_CLEANUP_KEY = 'lab03:pendingAvatarCleanup'
const PENDING_PROFILE_CLEANUP_KEY = 'lab03:pendingProfileCleanup'
const LIKED_ORDER_VERSION = 2
const PROFILE_INTERACTION_VERSION = 2

function normalizeIds(values) {
  if (!Array.isArray(values)) {
    return []
  }

  return values.reduce(function (uniqueIds, value) {
    const id = value === null || value === undefined ? '' : String(value)
    if (id && uniqueIds.indexOf(id) === -1) {
      uniqueIds.push(id)
    }
    return uniqueIds
  }, [])
}

function saveOrderedIds(key, ids) {
  wx.setStorageSync(key, normalizeIds(ids))
}

function addIdToFront(key, newsId) {
  const id = String(newsId)
  const ids = normalizeIds(wx.getStorageSync(key)).filter(function (itemId) {
    return itemId !== id
  })
  ids.unshift(id)
  saveOrderedIds(key, ids)
}

function removeId(key, newsId) {
  const id = String(newsId)
  const ids = normalizeIds(wx.getStorageSync(key))
  const nextIds = ids.filter(function (itemId) {
    return itemId !== id
  })
  saveOrderedIds(key, nextIds)
  return nextIds.length !== ids.length
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return null
  }

  const nickName = typeof profile.nickName === 'string' ? profile.nickName.trim() : ''
  if (!nickName) {
    return null
  }

  return {
    nickName: nickName,
    avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : ''
  }
}

function getLocalProfile() {
  const profile = wx.getStorageSync(PROFILE_KEY)
  return normalizeProfile(profile)
}

function getInteractionKeys(scope) {
  const storedVersion = wx.getStorageSync(PROFILE_INTERACTION_VERSION_KEY)
  const profileOwnsInteractions = Boolean(getLocalProfile()) && storedVersion !== 1
  const useProfileScope = scope === 'profile' || (scope !== 'guest' && profileOwnsInteractions)
  return useProfileScope ? {
    likedIds: PROFILE_LIKED_IDS_KEY,
    favoriteIds: PROFILE_FAVORITE_IDS_KEY,
    likedOrderVersion: PROFILE_LIKED_ORDER_VERSION_KEY,
    favoriteArticlePrefix: PROFILE_FAVORITE_ARTICLE_PREFIX
  } : {
    likedIds: LIKED_IDS_KEY,
    favoriteIds: FAVORITE_IDS_KEY,
    likedOrderVersion: LIKED_ORDER_VERSION_KEY,
    favoriteArticlePrefix: ''
  }
}

function getFavoriteArticleKey(newsId, scope) {
  return getInteractionKeys(scope).favoriteArticlePrefix + String(newsId)
}

function clearInteractions(allNews, scope) {
  const keys = getInteractionKeys(scope)
  try {
    const favoriteIds = normalizeIds(wx.getStorageSync(keys.favoriteIds))
    allNews.forEach(function (item) {
      const id = String(item.id)
      if (favoriteIds.indexOf(id) === -1) {
        favoriteIds.push(id)
      }
    })
    favoriteIds.forEach(function (id) {
      wx.removeStorageSync(keys.favoriteArticlePrefix + id)
    })
    wx.removeStorageSync(keys.likedIds)
    wx.removeStorageSync(keys.favoriteIds)
    wx.removeStorageSync(keys.likedOrderVersion)
    return true
  } catch (error) {
    return false
  }
}

function createLocalProfile(profile, allNews) {
  const safeProfile = normalizeProfile(profile)
  if (!safeProfile || !clearInteractions(allNews, 'profile')) {
    return null
  }
  completePendingProfileCleanup()

  try {
    wx.setStorageSync(PROFILE_INTERACTION_VERSION_KEY, PROFILE_INTERACTION_VERSION)
    wx.setStorageSync(PROFILE_KEY, safeProfile)
  } catch (error) {
    return null
  }

  clearInteractions(allNews, 'guest')
  return safeProfile
}

function migrateV1ProfileInteractions(allNews) {
  const validArticles = allNews.reduce(function (lookup, item) {
    lookup[String(item.id)] = item
    return lookup
  }, {})

  if (!clearInteractions(allNews, 'profile')) {
    return false
  }

  try {
    const legacyLikedIds = normalizeIds(wx.getStorageSync(LIKED_IDS_KEY)).filter(function (id) {
      return Boolean(validArticles[id])
    })
    if (wx.getStorageSync(LIKED_ORDER_VERSION_KEY) !== LIKED_ORDER_VERSION) {
      legacyLikedIds.reverse()
    }
    wx.setStorageSync(PROFILE_LIKED_ORDER_VERSION_KEY, LIKED_ORDER_VERSION)
    saveOrderedIds(PROFILE_LIKED_IDS_KEY, legacyLikedIds)

    const legacyFavoriteIds = normalizeIds(wx.getStorageSync(FAVORITE_IDS_KEY)).filter(function (id) {
      const article = wx.getStorageSync(id)
      return Boolean(validArticles[id] && article && article.id)
    })
    allNews.forEach(function (item) {
      const id = String(item.id)
      const article = wx.getStorageSync(id)
      if (article && article.id && legacyFavoriteIds.indexOf(id) === -1) {
        legacyFavoriteIds.push(id)
      }
    })
    legacyFavoriteIds.forEach(function (id) {
      wx.setStorageSync(PROFILE_FAVORITE_ARTICLE_PREFIX + id, validArticles[id])
    })
    saveOrderedIds(PROFILE_FAVORITE_IDS_KEY, legacyFavoriteIds)
    wx.setStorageSync(PROFILE_INTERACTION_VERSION_KEY, PROFILE_INTERACTION_VERSION)
  } catch (error) {
    return false
  }

  clearInteractions(allNews, 'guest')
  return true
}

function migrateLegacyProfileInteractions(allNews) {
  const storedVersion = wx.getStorageSync(PROFILE_INTERACTION_VERSION_KEY)
  if (!getLocalProfile() || storedVersion === PROFILE_INTERACTION_VERSION) {
    return true
  }

  if (storedVersion === 1) {
    return migrateV1ProfileInteractions(allNews)
  }

  if (!clearInteractions(allNews, 'guest')) {
    return false
  }

  try {
    wx.setStorageSync(PROFILE_INTERACTION_VERSION_KEY, PROFILE_INTERACTION_VERSION)
    return true
  } catch (error) {
    return false
  }
}

function logoutLocalProfile(allNews) {
  const profile = getLocalProfile()
  if (!profile) {
    return {
      success: true,
      profile: null
    }
  }

  if (!migrateLegacyProfileInteractions(allNews) || !clearInteractions(allNews, 'guest')) {
    return {
      success: false,
      profile: profile
    }
  }

  try {
    wx.setStorageSync(PENDING_PROFILE_CLEANUP_KEY, true)
    wx.removeStorageSync(PROFILE_KEY)
  } catch (error) {
    try {
      wx.removeStorageSync(PENDING_PROFILE_CLEANUP_KEY)
    } catch (cleanupError) {
      // 有资料存在时，启动重试不会触碰其互动命名空间。
    }
    return {
      success: false,
      profile: profile
    }
  }

  try {
    wx.removeStorageSync(PROFILE_INTERACTION_VERSION_KEY)
  } catch (error) {
    // 身份已经退出；残留版本号不包含用户数据。
  }
  const cleanupComplete = clearInteractions(allNews, 'profile')
  if (cleanupComplete) {
    completePendingProfileCleanup()
  }
  return {
    success: true,
    profile: profile,
    cleanupComplete: cleanupComplete
  }
}

function completePendingProfileCleanup() {
  try {
    wx.removeStorageSync(PENDING_PROFILE_CLEANUP_KEY)
    return true
  } catch (error) {
    return false
  }
}

function retryPendingProfileCleanup(allNews) {
  if (getLocalProfile() || !wx.getStorageSync(PENDING_PROFILE_CLEANUP_KEY)) {
    return true
  }
  if (!clearInteractions(allNews, 'profile')) {
    return false
  }
  return completePendingProfileCleanup()
}

function getPendingAvatarCleanup() {
  return normalizeIds(wx.getStorageSync(PENDING_AVATAR_CLEANUP_KEY))
}

function queueAvatarCleanup(filePath) {
  if (!filePath) {
    return false
  }
  const paths = getPendingAvatarCleanup()
  const value = String(filePath)
  if (paths.indexOf(value) === -1) {
    paths.push(value)
  }
  try {
    wx.setStorageSync(PENDING_AVATAR_CLEANUP_KEY, paths)
    return true
  } catch (error) {
    return false
  }
}

function completeAvatarCleanup(filePath) {
  const value = String(filePath)
  const paths = getPendingAvatarCleanup().filter(function (item) {
    return item !== value
  })
  try {
    if (paths.length) {
      wx.setStorageSync(PENDING_AVATAR_CLEANUP_KEY, paths)
    } else {
      wx.removeStorageSync(PENDING_AVATAR_CLEANUP_KEY)
    }
    return true
  } catch (error) {
    return false
  }
}

function getLikedIds() {
  const keys = getInteractionKeys()
  const ids = normalizeIds(wx.getStorageSync(keys.likedIds))
  if (wx.getStorageSync(keys.likedOrderVersion) !== LIKED_ORDER_VERSION) {
    ids.reverse()
    saveOrderedIds(keys.likedIds, ids)
    wx.setStorageSync(keys.likedOrderVersion, LIKED_ORDER_VERSION)
  }
  return ids
}

function isLiked(newsId) {
  return getLikedIds().includes(String(newsId))
}

function toggleLike(newsId) {
  const keys = getInteractionKeys()
  const id = String(newsId)
  const ids = getLikedIds()
  const index = ids.indexOf(id)
  let liked = false

  if (index === -1) {
    ids.unshift(id)
    liked = true
  } else {
    ids.splice(index, 1)
  }

  wx.setStorageSync(keys.likedIds, ids)
  return liked
}

function removeLike(newsId) {
  const keys = getInteractionKeys()
  const id = String(newsId)
  const ids = getLikedIds()
  const index = ids.indexOf(id)
  if (index === -1) {
    return false
  }

  ids.splice(index, 1)
  saveOrderedIds(keys.likedIds, ids)
  return true
}

function isFavorite(newsId) {
  const article = wx.getStorageSync(getFavoriteArticleKey(newsId))
  return Boolean(article && article.id)
}

function toggleFavorite(article) {
  if (!article || !article.id) {
    return false
  }

  if (isFavorite(article.id)) {
    const keys = getInteractionKeys()
    wx.removeStorageSync(keys.favoriteArticlePrefix + String(article.id))
    removeId(keys.favoriteIds, article.id)
    return false
  }

  const keys = getInteractionKeys()
  wx.setStorageSync(keys.favoriteArticlePrefix + String(article.id), article)
  addIdToFront(keys.favoriteIds, article.id)
  return true
}

function removeFavorite(newsId) {
  const keys = getInteractionKeys()
  const id = String(newsId)
  const wasFavorite = isFavorite(id)
  if (wasFavorite) {
    wx.removeStorageSync(keys.favoriteArticlePrefix + id)
  }
  removeId(keys.favoriteIds, id)
  return wasFavorite
}

function orderArticlesByIds(allNews, ids) {
  const articleById = allNews.reduce(function (lookup, item) {
    lookup[String(item.id)] = item
    return lookup
  }, {})

  return ids.reduce(function (articles, id) {
    if (articleById[id]) {
      articles.push(articleById[id])
    }
    return articles
  }, [])
}

function getFavoriteArticles(allNews) {
  const keys = getInteractionKeys()
  const validIds = allNews.map(function (item) {
    return String(item.id)
  })
  const storedIds = normalizeIds(wx.getStorageSync(keys.favoriteIds))
  const activeIds = storedIds.filter(function (id) {
    const isValid = validIds.indexOf(id) !== -1
    if (!isValid && isFavorite(id)) {
      wx.removeStorageSync(keys.favoriteArticlePrefix + id)
    }
    return isValid && isFavorite(id)
  })
  allNews.forEach(function (item) {
    const id = String(item.id)
    if (isFavorite(id) && activeIds.indexOf(id) === -1) {
      activeIds.push(id)
    }
  })
  saveOrderedIds(keys.favoriteIds, activeIds)
  return orderArticlesByIds(allNews, activeIds)
}

function getLikedArticles(allNews) {
  const keys = getInteractionKeys()
  const validIds = allNews.map(function (item) {
    return String(item.id)
  })
  const activeIds = getLikedIds().filter(function (id) {
    return validIds.indexOf(id) !== -1
  })
  saveOrderedIds(keys.likedIds, activeIds)
  return orderArticlesByIds(allNews, activeIds)
}

module.exports = {
  getLocalProfile: getLocalProfile,
  clearInteractions: clearInteractions,
  createLocalProfile: createLocalProfile,
  migrateLegacyProfileInteractions: migrateLegacyProfileInteractions,
  logoutLocalProfile: logoutLocalProfile,
  retryPendingProfileCleanup: retryPendingProfileCleanup,
  getPendingAvatarCleanup: getPendingAvatarCleanup,
  queueAvatarCleanup: queueAvatarCleanup,
  completeAvatarCleanup: completeAvatarCleanup,
  getLikedIds: getLikedIds,
  isLiked: isLiked,
  toggleLike: toggleLike,
  removeLike: removeLike,
  isFavorite: isFavorite,
  toggleFavorite: toggleFavorite,
  removeFavorite: removeFavorite,
  getFavoriteArticles: getFavoriteArticles,
  getLikedArticles: getLikedArticles
}
