import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import cloudflare from "@astrojs/cloudflare";
import path from "node:path";
const worker = process.env.SHUXIN_TARGET === "cloudflare";
const replacements = new Map([
  [
    path.resolve("src/lib/db/index.ts"),
    path.resolve("src/lib/cloudflare/db.ts"),
  ],
  [
    path.resolve("src/lib/media/service.ts"),
    path.resolve("src/lib/cloudflare/media.ts"),
  ],
  [
    path.resolve("src/lib/backup.ts"),
    path.resolve("src/lib/cloudflare/backup.ts"),
  ],
]);
export default defineConfig({
  output: "server",
  outDir: worker ? "./dist-worker" : "./dist",
  session: { driver: { entrypoint: "unstorage/drivers/memory" } },
  adapter: worker
    ? cloudflare({ imageService: "compile", configPath: process.env.SHUXIN_CONFIG || "wrangler.jsonc" })
    : node({ mode: "standalone" }),
  server: { port: 4321 },
  vite: {
    plugins: worker
      ? [
          {
            name: "shuxin-worker-services",
            enforce: "pre",
            resolveId(source, importer) {
              if (!importer || !source.startsWith(".")) return;
              const resolved = path.resolve(path.dirname(importer), source);
              return (
                replacements.get(resolved) ||
                replacements.get(resolved + ".ts") ||
                replacements.get(path.join(resolved, "index.ts"))
              );
            },
          },
        ]
      : [],
  },
});
