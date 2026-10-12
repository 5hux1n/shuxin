import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config";
import * as schema from "./schema";
mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
mkdirSync(path.join(config.dataDir, "media"), { recursive: true, mode: 0o700 });
export const sqlite = new Database(path.join(config.dataDir, "shuxin.sqlite"));
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.exec(
  "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
);
// The SQL files are shipped with the server, and each migration commits atomically.
const migrations = [
  "0001_initial.sql",
  "0002_live_media.sql",
  "0003_uploads.sql",
  "0004_image_links.sql",
  "0005_object_storage.sql",
  "0006_post_details.sql",
];
sqlite
  .transaction(() => {
    for (const name of migrations) {
      if (
        sqlite.prepare("SELECT 1 FROM schema_migrations WHERE name=?").get(name)
      )
        continue;
      sqlite.exec(readFileSync(path.resolve("drizzle", name), "utf8"));
      sqlite
        .prepare("INSERT INTO schema_migrations VALUES (?,?)")
        .run(name, Date.now());
    }
  })
  .immediate();
export const db = drizzle(sqlite, { schema });
