import { publicMediaReference } from "../media/references";
import { animatedGif, liveVideo } from "../media/formats";
import { randomUUID } from "node:crypto";
import { PhotonImage, rotate, fliph, flipv } from "@cf-wasm/photon/workerd";
import { imageSize } from "image-size";
import { eq } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db";
import { media, owner } from "../db/schema";
import { getPost, readable, siteSettings } from "../posts/repo";
import { HttpError } from "../http";
import { workerRuntime } from "../runtime";
export function mediaPath(key: string) {
  if (
    !/^[a-f0-9-]{36}\.(?:webp|gif|mp4|mp3|m4a|wav|ogg|webm|aac|flac|wma|aiff|mov|mkv|mka|ogv|bin|upload)$/.test(
      key,
    )
  )
    throw new HttpError(400, "媒体路径无效");
  return key;
}
export function removeFile(key: string) {
  workerRuntime().storage.sql.exec(
    "DELETE FROM media_chunks WHERE key=?",
    mediaPath(key),
  );
}
export function readMedia(key: string) {
  const chunks = workerRuntime()
    .storage.sql.exec<{ bytes: ArrayBuffer }>(
      "SELECT bytes FROM media_chunks WHERE key=? ORDER BY position",
      mediaPath(key),
    )
    .toArray();
  if (!chunks.length) throw new HttpError(404, "图片不存在");
  return Buffer.concat(chunks.map((c) => Buffer.from(c.bytes)));
}
export async function upload(bytes: Buffer) {
  if (!bytes.length || bytes.length > config.maxUpload)
    throw new HttpError(413, "单张图片不能超过 10 MB");
  const gif = animatedGif(bytes);
  let encoded: Uint8Array;
  let width: number;
  let height: number;
  let image: PhotonImage | undefined;
  try {
    const info = imageSize(bytes);
    if (
      !["jpg", "png", "webp", "gif"].includes(info.type ?? "") ||
      !info.width ||
      !info.height ||
      info.width > 10000 ||
      info.height > 10000 ||
      info.width * info.height > config.maxPixels
    )
      throw new Error("limits");
    image = PhotonImage.new_from_byteslice(bytes);
    const orientation = info.orientation ?? 1;
    if ([2, 5, 7].includes(orientation)) fliph(image);
    if (orientation === 4) flipv(image);
    const angle = (
      { 3: 180, 5: 270, 6: 90, 7: 90, 8: 270 } as Record<number, number>
    )[orientation];
    if (angle) {
      const rotated = rotate(image, angle);
      image.free();
      image = rotated;
    }
    width = image.get_width();
    height = image.get_height();
    if (width * height > config.maxPixels) throw new Error("limits");
    encoded = image.get_bytes_webp();
    if (encoded.length > config.maxUpload) throw new Error("encoded size");
  } catch {
    throw new HttpError(
      400,
      "请选择有效的 JPG、PNG、WebP 或 GIF 图片，Workers 图片最多 800 万像素",
    );
  } finally {
    image?.free();
  }
  const id = randomUUID();
  if (gif) {
    encoded = gif.bytes;
    width = gif.width;
    height = gif.height;
  }
  return storeMedia(
    id,
    encoded,
    width,
    height,
    gif ? "image/gif" : "image/webp",
    gif ? "gif" : "webp",
  );
}
export function uploadLiveVideo(bytes: Buffer) {
  const video = liveVideo(bytes);
  return storeMedia(
    randomUUID(),
    video.bytes,
    video.width,
    video.height,
    video.mime,
    video.extension,
  );
}
function storeMedia(
  id: string,
  encoded: Uint8Array,
  width: number,
  height: number,
  mime: string,
  extension: string,
) {
  const key = `${id}.${extension}`;
  workerRuntime().storage.transactionSync(() => {
    db.insert(media)
      .values({
        id,
        key,
        mime,
        width,
        height,
        createdAt: Date.now(),
      })
      .run();
    for (
      let offset = 0, position = 0;
      offset < encoded.length;
      offset += 100_000, position++
    )
      workerRuntime().storage.sql.exec(
        "INSERT INTO media_chunks VALUES (?,?,?)",
        key,
        position,
        new Uint8Array(encoded.subarray(offset, offset + 100_000)).buffer,
      );
  });
  return { id, width, height, alt: "", url: `/media/${id}` };
}
export function accessibleMedia(id: string, authenticated: boolean) {
  const row = db.select().from(media).where(eq(media.id, id)).get();
  if (!row) return null;
  if (authenticated || db.select().from(owner).get()?.avatarId === id)
    return row;
  if ([siteSettings().logoId, siteSettings().backgroundId].includes(id))
    return row;
  if (publicMediaReference(id)) return row;
  if (!row.postId) return null;
  const post = getPost(row.postId);
  return post && readable(post, false) ? row : null;
}

export function mediaSize(key: string) {
  return workerRuntime()
    .storage.sql.exec<{ size: number }>(
      "SELECT COALESCE(SUM(length(bytes)),0) AS size FROM media_chunks WHERE key=?",
      mediaPath(key),
    )
    .toArray()[0].size;
}
export function mediaRange(key: string, start: number, length: number) {
  const chunks = workerRuntime()
    .storage.sql.exec<{ bytes: ArrayBuffer; position: number }>(
      "SELECT bytes,position FROM media_chunks WHERE key=? AND position>=? AND position<=? ORDER BY position",
      mediaPath(key),
      Math.floor(start / 100000),
      Math.floor((start + length - 1) / 100000),
    )
    .toArray();
  if (!chunks.length) return Buffer.alloc(0);
  return Buffer.concat(chunks.map((c) => Buffer.from(c.bytes))).subarray(
    start % 100000,
    (start % 100000) + length,
  );
}
export function streamMedia(key: string, start: number, end: number) {
  const storage = workerRuntime().storage;
  let offset = start;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset > end) {
        controller.close();
        return;
      }
      const row = storage.sql
        .exec<{ bytes: ArrayBuffer }>(
          "SELECT bytes FROM media_chunks WHERE key=? AND position=?",
          mediaPath(key),
          Math.floor(offset / 100000),
        )
        .toArray()[0];
      if (!row) {
        controller.error(new Error("Missing media chunk"));
        return;
      }
      const data = new Uint8Array(row.bytes).slice(
        offset % 100000,
        Math.min(100000, (offset % 100000) + end - offset + 1),
      );
      offset += data.length;
      controller.enqueue(data);
    },
  });
}
export function writeChunk(key: string, offset: number, bytes: Buffer) {
  for (let at = 0; at < bytes.length; at += 100000)
    workerRuntime().storage.sql.exec(
      "INSERT OR REPLACE INTO media_chunks VALUES (?,?,?)",
      mediaPath(key),
      (offset + at) / 100000,
      new Uint8Array(bytes.subarray(at, at + 100000)).buffer,
    );
}
export function renameMedia(from: string, to: string) {
  workerRuntime().storage.sql.exec(
    "UPDATE media_chunks SET key=? WHERE key=?",
    mediaPath(to),
    mediaPath(from),
  );
}
