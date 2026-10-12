# ShuXin：给 AI 的架构与部署指南

本文件是部署任务入口。先阅读根目录 `AGENTS.md`，再阅读本文件及目标平台对应的文档。部署任务只处理配置、构建、发布、初始化和必要验证，保持现有 UI 与业务行为。用户未提出重新开发时，不重新实现整个 V1.0。

## 1. 确定任务与环境

- 确认目标：Cloudflare Workers、宝塔、Docker 或普通 Node 服务器；首次安装还是升级；完整访问域名；用户指定版本（未指定时选择 GitHub 最新已发布正式 Release）。
- 沿用用户已给出的地址和授权，不重复询问。未知的账户、主机或域名不能猜测，不使用演示站配置替用户部署。
- 检查所需 Node、npm 或 Docker，利用已有环境，不擅自安装面板、更改 DNS 或购买服务。需要新增账号授权、提供密钥或接受平台协议时，交给用户安全完成。
- 密钥不能放入源码、聊天、截图、URL、日志或 Git。读取配置时只报告字段是否配置，不输出真实值。新配置使用独立随机密钥，不复用演示站的秘密。
- 首次初始化由用户在 `/admin/setup` 填写账号和密码。管理员密码允许任意非空值，没有最低长度；不要自行添加限制。

## 2. 项目架构

单站长个人微博客：访客阅读，唯一站长管理，无公开注册、多用户关系和 RSS。前台为居中单列信息流；顶部交通灯仅为品牌识别，禁止改成窗口、桌面或侧边栏布局。

| 文件或目录 | 职责 |
| --- | --- |
| `src/pages/` | Astro SSR 前台、搜索、详情、后台与 API 路由 |
| `src/components/`、`src/styles/`、`src/scripts/` | 共用组件、主题、编辑器及浏览器交互 |
| `src/lib/posts/` | 动态业务、数据库访问与后台摘要 |
| `src/lib/auth/`、`src/middleware.ts`、`src/lib/http.ts` | 站长身份、会话、CSRF、Origin 与响应安全策略 |
| `src/lib/config.ts` | 运行环境配置；生产 Node 不依赖编译时 `.env` |
| `src/lib/db/`、`drizzle/` | Drizzle Schema、Node SQLite 与事务迁移 |
| `src/lib/media/`、`src/lib/storage/`、`src/lib/backup.ts` | 媒体校验/暂存、第三方存储、凭据加密、权限与备份 |
| `src/lib/markdown/` | Markdown、安全净化、代码块和表情 |
| `src/lib/music/`、`src/lib/audio/`、`src/lib/downloads.ts` | 音乐链接、歌单、音频与下载卡片 |
| `src/worker.ts`、`src/lib/cloudflare/`、`src/lib/runtime.ts` | Cloudflare Durable Object、请求上下文、媒体与备份适配 |
| `astro.config.mjs` | Node/Workers 构建选择；Workers 替换数据库、媒体与备份模块 |
| `start.mjs` | Node 正式启动：切到项目目录、加载 `.env` 后启动 Astro |
| `scripts/setup-server.mjs` | 为全新 Node 安装生成配置；保留已有 `.env` |
| `scripts/package-server.mjs` | 生成没有账号、数据库、密钥或本机依赖的预构建 ZIP |
| `.github/workflows/` | 质量检查和正式 Release 运行包发布 |

Node 使用 `better-sqlite3`，数据库位于 `DATA_DIR/shuxin.sqlite`，媒体位于 `DATA_DIR/media/`。Workers 使用单个 SQLite Durable Object，绑定为 `SITE`，对象名为 `single-owner-site`，默认数据库和媒体都在对象中，不需要 D1/R2；可选第三方对象存储会将新媒体保存到指定桶。两种部署数据独立，不自动同步。

动态的 `draft/published` 与 `public/unlisted/private` 是两套独立状态。媒体经 `/media/` 路由鉴权，不要公开整个数据目录或绕过鉴权做静态托管。SSR 与 API 不能被代理/CDN无差别缓存。

## 3. Cloudflare：部署按钮与 CLI

入口：[Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/5hux1n/shuxin)。按钮复制仓库到用户账号，构建并创建所需资源；完整说明见 `docs/CLOUDFLARE.md`。

- 公共配置是 `wrangler.jsonc`：默认 `name=shuxin`，`SITE_URL=https://your-site.example` 是必须替换的占位地址，没有绑定演示站域名。
- `wrangler.production.jsonc` 属于维护者已有演示站；第三方用户**不要使用** `npm run deploy:production`。
- 部署向导填写站点完整 HTTPS Origin、随机会话密钥 `SESSION_SECRET`。`SESSION_SECRET` 至少 32 字符，这个长度规则针对系统密钥，不是用户密码。
- 构建命令 `npm run build:worker`，部署命令 `npm run deploy`。`deploy` 自身也构建 Worker，可避免误部署 Node 构建产物。
- 使用 workers.dev 时，填入用户所选 Worker 名称与 Cloudflare 账户子域组成的完整地址。自定义域名在 Worker 设置中绑定，或通过用户自己的 `routes` 配置；`SITE_URL` 必须等于实际访问 Origin。

CLI 路径（用户已授权并登录 Wrangler 时）：

