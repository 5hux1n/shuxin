# ShuXin · 书信

轻量、可自托管的个人微博客。站长发布，访客阅读；从一句话、一张图到一篇长文，都留在同一条单列信息流里。

[在线演示](https://shuxin.my/) · [下载 1.0.0](https://github.com/5hux1n/shuxin/releases/tag/v1.0.0) · [让 AI 帮你部署](Ai_agent_docs/AI_DEPLOYMENT.md)

![书信电脑端与手机端宣传效果图](Ai_agent_docs/images/promo-overview.png)


## 主要功能

- **连续阅读**：单列时间线、置顶、加载更多、长文展开、独立链接、搜索与回到顶部。
- **自由记录**：无需标题，支持 Markdown、代码高亮、图片、GIF、Live Photo、音视频、音乐卡片、歌单和文件下载卡片。
- **轻量管理**：发布、编辑、删除、草稿与文件库；后台标签直接切换，适配手机和电脑。
- **个人外观**：头像、昵称、简介、头像跳转链接、图片与文字 Logo、日夜模式、背景图及不透明度。
- **内容权限**：公开、不列出、私密三种可见性；草稿与私密内容的媒体按权限访问。
- **自己掌握数据**：SQLite、内容与媒体备份；支持 Node、Docker、Cloudflare Workers 和可选对象存储。


## 快速部署

### Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/5hux1n/shuxin/tree/v1.0.0)

部署到自己的 Cloudflare 账号，配置 `SITE_URL` 为最终访问地址，`SESSION_SECRET` 为至少 32 字符的随机会话密钥。部署后访问 `/admin/setup` 创建站长。

默认使用单个 SQLite Durable Object 保存站点数据，无需额外配置 D1 或 R2。完整步骤见 [AI 部署教程](Ai_agent_docs/AI_DEPLOYMENT.md)。

### 宝塔 / Node 服务器

从 [1.0.0 Release](https://github.com/5hux1n/shuxin/releases/tag/v1.0.0) 下载 **`ShuXin_1.0.0_server.zip`**，解压后在 Node.js 24 环境执行：

```sh
npm ci --omit=dev --no-audit --no-fund
node scripts/setup-server.mjs https://你的域名
npm start
```

再设置 HTTPS 反向代理到 `127.0.0.1:4321`。运行包已构建，不需要在服务器构建前端，也不包含站点数据。宝塔的项目与目录权限设置见 [AI 部署教程](Ai_agent_docs/AI_DEPLOYMENT.md)。

### 本地开发 / 源码部署

需要 Node.js 22.12+，建议 Node.js 24。

```sh
git clone --branch v1.0.0 --depth 1 https://github.com/5hux1n/shuxin.git
cd shuxin
npm ci
cp .env.example .env
openssl rand -hex 32
```

把生成的随机值填入 `.env` 的 `SESSION_SECRET`，然后启动：

```sh
npm run dev
```

访问 `http://localhost:4321/`，首次创建站长使用 `/admin/setup`。源码正式运行执行 `npm run build` 和 `npm start`；Docker 部署见 [AI 部署教程](Ai_agent_docs/AI_DEPLOYMENT.md)。

## AI 部署教程

部署步骤统一放在 [AI 部署教程](Ai_agent_docs/AI_DEPLOYMENT.md)，可交给能访问目标环境的 AI 执行。

技术栈：Astro、TypeScript、Drizzle ORM 与 SQLite。页面与 API 在 `src/pages/`，业务在 `src/lib/`，界面组件、样式与交互在 `src/components/`、`src/styles/`、`src/scripts/`。

源码采用 [MIT](LICENSE) 许可；第三方字体、图标和表情按各自许可使用。
