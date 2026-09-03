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
