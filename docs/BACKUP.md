# 数据导出、备份与恢复

## 后台完整导出

登录 `/admin/settings`，选择“下载完整备份”。写请求经过认证和 CSRF 校验，导出包括：

- `content.json`：Markdown 原文、状态、可见性、置顶、时间、图片排序与替代文本、网站配置和站长公开资料。
- `shuxin.sqlite`：当前新系统数据库快照，包含唯一站长及密码哈希、自有迁移记录；去除登录会话和登录限流记录。
- `media/`：数据库记录的所有图片（包括暂未关联动态的上传）。

快照在同一个数据库事务中生成，并同步复制媒体。随后压缩，临时目录在完成或错误后移除。导出保留图片 ID 和数据库关联；没有旧 Pigeon 数据迁移器。后台导出适合轻量个人站点：压缩文件暂存于服务内存，请预留空间和内存；大型站点应使用下述停机备份方式。

## 文件系统备份

最直接的方式是停止服务后完整复制 DATA_DIR。数据库采用 WAL，运行中不能只复制 `shuxin.sqlite`；应使用 SQLite backup API/SQLite CLI `.backup`，或停机后同时保留整个目录。需要一起保存 `.env`（在受保护位置）、代码/镜像版本以及 `drizzle/` 迁移文件。

Node 部署例子（先停止进程管理器中的服务）：

```sh
mkdir -p backups
cp -a data backups/data-2026-10-10
```

Docker 的停机备份：

```sh
docker compose stop shuxin
docker compose run --rm --no-deps --user root -v "$PWD/backups:/backup" shuxin sh -c 'tar -czf /backup/shuxin-data.tar.gz -C /app/data .'
docker compose start shuxin
```

先创建本地 `backups` 目录。容器内 tar 使用同一持久化卷；不要把备份留在公开目录。`docker compose run` 命令覆盖启动入口，不启动应用。

## 恢复后台 ZIP（Node）

1. 停止服务，将现有 DATA_DIR 完整保存为另一个备份。
2. 只解压自己创建、可信来源的 ZIP 到一个新目录，里面应为 `shuxin.sqlite`、`content.json` 和 `media/`。
3. 将该目录配置为 DATA_DIR；保留原来的 SITE_URL 和有效的随机 SESSION_SECRET。不要将 ZIP 上传到公开 web 目录。
4. 给服务用户赋予数据库和媒体的读写权限。数据库及备份建议 600，目录 700。
5. 用相应代码版本启动服务，使用原站长账号登录。导出的会话已清除；需要重新登录。

没有网页端覆盖数据库的导入按钮，以免误覆盖唯一站长或泄露私密内容。完整 ZIP 提供可恢复 SQLite 快照；JSON 供数据自主保有、阅读与自行处理。

## 恢复到 Docker 卷

先将可信备份 ZIP 解压到本地 `restore/`，停止服务。将卷中的现有数据备份后，再显式替换（这是部署者执行的破坏性恢复操作，不由本轮 AI 执行）：

```sh
docker compose stop shuxin
docker compose run --rm --no-deps --user root -v "$PWD/restore:/restore:ro" shuxin sh -c 'rm -f /app/data/shuxin.sqlite /app/data/shuxin.sqlite-wal /app/data/shuxin.sqlite-shm && rm -rf /app/data/media && cp /restore/shuxin.sqlite /app/data/shuxin.sqlite && cp -a /restore/media /app/data/media && chown -R node:node /app/data'
docker compose start shuxin
```

恢复必须在应用停机时执行。不要将 WAL/SHM 旧文件混入恢复后的数据库。tar 停机备份同样恢复整个 data 目录。Node SQLite 与 Workers SQL 的备份还原已在隔离环境验收；Docker 卷恢复命令尚未在容器中执行。

## Workers 备份

Workers 输出 database.sql、content.json 和 media/，保留新系统迁移历史。具体限制与 Node 恢复方法见 [CLOUDFLARE.md](CLOUDFLARE.md)。

## 第三方对象存储

完整 ZIP 会读回远程文件，并将备份中的存储引用转换为默认存储；不包含对象存储配置或密钥。恢复完整 ZIP 后重新设置第三方存储即可用于新上传。Workers 媒体超过 24 MB 时，数据库与存储桶分别备份；原始数据库恢复保留原 SESSION_SECRET。详见 [对象存储](OBJECT_STORAGE.md)。
