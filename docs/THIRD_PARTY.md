# 第三方媒体组件

- heic-to 1.6.5（LGPL-3.0-or-later）：HEIC / HEIF 浏览器转换，按需加载 CSP 版本。原样源码与构建脚本：https://github.com/hoppergee/heic-to ；上游 libheif：https://github.com/strukturag/libheif 。授权全文位于 public/licenses/heic-to.txt，配套 GPL-3.0 全文位于 public/licenses/GPL-3.0.txt。
- MP4Box.js 2.4.1（BSD-3-Clause）：MOV / MP4 容器校验。源码：https://github.com/gpac/mp4box.js 。授权全文位于 public/licenses/mp4box.txt。

书信源代码公开可修改：替换 package.json 中的 heic-to 或其源码模块，执行 npm install 与 npm run build / npm run build:worker 即可重新链接或替换转换器；应用本身的 MIT 许可不覆盖这些第三方库。第三方库及授权文件随部署发布，版权声明保留。

## 音视频元数据

使用 [music-metadata](https://github.com/Borewit/music-metadata) 与 [strtok3](https://github.com/Borewit/strtok3)（MIT）识别容器和轨道。许可保存在项目根目录 `licenses/`。音乐分享实现参考 [MetingJS](https://github.com/metowolf/MetingJS) 的平台链接处理方式，未复制其播放器或平台鉴权代码，也未接入其默认第三方 API。

## 下载卡片图标

文件类型与下载按钮采用 Lucide SVG（ISC），许可随 `public/download-icons/LICENSE` 保存。百度、阿里、夸克、123 云盘使用官方网站提供的服务图标，仅用于链接来源识别，商标属于各平台。来源记录见 `public/download-icons/SOURCES.md`。

微信原生、AC 娘、洋葱头和小黄鸡表情素材的来源、快照与版权说明见 [EMOJI_SOURCES.md](EMOJI_SOURCES.md)，不纳入项目 MIT 图片许可。
