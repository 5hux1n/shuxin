import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
if (existsSync(".env")) {
  console.log("已有 .env，保留现有配置和密钥。修改域名请编辑 .env 后重启。");
} else {
  const address = process.argv[2];
  if (!address) throw new Error("用法：node scripts/setup-server.mjs https://你的域名");
  const url = new URL(address);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("请填写完整 HTTPS 站点地址，不含路径；本机调试允许 localhost HTTP。");
  }
  writeFileSync(".env", `SITE_URL=${url.origin}\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nDATA_DIR=./data\nCOOKIE_SECURE=${url.protocol === "https:"}\nHOST=127.0.0.1\nPORT=4321\n`, { flag: "wx", mode: 0o600 });
  mkdirSync("data", { recursive: true, mode: 0o700 });
  console.log("配置已生成。宝塔启动文件选择 start.mjs，端口 4321。访问站点 /admin/setup，填写登录名、昵称和密码创建站长账号。");
}
