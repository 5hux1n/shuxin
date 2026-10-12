import { eq, notInArray } from "drizzle-orm";
import { db } from "../db";
import { media, mediaObjects } from "../db/schema";
import * as builtin from "../media/service";
import { activeStoreId, getStore } from "./config";
import { ObjectClient } from "./client";
import { HttpError } from "../http";
export function mediaSize(key: string) {
  return (
    db.select().from(mediaObjects).where(eq(mediaObjects.key, key)).get()
      ?.size ?? builtin.mediaSize(key)
  );
}
export async function streamMedia(key: string, start: number, end: number) {
  const object = db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.key, key))
    .get();
  if (!object) return builtin.streamMedia(key, start, end);
  return (
    await new ObjectClient(getStore(object.storeId)).get(
      object.objectKey,
      start,
      end,
    )
  ).body!;
}
export async function removeFile(key: string) {
  const object = db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.key, key))
    .get();
  if (object) {
    try {
      await new ObjectClient(getStore(object.storeId)).delete(object.objectKey);
      db.delete(mediaObjects).where(eq(mediaObjects.key, key)).run();
    } catch {
      console.error("[shuxin] remote media cleanup queued");
      return false;
    }
  }
  builtin.removeFile(key);
  return true;
}
export async function cleanupOrphans() {
  const rows = db
    .select()
    .from(mediaObjects)
    .where(
      notInArray(mediaObjects.key, db.select({ key: media.key }).from(media)),
    )
    .limit(50)
    .all();
  let failed = 0;
  for (const row of rows) if (!(await removeFile(row.key))) failed++;
  return { attempted: rows.length, failed };
}
export async function promoteMedia(id: string) {
  const storeId = activeStoreId();
  if (!storeId) return;
  const row = db.select().from(media).where(eq(media.id, id)).get();
  if (!row) throw new HttpError(404, "媒体不存在");
  if (db.select().from(mediaObjects).where(eq(mediaObjects.key, row.key)).get())
    return;
  const client = new ObjectClient(getStore(storeId)),
    objectKey = client.key(row.key),
    size = builtin.mediaSize(row.key);
  try {
    await client.put(
      objectKey,
      size,
      (start, length) => builtin.mediaRange(row.key, start, length),
      row.mime,
    );
    db.insert(mediaObjects)
      .values({ key: row.key, storeId, objectKey, size })
      .run();
  } catch (error) {
    // Preserve a retryable record if deletion fails after an uncertain remote write.
    try {
      await client.delete(objectKey);
    } catch {
      db.insert(mediaObjects)
        .values({ key: row.key, storeId, objectKey, size })
        .onConflictDoNothing()
        .run();
    }
    db.delete(media).where(eq(media.id, id)).run();
    builtin.removeFile(row.key);
    throw error;
  }
  builtin.removeFile(row.key);
}
