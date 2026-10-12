import { publicMediaReference } from "./references";
import { animatedGif, liveVideo } from "./formats";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  openSync,
  closeSync,
  readSync,
  writeSync,
  renameSync,
  statSync,
  createReadStream,
} from "node:fs";
import { Readable } from "node:stream";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db";
import { media, owner } from "../db/schema";
import { getPost, readable, siteSettings } from "../posts/repo";
import { HttpError } from "../http";
export function mediaPath(key: string) {
  if (
    !/^[a-f0-9-]{36}\.(?:webp|gif|mp4|mp3|m4a|wav|ogg|webm|aac|flac|wma|aiff|mov|mkv|mka|ogv|bin|upload)$/.test(
      key,
    )
  )
    throw new HttpError(400, "媒体路径无效");
  return path.join(config.dataDir, "media", key);
}
export function removeFile(key: string) {
  try {
    unlinkSync(mediaPath(key));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT")
      console.error("[shuxin] media cleanup failed");
  }
}
export async function upload(bytes: Buffer) {
  if (bytes.length === 0 || bytes.length > config.maxUpload)
    throw new HttpError(413, "单张图片不能超过 10 MB");
  const gif = animatedGif(bytes);
  let encoded: Buffer;
  let width: number;
  let height: number;
  try {
    const image = sharp(bytes, {
      limitInputPixels: config.maxPixels,
      animated: false,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      !["jpeg", "png", "webp", "gif"].includes(metadata.format ?? "") ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 10000 ||
      metadata.height > 10000
    )
      throw new Error("format");
    const output = await image
      .rotate()
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    encoded = output.data;
    if (encoded.length > config.maxUpload) throw new Error("encoded size");
    width = output.info.width;
    height = output.info.height;
  } catch {
    throw new HttpError(
      400,
      "请选择有效的 JPG、PNG、WebP 或 GIF 图片，尺寸不超过 10000px / 3200 万像素",
    );
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
  encoded: Buffer,
  width: number,
  height: number,
  mime: string,
  extension: string,
) {
  const key = `${id}.${extension}`;
  writeFileSync(mediaPath(key), encoded, { mode: 0o600, flag: "wx" });
  try {
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
  } catch (e) {
    removeFile(key);
    throw e;
  }
  return { id, width, height, alt: "", url: `/media/${id}` };
}
export function accessibleMedia(id: string, authenticated: boolean) {
  const row = db.select().from(media).where(eq(media.id, id)).get();
  if (!row) return null;
  if (authenticated) return row;
  if (db.select().from(owner).get()?.avatarId === id) return row;
  if ([siteSettings().logoId, siteSettings().backgroundId].includes(id))
    return row;
  if (publicMediaReference(id)) return row;
  if (!row.postId) return null;
  const post = getPost(row.postId);
  return post && readable(post, false) ? row : null;
}

export function readMedia(key: string) {
  return readFileSync(mediaPath(key));
}

export function mediaSize(key: string) {
  return statSync(mediaPath(key)).size;
}
export function mediaRange(key: string, start: number, length: number) {
  const fd = openSync(mediaPath(key), "r");
  try {
    const bytes = Buffer.alloc(length);
    return bytes.subarray(0, readSync(fd, bytes, 0, length, start));
  } finally {
    closeSync(fd);
  }
}
export function streamMedia(key: string, start: number, end: number) {
  return Readable.toWeb(
    createReadStream(mediaPath(key), { start, end }),
  ) as ReadableStream<Uint8Array>;
}
export function writeChunk(key: string, offset: number, bytes: Buffer) {
  const fd = openSync(mediaPath(key), offset === 0 ? "w" : "r+", 0o600);
  try {
    writeSync(fd, bytes, 0, bytes.length, offset);
  } finally {
    closeSync(fd);
  }
}
export function renameMedia(from: string, to: string) {
  renameSync(mediaPath(from), mediaPath(to));
}
