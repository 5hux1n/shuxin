import { mkdir, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import archiver from "archiver";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const { version } = JSON.parse(await readFile("package.json", "utf8"));
await mkdir("releases", { recursive: true });
const output = createWriteStream(`releases/ShuXin_${version}_server.zip`);
const archive = archiver("zip", { zlib: { level: 9 } });
const completion = new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("error", reject);
  archive.on("warning", reject);
});
archive.pipe(output);
for (const file of [
  "package.json",
  "package-lock.json",
  ".env.example",
  "start.mjs",
  "LICENSE",
  "README.md",
  "AGENTS.md",
  "Ai_agent_docs/AI_DEPLOYMENT.md",
  "scripts/setup-server.mjs",
]) {
  archive.file(file, { name: file });
}
archive.directory("dist", "dist");
archive.directory("drizzle", "drizzle");
archive.directory("Ai_agent_docs/images", "Ai_agent_docs/images");
archive.directory("public/licenses", "licenses");
archive.directory("licenses", "licenses");
await archive.finalize();
await completion;
console.log(
  `已生成 releases/ShuXin_${version}_server.zip（不包含账号、配置、数据库或本机依赖）。`,
);
