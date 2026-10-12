import { and, desc, eq, inArray, lt, or, notInArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { media, mediaObjects, owner } from "../db/schema";
import { siteSettings } from "../posts/repo";
import { HttpError } from "../http";
import { mediaSize, removeFile } from "../storage/media";
import { mediaReferenceCounts } from "./references";
export function mediaKind(mime: string) {
  return mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "file";
}
function protectedIds() {
  const site = siteSettings();
  return [site.logoId, site.backgroundId, db.select().from(owner).get()?.avatarId].filter(Boolean);
}
export function libraryPage(cursor?: { time: number; id: string }) {
  const rows = db.select().from(media).where(and(notInArray(media.id, db.select({ id: media.liveId }).from(media).where(isNotNull(media.liveId))), cursor ? or(lt(media.createdAt, cursor.time), and(eq(media.createdAt, cursor.time), lt(media.id, cursor.id))) : undefined))
    .orderBy(desc(media.createdAt), desc(media.id)).limit(61).all();
  const protectedMedia = protectedIds();
  const references = mediaReferenceCounts();
  const items = rows.slice(0, 60).map(row => ({
    id: row.id, kind: mediaKind(row.mime), mime: row.mime, title: row.alt || row.id,
    size: mediaSize(row.key), url: `/media/${row.id}`, liveId: row.liveId,
    postId: row.postId, referenceCount: references.get(row.id) || 0, protected: protectedMedia.includes(row.id),
    storage: db.select().from(mediaObjects).where(eq(mediaObjects.key, row.key)).get() ? "OSS" : "本地",
  }));
  const last = rows[59];
  return { items, cursor: rows.length > 60 && last ? { time: last.createdAt, id: last.id } : null };
}
export async function deleteLibraryMedia(ids: string[]) {
  const protectedMedia = protectedIds();
  const selected = db.select().from(media).where(inArray(media.id, ids)).all();
  if (selected.some(row => protectedMedia.includes(row.id))) throw new HttpError(409, "请先在设置中更换正在使用的头像、Logo 或背景");
  const rows = new Map(selected.map(row => [row.id, row]));
  for (const row of selected) {
    if (row.liveId) {
      const video = db.select().from(media).where(eq(media.id, row.liveId)).get();
      if (video) rows.set(video.id, video);
    }
    const cover = db.select().from(media).where(eq(media.liveId, row.id)).get();
    if (cover) rows.set(cover.id, cover);
  }
  let deleted = 0, failed = 0;
  // Keep the record when remote deletion fails so the owner can retry explicitly.
  for (const row of rows.values()) {
    if (!(await removeFile(row.key))) { failed++; continue; }
    db.update(media).set({ liveId: null }).where(eq(media.liveId, row.id)).run();
    db.delete(media).where(eq(media.id, row.id)).run();
    deleted++;
  }
  return { message: `已删除 ${deleted} 个文件${failed ? `，${failed} 个未删除，请稍后重试` : ""}`, deleted, failed };
}
