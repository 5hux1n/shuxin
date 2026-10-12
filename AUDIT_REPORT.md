# V1.0 质量审核与发布记录

当前演示站点：https://shuxin.my/。以下保留各次验收时的地址记录；旧域名的博客绑定已移除。

审核日期：2026-10-10（Asia/Shanghai）。项目所有者已明确批准 UI，并授权功能、安全验收、Cloudflare Workers 发布与 GitHub 开源。原 UI 的单列结构、交通灯、颜色、间距保持不变；RSS 按所有者要求移除。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| Astro / TypeScript `npm run check` | 0 错误、0 警告、0 提示 |
| ESLint `npm run lint` | 通过 |
| Node SSR `npm run build` | 通过 |
| Workers `npm run build:worker` | 通过 |
| Node 隔离 HTTP/数据库验收 | 117 条断言通过 |
| workerd 隔离 HTTP/SQLite 验收 | 117 条断言通过 |
| npm 完整依赖扫描、生产依赖扫描 | 未报告已知漏洞；扫描不能证明没有未知漏洞 |
| 真实浏览器交互 | 初始化、预览、上传/粘贴、排序、草稿、编辑、发布、长文、灯箱、复制、深色主题、搜索通过 |
| 手机宽度功能检查 | 390px 下无横向溢出，图片加载；未改变已批准视觉设计 |
| Docker 实际构建/运行 | 未执行：本机没有 Docker；Node 24 基础镜像与持久卷配置已审阅 |

所有自动化验收使用随机凭据、独立端口和临时持久化目录，不读取或改写用户现有账号与内容。测试脚本在结束时停止临时服务并移除临时数据。浏览器验收也使用独立的非生产账号和目录。

## 已修复的问题

| 严重度 | 问题及影响 | 修复位置 |
| --- | --- | --- |
| 阻塞 | 旧依赖存在已知高危/严重漏洞，不能按原依赖发布 | package.json、package-lock.json：升级 Astro/adapter、Drizzle、sharp 与工具依赖 |
| 阻塞 | SQLite LIKE 的 ESCAPE 表达式为空，搜索请求 500 | src/lib/posts/repo.ts：使用单字符 `!` 转义；实测 `%`、`_`、反斜杠字面搜索 |
| 阻塞 | Node 原生 SQLite、sharp 和本地文件系统不能在 Workers 中直接运行 | src/worker.ts、src/lib/cloudflare、astro.config.mjs：官方 Drizzle Durable SQLite driver，事务内持久化媒体分块，WASM 图片解码 |
| 重要 | Workers 提前拒绝流式请求时可能产生未捕获的流错误 | src/worker.ts：按路由上限读取请求并有界缓冲后传入 Durable Object；验收断言无未捕获运行异常 |
| 重要 | Worker SQL 备份若缺少迁移历史，Node 恢复启动时会重复建表 | src/lib/cloudflare/backup.ts：导出迁移记录；验收 SQL 恢复、条数和迁移历史 |
| 重要 | 编辑时间戳可能同毫秒，旧页面冲突标记不一定失效 | posts/service.ts、api/posts/[id]/pin.ts：updatedAt 单调递增 |
| 重要 | 密码异步验证期间发生修改时，旧验证结果可能创建新会话 | api/auth/login.ts、password.ts：写入前重新检查密码哈希，修改密码清除全部会话 |
| 重要 | 初始化已完成仍继续解析密钥、消耗初始化限流额度 | api/auth/setup.ts：先拒绝二次初始化，数据库唯一约束与事务复查保留 |
| 一般 | 开发阶段类型错误、Worker/DOM 类型污染、空 catch 与源码可读性 | src/scripts、runtime.ts、tsconfig.json、eslint.config.mjs：类型隔离、响应类型、控件非空收窄、必要注释及源码格式化 |
| 加固 | CSP 允许所有内联脚本，后台重定向缺少统一响应保护 | middleware.ts、SiteLayout.astro：每请求 nonce、统一保护头，维持主题功能 |

## 自动化覆盖范围

- 唯一站长初始化、二次初始化拒绝、随机会话、会话持续有效。
- 匿名写入、伪造 Origin、错误 CSRF 拒绝；登录失败限流；改密码使另一登录设备失效；退出后后台不可访问。
- 动态创建、编辑、删除、置顶；空正文/无图拒绝；旧编辑冲突拒绝。
- draft/public/unlisted/private 的详情、首页、搜索、sitemap、OG、图片权限；可见性改变后立即撤销图片公开访问。
- 手机 JPEG EXIF 方向自动归正；SVG 冒充 PNG、损坏图片拒绝；有效图片重新编码；未关联图片只有站长可读；动态间不能偷取附件；头像与动态图片不能混用。
- 23 条分页内容无重复/漏项、无效游标、搜索特殊字符。
- Markdown 脚本与危险协议净化，隐私缓存策略、CSP。
- 站点设置、公开头像、完整备份含草稿和私密媒体；SQLite/SQL 恢复条数、迁移记录、清除活动会话。
- 已移除的 RSS 路由返回 404。

