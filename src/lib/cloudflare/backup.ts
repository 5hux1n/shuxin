import { zipSync, strToU8 } from "fflate";
import { db } from "../db";
import { owner, posts, media, settings, categories } from "../db/schema";
import { workerRuntime } from "../runtime";
import { mediaSize, streamMedia } from "../storage/media";
import { HttpError } from "../http";
import initialSql from "../../../drizzle/0001_initial.sql?raw";
import objectStorageSql from "../../../drizzle/0005_object_storage.sql?raw";
import imageLinksSql from "../../../drizzle/0004_image_links.sql?raw";
import uploadsSql from "../../../drizzle/0003_uploads.sql?raw";
import liveSql from "../../../drizzle/0002_live_media.sql?raw";
import postDetailsSql from "../../../drizzle/0006_post_details.sql?raw";
function literal(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}
export async function exportBackup() {
  const snapshotData = workerRuntime().storage.transactionSync(() => {
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
    let sql =
      initialSql +
      liveSql +
      uploadsSql +
      imageLinksSql +
      objectStorageSql +
      postDetailsSql +
      "\nCREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);\nINSERT INTO schema_migrations VALUES ('0001_initial.sql', " +
      Date.now() +
      ");\nINSERT INTO schema_migrations VALUES ('0002_live_media.sql', " +
      Date.now() +
      ");\nINSERT INTO schema_migrations VALUES ('0003_uploads.sql', " +
      Date.now() +
      ");\nINSERT INTO schema_migrations VALUES ('0004_image_links.sql', " +
      Date.now() +
      ");\nINSERT INTO schema_migrations VALUES ('0005_object_storage.sql', " +
      Date.now() +
      ");\nINSERT INTO schema_migrations VALUES ('0006_post_details.sql', " +
      Date.now() +
      ");\nDELETE FROM settings;\n";
    for (const table of ["owner", "categories", "posts", "media", "settings"])
      for (const row of workerRuntime()
        .storage.sql.exec(`SELECT * FROM ${table}`)
        .toArray())
        if (table !== "settings" || row.key !== "mediaStoreId")
          sql += `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.values(row).map(literal).join(",")});\n`;
    return {
      snapshot,
      sql,
      sizes: snapshot.media.map((m) => mediaSize(m.key)),
    };
  });
  const { snapshot, sql, sizes } = snapshotData;
  const files: Record<string, Uint8Array> = {
    "content.json": strToU8(JSON.stringify(snapshot, null, 2)),
    "database.sql": strToU8(sql),
  };
  if (sizes.reduce((sum, size) => sum + size, 0) > 24 * 1024 * 1024)
    throw new HttpError(
      413,
      "媒体总量超过 24 MB，请分别备份数据库和对象存储；完整 ZIP 可在 Node 版导出",
    );
  let total = 0;
  for (const [index, m] of snapshot.media.entries()) {
    const bytes = new Uint8Array(
      await new Response(
        await streamMedia(m.key, 0, sizes[index] - 1),
      ).arrayBuffer(),
    );
    total += bytes.length;
    if (total > 24 * 1024 * 1024)
      throw new HttpError(
        413,
        "媒体总量超过 24 MB，请分别备份数据库和对象存储；完整 ZIP 可在 Node 版导出",
      );
    files[`media/${m.key}`] = bytes;
  }
  return zipSync(files, { level: 0 });
}
