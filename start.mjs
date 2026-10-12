import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL(".", import.meta.url)));
if (existsSync(".env")) process.loadEnvFile(".env");
process.env.NODE_ENV = "production";
if (!existsSync("dist/server/entry.mjs")) {
  throw new Error("缺少运行文件，请下载宝塔运行包或先执行 npm run build。");
}
await import("./dist/server/entry.mjs");
