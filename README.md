# cache-console

SQLite 缓存控制台：对外 KV API + 管理界面，并可联动使 Next.js 自身缓存标签失效。

## 开发

```bash
cp .env.example .env.local
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。未配置环境变量时，开发态会使用固定口令 / API Key（启动日志会警告）。

生产必须设置：

| 变量 | 用途 |
|---|---|
| `ADMIN_PASSWORD` | 控制台登录密码 |
| `AUTH_SECRET` | 会话签名密钥 |
| `CACHE_API_KEY` | 对外 `/api/kv` 鉴权 |
| `CACHE_DB` | SQLite 路径，默认 `data/cache.db` |

## 登录

管理页 `/`、`/entries` 需要会话 Cookie。`POST /api/session` `{ "password": "..." }` 成功后写入 httpOnly Cookie（7 天）。

## 对外 KV API

鉴权：`Authorization: Bearer <CACHE_API_KEY>` 或 `x-api-key`。

- `GET /api/kv/[key]` 命中并计数
- `PUT /api/kv/[key]` 写入 `{ value, ttlSeconds?, tags? }`
- `DELETE /api/kv/[key]`
- `GET /api/kv?prefix=&limit=` 键名 + 截断预览
- `POST /api/kv/invalidate` `{ tags }`

## 管理 API

均需登录 Cookie；未登录返回 401（页面层再跳转 `/login`）。

## 联动演示

`/demo` 使用 `unstable_cache(..., { tags: ['demo'] })` 缓存时间戳和随机数。按钮调用 `POST /api/next-cache/revalidate` `{ tag: "demo" }`。这只演示 Next 缓存标签失效，不是 SQLite KV 的能力。
