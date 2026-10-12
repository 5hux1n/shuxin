# 宝塔部署

下载 GitHub Release 的 `ShuXin_版本_server.zip`，这是已经构建好的服务器运行包，不需要在宝塔构建前端，也不需要 MySQL。源码 ZIP 则需要先执行 `npm ci` 和 `npm run build`。

## 首次安装

1. 在宝塔安装 Node.js 24 与 Nginx。上传运行包并解压到自己的目录，例如 `/www/server/shuxin`。不要建立指向此目录的静态网站；网站通过 Node 项目反向代理访问。
2. 使用 Node 24 的终端，在解压目录执行（替换自己的域名）：

   ```sh
   npm ci --omit=dev --no-audit --no-fund
   node scripts/setup-server.mjs https://notes.example.com
   ```

   脚本自动生成会话密钥和 `.env`；已有 `.env` 时不会覆盖。原生 SQLite 依赖在服务器安装，不能复制 Mac 的 node_modules。若没有可用的预编译依赖，需要系统的 Python 3、make、C++ 编译器。
3. 宝塔 → 网站 → Node 项目 → 添加项目：项目目录选择解压目录，Node 选择 24，启动命令 `npm start`（或启动文件 `start.mjs`），端口 `4321`，运行用户 `www`，开启守护与开机启动。
4. 将项目目录所有权交给所选运行用户，确保 `.env`、`data/` 可访问；例如使用 `www` 时由服务器管理员执行 `chown -R www:www /www/server/shuxin`。`.env` 默认权限为 600。绑定域名并开启 HTTPS，反向代理指向 `http://127.0.0.1:4321`。不要缓存 API、页面和 `/media/`，代理请求体允许至少 11 MB（文件采用分块上传）。
5. 访问 `https://自己的域名/admin/setup`。填写登录名、昵称和密码创建唯一站长，无需初始化密钥。站点地址必须与 `SITE_URL` 相同。

## 升级

先备份，再停止 Node 项目。将新运行包解压覆盖代码，保留 `.env` 和整个 `data/`，执行 `npm ci --omit=dev --no-audit --no-fund` 后重新启动。不要删除数据目录，迁移自动执行。运行包不含 demo 内容、管理员账号或预设密码。

## 本地查看

运行包也可以在 Node 24 环境下使用：安装依赖，然后执行 `node scripts/setup-server.mjs http://localhost:4321` 与 `npm start`。公网必须使用 HTTPS。完整备份说明见仓库 `docs/BACKUP.md`。

本项目已验证运行包的 Node 启动；未在真实宝塔服务器中操作面板。宝塔菜单名称可能随版本改变，参照 [宝塔官方 Node 项目部署说明](https://docs.bt.cn/practical-tutorials/nodejs-pm2-deployment/)。

### 可选对象存储

存储设置支持阿里云 OSS、腾讯云 COS、七牛云 Kodo、R2 和 S3 兼容存储。默认存储仍可直接使用。配置、权限与备份说明见 [OBJECT_STORAGE.md](OBJECT_STORAGE.md)。切换配置不迁移旧文件；恢复原始数据库时保留原 SESSION_SECRET 和存储桶。
