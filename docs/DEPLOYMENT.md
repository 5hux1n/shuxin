# 安装与部署

希望减少操作时，使用 [Cloudflare 一键部署](CLOUDFLARE.md#一键部署) 或 [宝塔预构建运行包](BAOTA.md)。

项目所有者已通过 UI 并授权质量审核、部署与开源。已执行的检查见根目录 AUDIT_REPORT.md。Cloudflare 部署见 CLOUDFLARE.md。

## 本地启动与人工 UI 查看

需要 Node.js 22.12+（建议 Node 24 LTS）、npm。SQLite 与图片处理使用原生依赖；若没有适用的预编译文件，需要 Python 3、make 和 C++ 编译器。

在项目根目录执行：

```sh
cp .env.example .env
openssl rand -hex 32
```

将随机值填入 `.env` 的 `SESSION_SECRET`，不要使用示例占位内容。保留本地 `SITE_URL=http://localhost:4321` 和 `COOKIE_SECURE=false`。然后执行：

```sh
npm ci
npm run dev
```

访问 `http://localhost:4321/admin/setup`，填写登录名、昵称和密码。账号只允许创建一次；后台入口为 `/admin`，首页为 `/`。初始化接口由数据库中唯一站长约束锁定。

先由项目所有者亲自查看首页、发布器、图片、长文、手机宽度和浅/深主题。不要把启动成功等同于验收完成。在所有者确认“UI 已通过”并另发审核任务前，不启动 AI 代码、功能、交互或安全审核。

### 手机查看 UI

把 `SITE_URL` 改为手机实际访问的电脑局域网地址（如 `http://192.168.5.2:4321`），重启本地服务，然后电脑和手机都使用这个地址。写请求严格检查 Origin，因此不能配置 localhost 后改用另一个地址发布。局域网 HTTP 仅用于本地查看，不用于公网部署。

## Node 正式运行

```sh
npm ci
npm run build
NODE_ENV=production npm start
```

`npm start` 使用 `start.mjs`，自动切换到项目目录并读取 `.env`，也支持进程管理器注入环境变量（优先于文件）。直接运行原始 Astro 入口时，需自行加载配置：

```sh
node --env-file=.env dist/server/entry.mjs
```

Astro 开发模式读取 `.env`；生产环境建议始终通过运行环境注入变量，而不依赖构建时值。更改 URL、密钥或目录后重启服务。

## Docker Compose

在 `.env` 中设置真实 HTTPS 站点 Origin，例如 `SITE_URL=https://notes.example.com`；设置随机会话密钥和 `COOKIE_SECURE=true`。

```sh
docker compose up -d --build
```

Compose 仅将端口映射到本机 `127.0.0.1:4321`。通过 Nginx/Caddy 等反向代理提供 HTTPS。容器以非 root 的 node 用户运行，`shuxin-data` 卷同时保存数据库和图片，不需要外部数据库。Dockerfile 内的 build 是部署阶段配置；本机未安装 Docker，未运行容器构建。

Nginx 配置示例（证书由部署者提供）：

```nginx
server {
  listen 443 ssl;
  server_name notes.example.com;
  ssl_certificate /etc/ssl/notes/fullchain.pem;
  ssl_certificate_key /etc/ssl/notes/privkey.pem;
  client_max_body_size 11m;
  location / {
    proxy_pass http://127.0.0.1:4321;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
  }
}
```

HTTP 入口重定向至 HTTPS。不要缓存页面、API 或 `/media/`；不要将 data/media 直接映射为静态目录。生产域名的 `SITE_URL` 必须和浏览器访问 Origin 完全一致。反向代理还应按实际资源配置上传和请求速率限制。

## 首次初始化和持久化

首次加载服务会创建 `DATA_DIR/shuxin.sqlite`，并按 `schema_migrations` 表执行尚未应用的 SQL。迁移采用事务，不清库，重复启动不会重复创建站长或覆盖数据。`drizzle/` 必须随服务发布。媒体存储在 `DATA_DIR/media/`，随机 UUID 文件名，图片权限由路由判定。

## 升级

1. 先通过后台下载备份，并保存当前代码版本和 `.env`。
2. 停止当前服务；保持数据卷与目录。
3. 替换代码/镜像，安装新依赖并构建；不要删除 data，不执行 `docker compose down -v`。
4. 启动新服务，自有 Schema migration 自动执行。备份前的数据库若要回滚，须与对应代码一同恢复，不能直接让旧代码写入已升级的数据库。

本项目首次正式版本目标为 `1.0.0`，发布状态以审核报告及实际线上产物为准。

## 备份与恢复

详见 [BACKUP.md](BACKUP.md)。定期保存数据库和全部关联媒体，并把备份放在服务器之外。完整备份含账号密码哈希和私密内容，必须按敏感数据保管。

### 可选对象存储

系统设置支持阿里云 OSS、腾讯云 COS、七牛云 Kodo、R2 和 S3 兼容存储。默认存储仍可直接使用。配置、权限与备份说明见 [OBJECT_STORAGE.md](OBJECT_STORAGE.md)。切换配置不迁移旧文件；恢复原始数据库时保留原 SESSION_SECRET 和存储桶。