## 浏览器覆盖与边界

真实浏览器操作了初始化表单、Markdown 预览和返回编辑、多文件选择与剪贴板图片上传、替代文本、图片前移、保存草稿、编辑回填、发布、首页长文展开/收起、图片上一张/下一张、Escape 关闭灯箱、复制链接、主题切换与搜索、加载更多从 20 条追加到 24 条且无重复。浏览器错误日志为空。

未执行专项渗透测试、超大规模压力测试或 Docker 容器运行。图片粘贴已通过真实浏览器检查；操作系统级文件拖放因浏览器工具不支持该入口未执行，处理代码已审阅并共用已验收上传链路。Node 本地早期 scrypt 密码可继续登录；Workers 新密码使用 PBKDF2。两个部署的数据互不自动同步。

## 平台限制

Workers 图片最多 800 万像素；Node 最多 3200 万像素。Workers 完整导出媒体总量限制 24 MB，超出返回明确错误，保留 Cloudflare SQLite 时间点恢复能力。Node 大数据备份使用停机文件备份。未关联上传不会公开，暂不自动清理以免丢失未保存的编辑图片。

## 发布状态

首次正式版本 **1.0.0 已发布**：[GitHub Release](https://github.com/5hux1n/shuxin/releases/tag/v1.0.0)，非草稿、非预发布。Cloudflare 默认地址：[shuxin.11195666.workers.dev](https://shuxin.11195666.workers.dev/)，当前版本 ID 为 `855ee1f1-c10b-4256-96d3-639f413a45d0`。已核对真实浏览器首页、HTTPS 页面、canonical 和公开读取边界。线上为独立新站，未复制本地账号或内容；由站长使用独立初始化密钥创建生产账号。GitHub 源码已公开：[5hux1n/shuxin](https://github.com/5hux1n/shuxin)。本次不会将测试账号、临时数据、.env、生产秘密、原 Pigeon 参考目录或生成构建产物提交到开源仓库。

自定义二级域名：等待项目所有者补充完整域名；不根据含糊输入猜测 DNS 目标。

GitHub Actions 已通过同样的 lint、类型、双端构建、Node/workerd 验收和生产依赖扫描：[检查记录](https://github.com/5hux1n/shuxin/actions/runs/38014851126)。线上初始化路由已实测拒绝错误密钥，Cookie 带 Secure/HttpOnly；匿名写入 401，未知详情/媒体及已移除 RSS 404。

## 1.0.1 发布验证 — 2026-10-10

- 初始化及修改密码前后端取消最低字符数，仍要求非空；既有哈希、会话、CSRF 和限流机制保留。
- 隔离 Node 和 workerd 环境各 119 项断言通过，使用单字符密码完成初始化、登录、改密与重新登录，并确认空密码被拒绝。lint、Astro check、两种构建通过。
- Workers Custom Domain `shuxin.goforit.si` 已部署；Cloudflare 和 Google DNS-over-HTTPS 均返回有效公网地址，HTTPS 首页和初始化页面正常，canonical 使用新域名。真实浏览器确认首页和初始化表单，密码输入没有 minlength。未创建或修改生产账号。

## 1.0.2 线上兼容性修复 — 2026-10-10

Cloudflare 生产 WebCrypto 拒绝超过 100000 次的 PBKDF2，而本地 workerd 默认不限，导致管理员创建返回 500。独立线上探针已复现 600000 次报 NotSupportedError、100000 次成功。Workers 改用 @noble/hashes 标准 PBKDF2-SHA256，保留 600000 次、随机盐、输出格式和现有哈希兼容；Node 继续使用 WebCrypto。

Node、本地 workerd 和独立 Cloudflare 线上测试站分别通过 120 项断言，包括管理员创建、登录、改密、旧密码拒绝、重新登录，以及备份密码哈希与 Node 原生标准 PBKDF2 的逐字节一致性。lint、类型检查、两种构建通过，生产依赖审计零已知漏洞。未创建、修改或删除正式站长账号及数据；线上测试 Worker 和数据在验收后清理。

## 1.0.3 系统设置与媒体扩展 — 2026-10-10

Node、本地 workerd 和独立 Cloudflare 测试站分别通过 154 项验收断言，覆盖账号修改、会话失效、头像、GIF 动画、Live Photo 配对、视频范围请求、媒体隐私和备份。lint、类型检查及两种构建通过，生产依赖审计零已知漏洞。旧版数据库升级保留站长资料并应用第二个 Schema migration。

真实浏览器验证了桌面及 390px 移动端表单、横排可见性、置顶按钮、头像保存、退出登录、HEIC 转换及 Live Photo 播放和保存；截图位于 docs/screenshots。正式站已部署并检查 HTTPS、首页视觉和未登录系统设置跳转，未改动生产账号或内容。临时 Cloudflare 测试站和本地验收数据已清理。

Live Photo 采用原始图片与 MOV/MP4 配对，不从静态照片还原动态；HEVC 播放取决于浏览器支持。HEIC 转换库仅在选择此类图片时加载，构建有较大客户端分块提示。Docker 运行、专项渗透和系统级拖放仍未验收。

生产 Worker 版本：be7d8afd-2e42-4b2e-bc32-cc90601c53a5。

## 1.0.4 保存反馈 — 2026-10-10

用户反馈系统设置保存账号资料无反应。隔离浏览器未重现服务器保存失效，但确认该表单缺少进行中反馈及字段校验的页面内提示。补齐保存与头像上传状态、字段校验提示、网络错误和 20 秒请求超时反馈；失败后按钮恢复。真实浏览器确认资料保存成功、刷新后保留、必填字段提示、网络失败及重试恢复。Node 与 workerd 各 154 项验收通过，lint、类型检查与双端构建通过。未读写生产站长账号或内容。

## 1.0.5 网站品牌配置 — 2026-10-10

顶部名称使用网站名称，网站设置新增 Logo 上传和恢复默认；页脚以 Powered by shuxin 链接开源仓库。Logo 使用现有图片净化与媒体存储，独立于头像和动态，禁止把动态图片或头像设为 Logo，禁止把已配置 Logo 挪为头像、动态附件或 Live Photo；移除后清理旧媒体。配置存入现有 settings 表，无需新 Schema migration。

Node 和 workerd 各 169 项验收通过，lint、类型检查及双端构建通过。真实浏览器完成 Logo 上传、名称修改、保存即时更新、首页读取、移动端无溢出及恢复默认。截图：docs/screenshots/site-brand-v105.png。未修改生产账号、网站配置或内容。

## 1.0.6 Markdown 链接 — 2026-10-10

正文链接使用浅色 #245dc1、深色 #8ab4f8，常驻下划线，提供悬停与键盘焦点状态；只影响 .prose 内链接。统一四至六级标题样式。Workers 构建成功，已部署并在真实生产浏览器确认浅色、深色样式、窄屏无页面溢出和表格三列对齐，随后恢复原来的跟随系统主题。

按用户授权公开发布一篇 Markdown 格式长文，包含全部现有语义格式和主要写法，并说明不支持的扩展。生产链接：https://shuxin.goforit.si/p/737f356e-fb21-4657-8652-b87e44c62810 。正文与截图保存在本地 content/markdown-showcase-2026-10-10，未作为应用代码提交。

## 1.0.24 对象存储补充验收

Node 与 Workerd 各 278 项既有/API 验收通过；五种对象存储适配器通过 260 项隔离协议检查，覆盖分片、签名、Range、凭据隐藏、配置切换、备份和删除失败清理。类型检查与 lint 通过。真实七牛账号完成小文件及约 9 MB 文件的上传、分片、范围与完整下载、字节校验、删除和测试文件清理；公开空间检测阻止启用。阿里云 OSS、腾讯云 COS、AWS/R2/MinIO 尚未使用实际账号验收。桌面/手机设置页及默认存储保存、错误提示已在隔离环境检查。

## 1.0.25 — 2026-10-12

- 网站、用户、系统、存储四个设置子菜单；用户资料增加一致分区，保留滚动条空间以避免横向跳动。
- 编辑器使用本地 Lucide SVG 工具栏，统一音乐导入和图片/Live Photo 自动配对；网盘名称与提取码输入框使用统一 Token。
- 全屏背景支持上传、HTTPS 图片、图片/JSON API 与 Bing 预设。自定义 JSON 由浏览器读取，省略凭据并限制响应 64 KiB/10 秒；服务器仅请求固定每日图片端点（Bing/Bing 中国/biturl）。公共 Bing 元数据接口不创建用户 Cookie，缓存一小时。
- Node 与 workerd 各 296 条 HTTP/数据/权限断言通过；存储 260 条隔离协议断言通过。Astro check 0 错误/警告/提示，ESLint 通过，双运行时构建通过。构建仍有既有音频转换大 chunk 提示。
- 真实隔离浏览器确认 Bing 与第三方 JSON 背景加载、保存后刷新、设置切换对齐、图标工具栏、普通图片与 Live Photo 混合上传识别、歌单识别、网盘卡片预览和保存草稿。390px 下无横向溢出。
- 表情素材仅完成来源调查，来源记录保存在 public/stickers/；新四套素材未打包，也未声称第三方图片受项目 MIT 许可覆盖。
