# ShuXin AI 部署教程

本教程集中说明 Cloudflare、宝塔、Node 和 Docker 的安装与升级。先读取项目 `AGENTS.md`，根据用户指定平台执行本教程，保留现有界面和功能，不重新开发项目。

## 开始前

- 确认部署平台、访问地址、首次安装或升级，以及指定版本。沿用用户已提供的信息。
- 源码默认分支为 `main`；获取固定版本可用 `git clone --branch v1.1.0 --depth 1 https://github.com/5hux1n/shuxin.git`。服务器运行包来自对应 GitHub Release。
- 新站没有预设账号或演示数据。部署完成后，由用户访问 `/admin/setup` 创建唯一站长；后台入口为 `/admin`。
- 用户密码允许任意非空值；会话密钥 `SESSION_SECRET` 使用至少 32 字符的随机值。账号、密钥由用户安全填写，不能提交到 Git、放入 URL 或公开日志。
- 不复用演示站的域名、密钥、账号或数据库，不主动安装面板或变更 DNS；使用用户授权的目标环境。

## 项目结构

ShuXin 是 Astro + TypeScript + Drizzle + SQLite 的单站长微博客。`src/pages/` 包含页面与 API，`src/lib/` 包含业务与数据访问，共用界面位于 `src/components/`、`src/styles/` 和 `src/scripts/`。

Node 的数据库与媒体存放在 `DATA_DIR`（默认 `data/`）。Cloudflare 使用单个 SQLite Durable Object，绑定为 `SITE`，对象名为 `single-owner-site`，无需 D1 或 R2。两种部署各自独立，数据不自动同步。

## Cloudflare Workers

可使用 README 的部署按钮，在用户自己的 Cloudflare 账号部署：

1. 设置 Worker 名称，填写 `SITE_URL` 为最终 HTTPS 地址，填写独立随机 `SESSION_SECRET`。
2. 构建命令使用 `npm run build:worker`，部署命令使用 `npm run deploy`。
3. 使用自定义域名时，在 Worker 设置中绑定域名，确保实际访问地址与 `SITE_URL` 一致。
4. 部署完成后访问 `/admin/setup` 创建站长。

用户已授权且 Wrangler 已登录时，也可使用 CLI：

```sh
npm ci
# 先将 wrangler.jsonc 的 name、SITE_URL 和可选 routes 改为用户自己的配置
npm run build:worker
npx wrangler secret put SESSION_SECRET --config dist-worker/server/wrangler.json
npx wrangler deploy --config dist-worker/server/wrangler.json
```

密钥在安全输入提示中填写，不拼进命令。公共配置使用 `wrangler.jsonc`；`deploy:production` 是维护者演示站的本地命令，不适用于其他部署者。

## 宝塔 / Node 运行包

下载对应 Release 的 `ShuXin_版本_server.zip`。运行包已经构建，不要将源码 ZIP 当成运行包，也不要复制本机 `node_modules`。

1. 使用 Node.js 24，解压到项目目录，如 `/www/server/shuxin`。
2. 在该目录执行：

   ```sh
   npm ci --omit=dev --no-audit --no-fund
   node scripts/setup-server.mjs https://用户的域名
   npm start
   ```

3. 宝塔添加 Node 项目，选择项目目录、Node 24、启动命令 `npm start`、端口 `4321`，开启守护和开机启动。
4. 选择实际运行用户，确保该用户可读配置、可写 `data/`，`.env` 保持 600 权限。配置 HTTPS 反向代理到 `127.0.0.1:4321`，请求体允许至少 11 MB，不缓存页面、API 和媒体路由，不直接公开整个项目目录。
5. 访问 `/admin/setup` 创建站长。

SQLite 原生依赖在服务器安装；无可用预编译文件时需要 Python 3、make 和 C++ 编译器。配置脚本会生成独立会话密钥和 `.env`，已有 `.env` 不会覆盖。

## 源码与 Docker

需要 Node.js 22.12+，建议 Node.js 24。源码首次运行：

```sh
npm ci
cp .env.example .env
openssl rand -hex 32
```

将随机值填入 `.env` 的 `SESSION_SECRET`。本地使用 `SITE_URL=http://localhost:4321` 与 `COOKIE_SECURE=false`，执行 `npm run dev`。正式站设置真实 HTTPS `SITE_URL` 与 `COOKIE_SECURE=true`，执行 `npm run build`、`npm start`，配合进程管理器和 HTTPS 反向代理。

Docker 使用同样的 `.env` 配置：

```sh
docker compose up -d --build
```

命名卷 `shuxin-data` 保存数据库和媒体，HTTPS 代理到 `127.0.0.1:4321`。`HOST`、`PORT` 控制监听地址与端口，`DATA_DIR` 控制 Node 数据目录。

## 升级与排错

- 升级前可使用后台内置导出功能。Node 保留 `.env` 和整个 `data/`；Docker 保留持久卷，不执行 `docker compose down -v`；Workers 保留原 Worker、`SITE` 绑定与对象，不删除 namespace。使用原配置部署，新系统迁移自动执行。
- 502 时检查进程、端口、Node 版本与反向代理。写入出现 403 时检查实际访问地址是否等于 `SITE_URL`，不要关闭鉴权或 CSRF 来绕过错误。
- 文件分块上传默认上限 512 MB，`MAX_MEDIA_MB` 可设为 1–2048；反向代理应允许至少 11 MB 请求体。
- 新站默认存储即可使用。第三方对象存储和背景在后台设置，不属于部署必填项。

## 完成部署

按用户授权检查实际 HTTPS 地址、首页、后台入口和运行日志。账号由用户创建后，可按授权确认保存与上传；升级确认原内容仍存在。写操作超时先查看结果，不盲目重复。

交付访问地址、准确版本、运行目录或 Worker 名称、后台入口与启动方式，不包含密钥。明确未验证的环节，不把构建成功当成完整部署成功。
