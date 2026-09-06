# 数据库结构

## memories

```js
{
  _id, _openid,
  title, content,
  category, mood, importance,
  date, time, occurredAt,
  durationMinutes,
  location: { name, address, latitude, longitude } | null,
  media: [{ id, type, fileID, url, cloudPath, duration, size }],
  tags: [],
  source: 'manual' | 'ai-assisted' | 'demo' | 'reflection',
  createdAt, updatedAt
}
```

## goals

```js
{ _id, _openid, title, category, current, target, unit, createdAt, updatedAt }
```

## profiles

```js
{ _id, _openid, nickname, avatarUrl, summerStart, summerEnd, motto, createdAt, updatedAt }
```

## step_snapshots

```js
{ _id, _openid, date, steps, history, source: 'wechat-werun', updatedAt }
```

## media_assets

```js
{ _id, _openid, fileID, cloudPath, type, size, references: ['memory:<id>' | 'profile:<id>'], status: 'ready' | 'deleting', createdAt, updatedAt }
```

上传路径包含服务端根据 `_openid` 生成的不可逆命名空间。记忆创建、更新、删除、头像保存和 AI 看图都会按当前用户的登记记录验证 `fileID`。记忆或头像与附件引用在数据库事务中同时更新；只有引用为空并进入 `deleting` 状态的文件才能被普通清理流程删除，从而避免多端并发产生断裂引用。批量删除只移除云存储确认成功或文件已不存在的登记，其他失败记录会恢复为 `ready` 供重试。

## ai_usage

```js
// 用户日文档（不保存原始 OPENID）
{ _id, kind: 'user', ownerHash, date, minuteKey, minuteRequests, dailyRequests, dailyCredits, updatedAt }

// 全局日文档
{ _id, kind: 'global', date, dailyCredits, updatedAt }
```

`deepseekProxy` 在调用外部模型前通过数据库事务同时预占用户和全局额度；额度数据库失败时不会继续请求 DeepSeek。