```sh
npm ci
# 先修改 wrangler.jsonc 中的 Worker 名称、SITE_URL 和用户自己的 routes（如需要）
npm run build:worker
npx wrangler secret put SESSION_SECRET --config dist-worker/server/wrangler.json
npx wrangler deploy --config dist-worker/server/wrangler.json
```

密钥由用户在安全输入提示中填写，不能将真实密钥拼进命令。部署成功后用户访问 `/admin/setup`。创建账号无需初始化密钥；不能更改已有会话密钥来解决普通部署问题。

## 4. 宝塔：预构建运行包

从 GitHub 正式 Release 下载 `ShuXin_版本_server.zip`；不要把源码 ZIP 当成已构建运行包。完整操作见 `docs/BAOTA.md`。

1. 使用 Node 24；上传解压运行包，例如 `/www/server/shuxin`。
2. 在项目目录使用所选 Node 版本执行：

   ```sh
   npm ci --omit=dev --no-audit --no-fund
   node scripts/setup-server.mjs https://用户的域名
   ```

3. 宝塔 Node 项目选择目录、Node 24、启动命令 `npm start` 或文件 `start.mjs`、端口 `4321`、运行用户 `www`；配置守护与开机启动。
4. 目录所有权应对应实际运行用户，`.env` 保持 600 权限，`data/` 可写。配置 HTTPS 域名反代到 `127.0.0.1:4321`，允许至少 11 MB 请求体，不缓存动态路由。不要建立直接公开项目目录的静态站点。
5. 用户在 `/admin/setup` 填写登录名、昵称和密码创建唯一站长。

运行包已包含 `dist/`，无需前端构建。服务器依赖仍需安装，尤其 SQLite 原生扩展：不复制 Mac 的 node_modules；若预编译依赖不可用，安装需 Python 3、make 与 C++ 编译器。用源码部署则执行 `npm ci`、`npm run build`，之后沿用相同配置和启动入口。

## 5. Docker 与 Node

详见 `docs/DEPLOYMENT.md`。Docker 使用 `.env` 与命名卷 `shuxin-data`，命令为 `docker compose up -d --build`；HTTPS 代理到 `127.0.0.1:4321`。普通 Node 使用 `npm ci`、`npm run build`、`npm start`，配合进程管理器。

`SITE_URL` 不带路径，必须与浏览器实际访问地址一致。`SESSION_SECRET` 使用随机值；公网 `COOKIE_SECURE=true`。`DATA_DIR` 保存数据库和媒体，`HOST`、`PORT` 控制监听。`MAX_MEDIA_MB` 默认 512，可设置 1–2048，文件按 4 MB 分块上传，不能因此把反代请求体限制到小于分块大小。

## 6. 升级、备份与故障

- 升级前备份，见 `docs/BACKUP.md`。保留 Node 的 `.env` 和整个 `data/`、Docker 的持久卷；不要执行 `docker compose down -v`。
- Workers 保留原 Worker 名称、`SITE` 绑定和对象名，不删除 Durable Object namespace。使用同一配置升级，自有迁移自动执行。
- 回滚必须同时考虑数据库 Schema，不能让旧代码随意写入已升级数据库。不得自动执行破坏性恢复或初始化已有站点。
- Workers ZIP 备份的媒体总量上限为 24 MB；超过后分别备份 Cloudflare 数据库及媒体；第三方存储桶不包含在数据库时间点恢复中。Node ZIP 为流式输出。总存储容量受部署环境配额约束。
- 502：查进程、监听端口、所选 Node 版本及反向代理；403 写入失败：先核对 `SITE_URL`、HTTPS Cookie 和访问 Origin；启动配置错误：核对密钥是否配置，不能关闭鉴权/CSRF来绕过错误。
- 音乐平台的音源可用性依赖上游，不把解析成功等同于播放成功，也不为了部署更换平台业务逻辑。

## 7. 必要验证与交付

根据用户本次授权执行部署需要的构建和验证；不要把早期实现阶段的 UI 规则误当成所有后续部署都不能构建，也不要未经授权扩大成全站审计。

检查发布日志、实际站点 HTTPS、首页与 `/admin/setup` 或 `/admin/login`。用户亲自完成站长账号后，可按授权验证保存和媒体上传。检查真实页面、响应和持久化，不能以构建成功替代功能完成。升级时核对原内容仍存在。失败或超时的写操作先核对结果，再考虑重试。

交付站点地址、准确版本、运行目录/项目名、启动与升级方法和备份位置；不包含密钥。说明没有验证的环境或流程。目前 Node/Workers 已有运行验证；服务器 ZIP 已验证解压启动与配置保留；没有在真实宝塔面板或新用户账户的完整一键部署流程中验收，不能声称这些流程已全程通过。

### 可选对象存储

存储设置支持阿里云 OSS、腾讯云 COS、七牛云 Kodo、R2 和 S3 兼容存储。默认存储仍可直接使用。配置、权限与备份说明见 [OBJECT_STORAGE.md](docs/OBJECT_STORAGE.md)。切换配置不迁移旧文件；恢复原始数据库时保留原 SESSION_SECRET 和存储桶。

全屏背景新增在线图片、API 与 Bing 来源，配置和限制见 [BACKGROUND.md](docs/BACKGROUND.md)。自定义 JSON 由访客浏览器读取，不在服务端代理任意 URL。
