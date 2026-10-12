# Cloudflare Workers 部署

Workers 使用 Astro Cloudflare adapter + 一个 SQLite-backed Durable Object；Drizzle 查询与 Node 的业务层共用同步事务。数据库、私密媒体及会话持久化在 `SITE` 绑定的 `single-owner-site` 对象内。图片解码并重编码 WebP，由 WASM Photon 完成；不需要 R2、D1、公开图片桶或 Images 订阅。

演示站点：<https://shuxin.my/>。公共 `wrangler.jsonc` 不绑定演示站域名；`wrangler.production.jsonc` 仅用于维护者的现有站点，普通部署不要使用它。

## 一键部署

[部署到自己的 Cloudflare 账号](https://deploy.workers.cloudflare.com/?url=https://github.com/5hux1n/shuxin/tree/v1.0.0)。Cloudflare 会复制仓库、构建并配置 Durable Object，无需在本机安装 CLI。需要自己的 Cloudflare 和 GitHub 账号。

1. 选择仓库名和 Worker 名称。填写 `SITE_URL` 为最终 HTTPS 地址，可使用自己的域名，或 `https://所选Worker名称.你的账户子域.workers.dev`（账户子域在 Cloudflare 的 Workers 设置中查看）。不要保留 `https://your-site.example`。
2. `SESSION_SECRET` 填写至少 32 字符的随机会话密钥；创建账号无需初始化密钥。部署向导会根据 `.dev.vars.example` 提示需要的密钥，不应将真实值写入仓库。
3. 构建命令选择 `npm run build:worker`，部署命令 `npm run deploy`。默认命令若为 `npm run build` 也会在部署脚本中重新构建 Worker，但会多构建一次 Node 版本。
4. 部署完成，打开站点 `/admin/setup` 创建站长。自定义域名需在 Worker → 设置 → 域和路由中添加，并确保 `SITE_URL` 与访问地址完全一致。更换地址后同时更新仓库的 `wrangler.jsonc`，以免下次部署恢复旧地址。

按钮遵循 [Cloudflare 官方部署按钮机制](https://developers.cloudflare.com/workers/platform/deploy-buttons/)。无法替用户省略账号登录、密钥设置及首次创建站长。部署向导的账号授权和最终发布需由用户在自己的账号中完成。

## 部署

需要 Node 22.12+（推荐 Node 24）与已登录的 Wrangler。先安装依赖，再配置 wrangler.jsonc 的 SITE_URL 为最终 HTTPS 站点 Origin；二级域名使用 Workers Custom Domains 的 `routes` 配置。不要把本机 .env 或 data 发布。

```sh
npm ci
npm run build:worker
npx wrangler secret put SESSION_SECRET --config dist-worker/server/wrangler.json
npx wrangler deploy --config dist-worker/server/wrangler.json
```

SESSION_SECRET 使用一个 32 字节随机值。部署后的 `/admin/setup` 直接填写登录名、昵称和密码创建唯一站长。不要将 secret 放进 wrangler.jsonc 或 GitHub。

`npm run deploy:worker` 会先构建，再使用 Astro 生成的 Wrangler 配置发布。首次部署会创建 `ShuxinSite` SQLite namespace。后续升级保留 Worker 名称、`SITE` 绑定和对象名称；不要删除 namespace，避免丢失持久化数据。`new_sqlite_classes` 只在初次迁移执行。

## 本地 Worker 环境

```sh
npm run dev:worker
```

本地使用端口 4322 和隔离于 Node `data/` 的 `.wrangler/` 数据。配置 `.dev.vars` 中的 SITE_URL 与 SESSION_SECRET。代码验收脚本使用额外临时目录，不覆盖正常本地数据：

```sh
npm run check
npm run lint
npm run build
npm test
npm run build:worker
npm run test:worker
```

## 持久化与权限

所有动态请求进入唯一 Durable Object；Drizzle 使用官方 durable-sqlite driver。新系统迁移在 SQLite 同步事务内执行。图片存入独立 `media_chunks` 表，每片不超过 100KB，避免单行大小限制。每次图片读取仍检查所属动态、登录身份和头像状态，私密图片没有可绕过认证的公开 URL。

Cloudflare 数据不自动同步到 Node 本地目录；这两个部署是独立站点。Workers 新账号使用 PBKDF2。若需要将已有 Node 站点搬入 Workers，需要另行安排新系统自身的备份恢复，不是旧 Pigeon 迁移。

## 上传与备份边界

- Workers 单张图片最多 10 MB / 800 万像素；GIF 保留动画；Live Photo 视频最多 10 MB / 15 秒，支持 H.264 / HEVC 的 MOV / MP4。Node 的 sharp 路径保留 3200 万像素限制。
- Workers 导出 ZIP 包含 `content.json`、`database.sql`、`media/`；SQL 包含站长密码哈希及迁移历史，不包含会话与限流记录。
- ZIP 媒体总量限制 24 MB，以控制 Worker 内存。超出时返回明确错误；默认存储的媒体保存在 Durable Object SQLite；启用第三方存储后，媒体位于对应存储桶。Cloudflare 时间点恢复只覆盖数据库和默认媒体，第三方存储桶须另行备份。导出不提供开放的远程 SQL 或媒体桶。
- SQLite Durable Objects 原生提供时间点恢复。生产备份和恢复操作应遵循 Cloudflare 官方控制台/API 流程，保持对象名称一致。后台 ZIP 是独立、可移出的备份。

## 将 Workers ZIP 恢复为 Node SQLite

在停机的全新目录中解压可信 ZIP；用 Node 的 better-sqlite3 执行 database.sql 生成 shuxin.sqlite，再保留 media/。示例：

```sh
node --input-type=module -e 'import Database from "better-sqlite3";import fs from "node:fs";const db=new Database("restore/shuxin.sqlite");db.exec(fs.readFileSync("restore/database.sql","utf8"));db.close();'
```

设置 DATA_DIR 到恢复目录后启动相同版本 Node 服务。导出保留迁移记录，避免新系统重复建表；需要原密码重新登录。所有 SQL 来自自己备份的内容，不执行来源不明的文件。

### 大文件音视频

`MAX_MEDIA_MB` 默认为 512，可在 `wrangler.jsonc` 的 vars 设置为字符串，例如 `"MAX_MEDIA_MB": "1024"`。上限可配置为 1–2048 MB。请求按 4 MB 上传，数据库按 100 KB 存储，播放逐块返回而不把完整文件载入 Workers 内存。实际可用总容量由 Durable Object 所在账户计划决定；不要把单文件上限当作存储配额。

音乐解析只访问固定平台域名，逐次检查跳转，限制超时和响应体大小。网易云官方 iframe 使用独立 CSP 允许项；不允许 Markdown 自行嵌入 iframe。

维护者现有博客唯一自定义域名为 `shuxin.my`，旧域名绑定已移除。Workers 默认地址通过 `REDIRECT_HOSTS` 跳转到主域名，HTTP 访问转为 HTTPS。普通部署不需要配置 `REDIRECT_HOSTS`。

### 可选对象存储

系统设置支持阿里云 OSS、腾讯云 COS、七牛云 Kodo、R2 和 S3 兼容存储。默认存储仍可直接使用。配置、权限与备份说明见 [OBJECT_STORAGE.md](OBJECT_STORAGE.md)。切换配置不迁移旧文件；恢复原始数据库时保留原 SESSION_SECRET 和存储桶。
