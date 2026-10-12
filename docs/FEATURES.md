# V1.0 功能与源码清单

状态：UI 已通过，质量审核和首次发布结果见 AUDIT_REPORT.md。

| 范围 | 实现入口 |
| --- | --- |
| Astro / TypeScript / Node SSR / SQLite / Drizzle | astro.config.mjs、src/lib/db、drizzle/0001_initial.sql |
| 单站长初始化、登录退出、过期会话、改密码、CSRF | src/lib/auth、src/middleware.ts、src/pages/api/auth、src/pages/admin/setup.astro |
| 动态 CRUD、草稿、public/unlisted/private、置顶、旧编辑冲突提示 | src/lib/posts、src/pages/api/posts |
| 单列首页、图片与文字 Logo、个人资料、稳定游标加载更多 | src/pages/index.astro、src/components/SiteHeader.astro、OwnerProfile.astro、TimelineEntry.astro |
| 单条稳定链接、长文折叠、复制链接 | src/pages/p/[id].astro、src/scripts/site.ts |
| Markdown 代码/链接/列表/引用/表格、安全净化、发布前预览 | src/lib/markdown、src/pages/api/preview.ts |
| 图片选择、粘贴、拖放、真实解码限制、排序、alt、大图键盘操作 | src/components/Composer.astro、src/scripts/composer.ts、src/lib/media、src/components/MediaGallery.astro |
| 后台管理、草稿列表、编辑、删除确认 | src/pages/admin、src/scripts/site.ts |
| 头像、昵称、简介、站点标题/描述、默认与访客主题 | src/pages/admin/settings.astro、src/pages/api/settings.ts、src/styles/tokens.css |
| 公开搜索与游标分页 | src/pages/search.astro、src/lib/posts/repo.ts |
| SEO、OG、robots、sitemap | src/layouts/SiteLayout.astro、sitemap.xml.ts、robots.txt.ts |
| 自有 JSON/SQLite/媒体完整导出、停机备份恢复说明 | src/lib/backup.ts、src/pages/api/export.ts、docs/BACKUP.md |
| Workers SQLite、WASM 图片与持久化 | src/worker.ts、src/lib/cloudflare、wrangler.jsonc、docs/CLOUDFLARE.md |
| Docker、持久卷、初始化与升级 | Dockerfile、compose.yaml、docs/DEPLOYMENT.md |
| 空状态、错误状态、表单标签、焦点、响应式、减少动态偏好 | src/styles/global.css、src/components、src/scripts |

## 实施限制

- Node 与 Workers 的运行验收及浏览器操作结果见审核报告；没有覆盖 Docker 实际运行。
- GIF 上传保留动画；Markdown 正文不支持内联外部图片，图片使用发布器上传。
- 搜索采用适合小站的 SQLite LIKE 原文搜索，不使用分词、搜索高亮或外部搜索服务。
- 稳定游标依赖排序字段未被另一会话修改；发布/取消置顶会改变所在位置，刷新首页可重建当前列表。
- 手动保存草稿，不加入自动保存或后台轮询。未保存的上传仍为站长私有媒体，未做定时清理。
- 完整备份在内存中生成 ZIP，面向轻量小站；大数据量使用停机文件系统备份。恢复是部署者操作，没有网页端破坏性导入。
- 本产品初始发布为 1.0.0；此前公开发布记录与原标签保留。

没有有意省略 P0/P1 范围；不开发 P2，也不复制旧 Pigeon 代码或实现旧系统迁移。

- 用户设置 `/admin/user`：头像、昵称、简介与头像跳转；系统设置 `/admin/system`：登录名、密码及数据导出。修改登录名或密码注销所有会话；修改昵称、头像保留登录。
- 可见性为一排原生单选按钮；发布器不显示可见性或添加图片的说明文字。
- Live Photo 支持封面和 MOV / MP4 配对、HEIC / HEIF 浏览器转换、视频播放、鉴权和 Range 请求，备份与删除覆盖配对视频。无法从仅有静态封面恢复原始动态片段；HEVC 播放依浏览器支持。

网站设置支持顶部名称、图片与文字 Logo，页脚以 Powered by shuxin 链接到开源项目。

- 音频与独立视频上传、名称编辑、原生播放器、错误反馈。
- 音视频默认 512 MB，4 MB 分块上传、100 KB 存储分块、Range 流式播放。
- HTTPS 音频直链转播放器；网易云官方播放器及 QQ/汽水公开分享页解析，平台限制时显示提示。

## 外观与编辑

- 后台顶部的网站、用户、系统与存储平级标签；系统含登录名、密码、退出登录及数据导出。
- Logo、头像、背景图片上传/移除即时保存；昵称、简介与文字设置通过各自保存按钮提交。
- 全站背景图片固定覆盖视口，不透明度 0–100%，调整即时预览、保存后全站生效。
- 图片支持可选 HTTP/HTTPS 跳转网址，无网址时继续打开大图。
- Markdown 工具栏支持粗体、斜体、删除线、标题、引用、列表、只读任务列表、链接、行内/块代码、表格和分割线。
- 音乐分享卡片在接近视口时解析标题、歌手、封面；无封面或封面失败时显示生成的占位图。音频/平台播放器仍由用户主动点击加载，不自动播放。
- 音频、视频、Live Photo、音乐分享下方不提供下载和跳转平台链接。平台无法播放时显示状态提示。

