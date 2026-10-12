# 第三方对象存储

ShuXin 的数据库继续保存动态、账号、设置与文件信息。图片、GIF、Live Photo、音频、视频和下载附件可保存到第三方对象存储。Node/Docker 与 Cloudflare Workers 均支持。

## 配置入口

登录后台 → 设置 → 存储设置 → 文件存储 → 新增对象存储。填写配置后点击「测试连接」或「保存存储设置」。保存前会写入一个随机测试文件，检查读取、范围请求、删除与匿名访问，再删除测试文件；失败不会启用新配置。

必须使用私有桶/私有空间，禁止公共读权限及绕过鉴权的 CDN。凭据需要目标前缀内的上传、分片上传、读取、删除权限。无需列举整个账号或管理其他桶；未完成分片建议在服务商控制台配置自动过期清理规则。

| 服务商 | Endpoint 示例 | Region | 说明 |
|---|---|---|---|
| 阿里云 OSS | `https://oss-cn-hangzhou.aliyuncs.com` | `cn-hangzhou` | 原生 OSS V4 签名；使用公网区域 Endpoint |
| 腾讯云 COS | `https://cos.ap-guangzhou.myqcloud.com` | `ap-guangzhou` | S3 V4 签名；Bucket 填完整 `名称-APPID`，使用虚拟主机寻址 |
| 七牛云 Kodo | `https://up.qiniup.com`（华东） | `z0`（配置标识） | 原生分片上传 v2；另填私有空间 HTTPS 下载域名；其他区域按控制台填写上传地址 |
| Cloudflare R2 | `https://账号ID.r2.cloudflarestorage.com` | `auto` | S3 V4；不要启用 r2.dev 公共访问 |
| AWS S3 | `https://s3.us-east-1.amazonaws.com` | `us-east-1` | S3 V4 |
| MinIO / S3 兼容 | 服务商提供的公网 HTTPS 域名 | 服务商配置的区域 | 可启用 Path-style；需要有效 HTTPS 证书 |

Endpoint 填服务根地址，不带路径、查询参数或账号密码。OSS/COS Endpoint 可填写区域域名或完整桶域名；不要使用网页控制台地址。七牛管理 Endpoint 留空使用 `https://rs.qiniuapi.com`，如服务商要求区域地址则按其控制台填写；下载域名必须允许带签名访问私有文件、支持 Range 请求，不使用临时测试域名。这里的 Region 不改变七牛路由，实际区域由上传 Endpoint 决定。

## 凭据与已有文件

- Access Key 和 Secret Key 在服务端使用 AES-256-GCM 加密保存。页面/API 不返回密钥；已有配置的凭据输入框留空表示保留。需轮换时填写新凭据并保存同一配置。
- 加密密钥从 `SESSION_SECRET` 派生。更换该值前需要安排存储凭据重新加密；直接替换会使原配置无法解密。原始数据库恢复须保留原密钥，禁止把密钥提交到 Git 或发到聊天。
- 新增配置后只影响新上传。每个文件记录具体配置与对象路径；切回默认存储不影响旧文件。已有配置的服务商、桶和地址不能直接改动，换位置请新增配置。配置列表保留旧配置以读取旧文件。
- 文件仍使用 `/media/{id}`。服务端先检查动态可见性和登录身份，再从私有存储读取并流式返回；浏览器不接收对象存储凭据或签名外链。音视频播放支持 Range；不需要浏览器直传 CORS。
- 删除失败的远程文件保留清理记录，在「重试文件清理」中重试。每次处理最多 50 个。权限撤销、地址故障等问题修复后再重试。
- 当前不提供已有文件一键迁移，也不删除旧存储配置。

## 上传与备份

浏览器分块上传，文件格式检查完成后再分片写入目标存储，成功后删除本地/Cloudflare 暂存副本。暂存期间需要足够的默认存储空间；当前不是浏览器直接上传到存储桶。单文件大小仍由 `MAX_MEDIA_MB` 控制，默认 512 MB，上限 2048 MB；实际上传受网络和部署平台资源限制。

后台完整备份会把远程文件读回 ZIP，恢复后使用默认存储，因此不包含对象存储密钥和配置。Node 导出以文件和流处理；Workers 完整 ZIP 媒体上限仍为 24 MB，超出时应分别保存数据库与存储桶文件，并在服务商启用版本控制/备份。Cloudflare 数据库时间点恢复不包含第三方存储桶；原始数据库恢复须同时保留各桶和原 `SESSION_SECRET`。

## 协议依据

- [阿里云 OSS V4 签名](https://help.aliyun.com/en/oss/developer-reference/recommend-to-use-signature-version-4)
- [腾讯云 COS 的 S3 兼容配置](https://intl.cloud.tencent.com/document/product/436/34688?lang=en)
- [七牛分片上传 v2](https://developer.qiniu.com/kodo/6364/multipartupload-interface)、[私有下载](https://developer.qiniu.com/kodo/1321/how-to-acquire-the-outside-storage-file-links)

服务商列为已实现适配；实际账号的连通性、策略、域名和区域须在保存时完成连接检查。不要把协议模拟测试当作所有云账号的实测认证。
