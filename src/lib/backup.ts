import {
  mkdtempSync,
  copyFileSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import archiver from "archiver";
import Database from "better-sqlite3";
import { db, sqlite } from "./db";
import { posts, media, owner, settings, categories } from "./db/schema";
import { mediaPath } from "./media/service";
import { mediaObjects } from "./db/schema";
import { streamMedia } from "./storage/media";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
export async function exportBackup(): Promise<
  Uint8Array | ReadableStream<Uint8Array>
> {
  const folder = mkdtempSync(path.join(tmpdir(), "shuxin-export-"));
  let streaming = false;
  try {
    // SQLite serializes the database synchronously while all application writes are blocked.
    sqlite
      .transaction(() => {
        writeFileSync(path.join(folder, "shuxin.sqlite"), sqlite.serialize(), {
          mode: 0o600,
        });
        const snapshot = {
          format: "shuxin-v1",
          version: 1,
          exportedAt: new Date().toISOString(),
          owner: db
            .select({
              username: owner.username,
              displayName: owner.displayName,
              bio: owner.bio,
              avatarId: owner.avatarId,
            })
            .from(owner)
            .get(),
          settings: db
            .select()
            .from(settings)
            .all()
            .filter((row) => row.key !== "mediaStoreId"),
          posts: db.select().from(posts).all(),
          categories: db.select().from(categories).all(),
          media: db.select().from(media).all(),
        };
        writeFileSync(
          path.join(folder, "content.json"),
          JSON.stringify(snapshot, null, 2),
          { mode: 0o600 },
        );
        const remoteKeys = new Set(
          db
            .select()
            .from(mediaObjects)
            .all()
            .map((row) => row.key),
        );
        for (const m of snapshot.media)
          if (!remoteKeys.has(m.key))
            copyFileSync(mediaPath(m.key), path.join(folder, m.key));
        writeFileSync(
          path.join(folder, "remote.json"),
          JSON.stringify(db.select().from(mediaObjects).all()),
          { mode: 0o600 },
        );
      })
      .immediate();
    for (const row of JSON.parse(
      readFileSync(path.join(folder, "remote.json"), "utf8"),
    )) {
      const stream = await streamMedia(row.key, 0, row.size - 1);
      await pipeline(
        Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(path.join(folder, row.key), {
          mode: 0o600,
          flags: "wx",
        }),
      );
    }
    // Export authentication hashes for disaster recovery, but never active sessions or login limits.
    const snapshotDb = new Database(path.join(folder, "shuxin.sqlite"));
    try {
      snapshotDb.exec(
        "DELETE FROM sessions; DELETE FROM login_limits; DELETE FROM uploads; DELETE FROM media_objects; DELETE FROM object_stores; DELETE FROM settings WHERE key='mediaStoreId';",
      );
      snapshotDb.pragma("journal_mode = DELETE");
    } finally {
      snapshotDb.close();
    }
    const zip = archiver("zip", { zlib: { level: 6 } });
    const output = new PassThrough();
    const cleanup = () => rmSync(folder, { recursive: true, force: true });
    output.once("end", cleanup);
    output.once("close", () => {
      zip.abort();
      cleanup();
    });
    zip.on("error", (error) => output.destroy(error));
    zip.on("warning", (error) => output.destroy(error));
    zip.pipe(output);
    zip.file(path.join(folder, "shuxin.sqlite"), { name: "shuxin.sqlite" });
    zip.file(path.join(folder, "content.json"), { name: "content.json" });
    const content = JSON.parse(
      readFileSync(path.join(folder, "content.json"), "utf8"),
    );
    for (const m of content.media)
      zip.file(path.join(folder, m.key), { name: `media/${m.key}` });
    streaming = true;
    void zip.finalize().catch((error) => output.destroy(error));
    return Readable.toWeb(output) as ReadableStream<Uint8Array>;
  } finally {
    if (!streaming) rmSync(folder, { recursive: true, force: true });
  }
}