- 音频直链及上传的音频文件也使用同一横向封面卡片，播放/暂停按钮控制原生音频，不显示下载或外部跳转入口。

## 音乐、歌单与编辑器

- 支持网易云、QQ、汽水分享链接，包含实际短链接跳转、公开歌曲资料及封面解析。平台没有匿名音源或歌曲需要付费时，显示明确提示，不承诺所有歌曲可播放。
- “导入歌单”可以粘贴公开平台歌单链接、每行一个歌曲/音频链接，或选择 M3U / JSON 文件。平台曲目列表受匿名接口限制；不公开的歌单应先导出文件。单个歌单最多 300 首、导入文本最多 100 KB。
- 发布后提供上一首、下一首、曲目选择、列表循环、单曲循环和顺序播放。无法解析公开音源的歌曲会跳过；全部不可播放时停止。网易云官方 iframe 不能报告播放结束，不参与自动连播。
- JSON 格式为 `{ "title": "歌单名", "tracks": [{ "title": "曲名", "url": "https://example.com/song.mp3", "artist": "作者" }] }`。也可使用本站 `/media/媒体ID`，媒体路由仍按原帖子权限保护。
- WMA 上传在浏览器本地转成 MP3 再保存，转换组件首次按需下载约 31 MB；不向第三方上传文件。大文件转换速度与成功率取决于设备可用内存。外链 WMA 的直接播放仍取决于浏览器支持。
- 代码块语言标记使用 `javascript`、`typescript`、`python`、`json`、`bash`、`html`、`css` 等常见语言；未支持的语言作为普通代码显示。复制保留正文和换行，行号不进入剪贴板。
- 表情包入口在 Markdown 工具栏内，内置微信原生、AC 娘、洋葱头、小黄鸡四套本地素材，点击插入 `:ac01:` 等短代号；旧原创 SVG 表情仅保留历史内容显示。

参考研究：[go-music-dl](https://github.com/guohuiyuan/go-music-dl) 及其 music-lib 的平台适配思路。本站独立实现公开接口与分享页面适配，不复制其 AGPL 源码，不接入账号 Cookie 或第三方破解音源服务。

### 平台限制

2026-10-11 的实际链接核查中，汽水《出山》及 QQ 免费歌赵乃吉《我可以抱你吗》在 Cloudflare 上可以原生播放。网易云示例在本机返回公开音源，在 Cloudflare 上游返回曲目错误码 404 和空音源；仍保留官方播放器作为后备。酷狗、酷我按站点所有者决定移除解析与歌单导入支持，历史正文中的链接仍是普通超链接。平台歌单也可能只返回部分曲目，导入器保留实际曲目数量并提示已知的总数。

## 文件与下载链接

- 任意非空文件附件，分块上传、可编辑名称、预览、草稿及权限控制。
- 文件下载卡片显示文件类型、名称、大小及下载按钮，未知类型显示默认图标。
- 网盘/HTTPS 下载链接支持资源名称、提取码和本地图标；按钮打开原始分享/下载地址。
- 动态删除解除文件关联，文件保留在文件库并支持导出；私密和草稿附件只允许站长读取。

- 文件管理支持本地与 OSS 文件按类型分类、单个/批量删除；编辑器文件库直接插入原文件的 Markdown 链接，不复制文件。说明见 [FILE_LIBRARY.md](FILE_LIBRARY.md)。
- 后台操作反馈使用顶部通知 toast；图片与文字 Logo 分行；手机端背景来源与更换/移除操作分行。

- 后台采用同一行标签页式菜单，动态、系统、用户、网站、存储和文件管理平级切换；手机端紧凑同排菜单。新建与编辑动态归属于动态管理标签。动态列表与草稿箱各有独立入口。

- 系统设置直接展示修改用户名、修改密码和导出数据三个紧凑标题区块，表单不使用弹窗；全后台内容卡片外右上角、搜索和主题控件下方显示站长昵称与文字链接式退出登录。

- 后台操作控件统一为 36px 高、同一字体/圆角/边框/底色；删除保留危险色，导航保留标签页形态。

- 文件管理提供独立“上传文件”入口，支持多选并按图片、音视频或附件自动处理；上传资源直接进入文件库，显示文件名。空状态居中。

- 网站设置与系统设置采用一致的区块、标题和表单间距，图片与文字 Logo 分行，手机端背景选择与操作分行。

- 网站设置简化为网站信息（标题、副标题）和外观设置（Logo、主题、背景）两组，按填写顺序排列，去掉重复标签和主题说明。
