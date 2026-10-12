import type { DurableObjectState } from "@cloudflare/workers-types";
import { handle } from "@astrojs/cloudflare/handler";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { workerContext, type WorkerEnvironment } from "./lib/runtime";
import * as schema from "./lib/db/schema";
import initialSql from "../drizzle/0001_initial.sql?raw";
import liveSql from "../drizzle/0002_live_media.sql?raw";
import uploadsSql from "../drizzle/0003_uploads.sql?raw";
import imageLinksSql from "../drizzle/0004_image_links.sql?raw";
import objectStorageSql from "../drizzle/0005_object_storage.sql?raw";
export class ShuxinSite {
  private database;
  constructor(
    private ctx: DurableObjectState,
    private env: WorkerEnvironment,
  ) {
    ctx.storage.transactionSync(() => {
      ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
      );
      if (
        !ctx.storage.sql
          .exec("SELECT 1 FROM schema_migrations WHERE name='0001_initial.sql'")
          .toArray().length
      ) {
        ctx.storage.sql.exec(initialSql);
        ctx.storage.sql.exec(
          "INSERT INTO schema_migrations VALUES (?,?)",
          "0001_initial.sql",
          Date.now(),
        );
      }
      if (
        !ctx.storage.sql
          .exec(
            "SELECT 1 FROM schema_migrations WHERE name='0002_live_media.sql'",
          )
          .toArray().length
      ) {
        ctx.storage.sql.exec(liveSql);
        ctx.storage.sql.exec(
          "INSERT INTO schema_migrations VALUES (?,?)",
          "0002_live_media.sql",
          Date.now(),
        );
      }
      if (
        !ctx.storage.sql
          .exec("SELECT 1 FROM schema_migrations WHERE name='0003_uploads.sql'")
          .toArray().length
      ) {
        ctx.storage.sql.exec(uploadsSql);
        ctx.storage.sql.exec(
          "INSERT INTO schema_migrations VALUES (?,?)",
          "0003_uploads.sql",
          Date.now(),
        );
      }
      if (
        !ctx.storage.sql
          .exec(
            "SELECT 1 FROM schema_migrations WHERE name='0004_image_links.sql'",
          )
          .toArray().length
      ) {
        ctx.storage.sql.exec(imageLinksSql);
        ctx.storage.sql.exec(
          "INSERT INTO schema_migrations VALUES (?,?)",
          "0004_image_links.sql",
          Date.now(),
        );
      }
      if (
        !ctx.storage.sql
          .exec(
            "SELECT 1 FROM schema_migrations WHERE name='0005_object_storage.sql'",
          )
          .toArray().length
      ) {
        ctx.storage.sql.exec(objectStorageSql);
        ctx.storage.sql.exec(
          "INSERT INTO schema_migrations VALUES (?,?)",
          "0005_object_storage.sql",
          Date.now(),
        );
      }
      ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS media_chunks (key TEXT NOT NULL, position INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(key,position))",
      );
    });
    this.database = drizzle(ctx.storage, { schema });
  }
  async fetch(request: Request) {
    return workerContext.run(
      { env: this.env, storage: this.ctx.storage, database: this.database },
      () =>
        handle(
          request,
          this.env as unknown as Parameters<typeof handle>[1],
          this.ctx as unknown as Parameters<typeof handle>[2],
        ),
    );
  }
}
export default {
  async fetch(request: Request, env: WorkerEnvironment) {
    const url = new URL(request.url);
    const aliases = (env.REDIRECT_HOSTS || "")
      .split(",")
      .map((host) => host.trim().toLowerCase());
    const target = new URL(env.SITE_URL);
    if (
      aliases.includes(url.hostname) ||
      (url.hostname === target.hostname &&
        url.protocol === "http:" &&
        target.protocol === "https:")
    ) {
      if (target.origin !== url.origin) {
        target.pathname = url.pathname;
        target.search = url.search;
        if (!["GET", "HEAD"].includes(request.method))
          return new Response(
            JSON.stringify({
              error: "站点地址已更新，请从新地址重新登录",
              redirect: target.href,
            }),
            {
              status: 409,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              },
            },
          );
        return new Response(null, {
          status: 308,
          headers: {
            Location: target.href,
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
    }
    if (
      url.pathname.startsWith("/_astro/") ||
      url.pathname.startsWith("/audio-codec/") ||
      url.pathname === "/favicon.svg" ||
      url.pathname === "/music-placeholder.webp" ||
      url.pathname.startsWith("/stickers/") ||
      [
        "/licenses/heic-to.txt",
        "/licenses/mp4box.txt",
        "/licenses/ffmpeg.txt",
        "/licenses/GPL-3.0.txt",
      ].includes(url.pathname)
    )
      return env.ASSETS.fetch(
        request as unknown as Parameters<
          WorkerEnvironment["ASSETS"]["fetch"]
        >[0],
      );
    if (request.body) {
      const limit =
        url.pathname === "/api/media" || url.pathname.startsWith("/api/media/")
          ? 10 * 1024 * 1024
          : 256000;
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          return new Response(JSON.stringify({ error: "请求内容过大" }), {
            status: 413,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          });
        }
        chunks.push(value);
      }
      request = new Request(request, {
        body: new Uint8Array(Buffer.concat(chunks)),
      });
    }
    return env.SITE.get(env.SITE.idFromName("single-owner-site")).fetch(
      request as unknown as Parameters<WorkerEnvironment["ASSETS"]["fetch"]>[0],
    );
  },
};
