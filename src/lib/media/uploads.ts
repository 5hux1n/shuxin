import { randomUUID } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import {
  AbstractTokenizer,
  EndOfStreamError,
  type IReadChunkOptions,
} from "strtok3/core";
import { parseFromTokenizer, TrackType } from "music-metadata";
import { db, sqlite } from "../db";
import { uploads, media } from "../db/schema";
import { config } from "../config";
import { HttpError } from "../http";
import { mediaRange, writeChunk, removeFile, renameMedia } from "./service";
import { fileName } from "../downloads";
export const chunkSize = 4_000_000;
class StoredTokenizer extends AbstractTokenizer {
  fileInfo: { size: number; mimeType: string };
  constructor(
    private key: string,
    size: number,
    mimeType: string,
  ) {
    super();
    this.fileInfo = { size, mimeType };
  }
  async setPosition(position: number) {
    if (
      !Number.isSafeInteger(position) ||
      position < 0 ||
      position > this.fileInfo.size
    )
      throw new EndOfStreamError();
    this.position = position;
  }
  supportsRandomAccess() {
    return true;
  }
  async peekBuffer(buffer: Uint8Array, options?: IReadChunkOptions) {
    const opts = this.normalizeOptions(buffer, options);
    if (opts.length > 1_000_000 || opts.position < 0)
      throw new Error("Metadata block too large");
    const count = Math.max(
      0,
      Math.min(opts.length, this.fileInfo.size - opts.position),
    );
    if (count < opts.length && !opts.mayBeLess) throw new EndOfStreamError();
    const data = count
      ? mediaRange(this.key, opts.position, count)
      : Buffer.alloc(0);
    buffer.set(data);
    return data.length;
  }
  async readBuffer(buffer: Uint8Array, options?: IReadChunkOptions) {
    const count = await this.peekBuffer(buffer, options);
    this.position = (options?.position ?? this.position) + count;
    return count;
  }
}
export function beginUpload(kind: "audio" | "video" | "file", size: number) {
  if (size <= 0) throw new HttpError(400, "请选择非空文件");
  if (!Number.isSafeInteger(size) || size > config.maxMedia)
    throw new HttpError(
      413,
      `单个文件不能超过 ${config.maxMedia / 1024 / 1024} MB`,
    );
  const stale = db
    .select()
    .from(uploads)
    .where(lt(uploads.createdAt, Date.now() - 86400000))
    .all();
  for (const row of stale) {
    removeFile(`${row.id}.upload`);
    db.delete(uploads).where(eq(uploads.id, row.id)).run();
  }
  if (db.select().from(uploads).all().length >= 3)
    throw new HttpError(429, "已有上传正在进行，请先完成或取消");
  const id = randomUUID();
  db.insert(uploads).values({ id, kind, size, createdAt: Date.now() }).run();
  return { id, chunkSize, limit: config.maxMedia };
}
function pending(id: string) {
  const row = db.select().from(uploads).where(eq(uploads.id, id)).get();
  if (!row || row.createdAt < Date.now() - 86400000)
    throw new HttpError(404, "上传不存在或已过期，请重新选择文件");
  return row;
}
export function appendChunk(id: string, offset: number, bytes: Buffer) {
  return sqlite
    .transaction(() => {
      const row = pending(id);
      if (!Number.isSafeInteger(offset) || offset !== row.received)
        throw new HttpError(409, "上传进度不一致，请重新选择文件");
      if (bytes.length !== Math.min(chunkSize, row.size - offset))
        throw new HttpError(400, "上传分块大小不正确");
      writeChunk(`${id}.upload`, offset, bytes);
      db.update(uploads)
        .set({ received: offset + bytes.length })
        .where(eq(uploads.id, id))
        .run();
      return { received: offset + bytes.length };
    })
    .immediate();
}
export function cancelUpload(id: string) {
  const row = db.select().from(uploads).where(eq(uploads.id, id)).get();
  if (row) {
    removeFile(`${id}.upload`);
    db.delete(uploads).where(eq(uploads.id, id)).run();
  }
}
export async function completeUpload(id: string, filename?: string) {
  const row = pending(id);
  if (row.received !== row.size) throw new HttpError(409, "文件尚未上传完成");
  if (row.kind === "file") {
    const name = fileName(filename || "文件");
    sqlite
      .transaction(() => {
        const current = pending(id);
        if (current.received !== row.size)
          throw new HttpError(409, "上传发生变化");
        renameMedia(`${id}.upload`, `${id}.bin`);
        db.insert(media)
          .values({
            id,
            key: `${id}.bin`,
            mime: "application/octet-stream",
            width: 0,
            height: 0,
            alt: name,
            createdAt: Date.now(),
          })
          .run();
        db.delete(uploads).where(eq(uploads.id, id)).run();
      })
      .immediate();
    return { id, url: `/media/${id}`, filename: name, size: row.size };
  }
  const key = `${id}.upload`,
    head = mediaRange(key, 0, Math.min(64, row.size));
  let mime = "",
    extension = "";
  const four = head.subarray(0, 4).toString(),
    kind = row.kind;
  if (
    head
      .subarray(0, 16)
      .equals(
        Buffer.from([
          0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0, 0xaa,
          0, 0x62, 0xce, 0x6c,
        ]),
      )
  ) {
    mime = "audio/x-ms-wma";
    extension = "wma";
  } else if (four === "RIFF" && head.subarray(8, 12).toString() === "WAVE") {
    mime = "audio/wav";
    extension = "wav";
  } else if (four === "fLaC") {
    mime = "audio/flac";
    extension = "flac";
  } else if (
    four === "FORM" &&
    /^AIF[FC]$/.test(head.subarray(8, 12).toString())
  ) {
    mime = "audio/aiff";
    extension = "aiff";
  } else if (four === "OggS") {
    mime = `${kind}/ogg`;
    extension = kind === "video" ? "ogv" : "ogg";
  } else if (head.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) {
    mime = `${kind}/webm`;
    extension = head.includes(Buffer.from("matroska"))
      ? kind === "audio"
        ? "mka"
        : "mkv"
      : "webm";
    if (extension !== "webm") mime = `${kind}/x-matroska`;
  } else if (/^(ftyp|moov|wide|mdat)$/.test(head.subarray(4, 8).toString())) {
    mime = `${kind}/mp4`;
    extension =
      kind === "audio"
        ? "m4a"
        : head.subarray(8, 12).toString() === "qt  "
          ? "mov"
          : "mp4";
    if (extension === "mov") mime = "video/quicktime";
  } else if (head[0] === 255 && (head[1] & 246) === 240) {
    mime = "audio/aac";
    extension = "aac";
  } else if (
    head.subarray(0, 3).toString() === "ID3" ||
    (head[0] === 255 && (head[1] & 224) === 224)
  ) {
    mime = "audio/mpeg";
    extension = "mp3";
  }
  if (!mime || !mime.startsWith(`${kind}/`))
    throw new HttpError(400, "文件格式无效，请选择音频或视频文件");
  try {
    const metadata = await parseFromTokenizer(
      new StoredTokenizer(key, row.size, mime),
      { skipCovers: true, duration: false },
    );
    const video = metadata.format.trackInfo?.find(
      (track) => track.type === TrackType.video,
    );
    if (
      kind === "audio" &&
      (!(metadata.format.numberOfChannels || metadata.format.hasAudio) ||
        metadata.format.hasVideo ||
        video)
    )
      throw new Error("Not audio");
    if (kind === "video" && !(video || metadata.format.hasVideo))
      throw new Error("Not video");
    const width = video?.video?.pixelWidth ?? 0,
      height = video?.video?.pixelHeight ?? 0;
    sqlite
      .transaction(() => {
        const current = pending(id);
        if (current.received !== row.size)
          throw new HttpError(409, "上传发生变化");
        renameMedia(key, `${id}.${extension}`);
        db.insert(media)
          .values({
            id,
            key: `${id}.${extension}`,
            mime,
            width,
            height,
            createdAt: Date.now(),
          })
          .run();
        db.delete(uploads).where(eq(uploads.id, id)).run();
      })
      .immediate();
    return { id, url: `/media/${id}`, width, height };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "媒体文件无效，或所选类型与实际音视频轨道不一致");
  }
}
