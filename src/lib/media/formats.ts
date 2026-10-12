import { createFile, MP4BoxBuffer } from "mp4box";
import { HttpError } from "../http";
import { config } from "../config";
export function animatedGif(bytes: Buffer) {
  if (!/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) return null;
  let pos = 13;
  let frames = 0;
  if (bytes.length < pos) throw new HttpError(400, "GIF 文件不完整");
  const width = bytes.readUInt16LE(6),
    height = bytes.readUInt16LE(8);
  if (!width || !height || width * height > config.maxPixels)
    throw new HttpError(400, "GIF 尺寸过大");
  if (bytes[10] & 128) pos += 3 * 2 ** ((bytes[10] & 7) + 1);
  const parts = [bytes.subarray(0, pos)];
  const blocks = () => {
    while (true) {
      if (pos >= bytes.length) throw new HttpError(400, "GIF 文件不完整");
      const n = bytes[pos++];
      if (!n) break;
      pos += n;
      if (pos > bytes.length) throw new HttpError(400, "GIF 文件不完整");
    }
  };
  while (pos < bytes.length) {
    const start = pos;
    const type = bytes[pos++];
    if (type === 0x3b) {
      if (!frames) throw new HttpError(400, "GIF 没有画面");
      parts.push(Buffer.from([0x3b]));
      return { bytes: Buffer.concat(parts), width, height };
    }
    if (type === 0x2c) {
      if (pos + 9 > bytes.length) throw new HttpError(400, "GIF 文件不完整");
      const left = bytes.readUInt16LE(pos),
        top = bytes.readUInt16LE(pos + 2);
      const w = bytes.readUInt16LE(pos + 4),
        h = bytes.readUInt16LE(pos + 6);
      if (!w || !h || left + w > width || top + h > height || ++frames > 500)
        throw new HttpError(400, "GIF 画面无效或帧数过多");
      const packed = bytes[pos + 8];
      pos += 9;
      if (packed & 128) pos += 3 * 2 ** ((packed & 7) + 1);
      const minCodeSize = bytes[pos++];
      if (minCodeSize < 2 || minCodeSize > 8)
        throw new HttpError(400, "GIF 编码无效");
      blocks();
      parts.push(bytes.subarray(start, pos));
    } else if (type === 0x21) {
      const extension = bytes[pos++];
      const application = bytes.subarray(pos + 1, pos + 12).toString();
      blocks();
      if (
        extension === 0xf9 ||
        (extension === 0xff && application === "NETSCAPE2.0")
      )
        parts.push(bytes.subarray(start, pos));
    } else throw new HttpError(400, "GIF 文件结构无效");
  }
  throw new HttpError(400, "GIF 文件不完整");
}
export function liveVideo(bytes: Buffer) {
  const clean = Buffer.from(bytes);
  let count = 0,
    hasFtyp = false,
    hasMoov = false,
    hasData = false;
  const containers = new Set([
    "moov",
    "trak",
    "mdia",
    "minf",
    "stbl",
    "edts",
    "dinf",
  ]);
  function scan(start: number, end: number, depth = 0) {
    if (depth > 8) throw new Error("depth");
    for (let p = start; p < end;) {
      if (++count > 10000 || p + 8 > end) throw new Error("boxes");
      let size = clean.readUInt32BE(p),
        header = 8;
      const type = clean.toString("ascii", p + 4, p + 8);
      if (size === 1) {
        if (p + 16 > end) throw new Error("size");
        size = Number(clean.readBigUInt64BE(p + 8));
        header = 16;
      }
      if (size === 0) size = end - p;
      if (!Number.isSafeInteger(size) || size < header || p + size > end)
        throw new Error("size");
      if (depth === 0) {
        if (type === "ftyp") hasFtyp = true;
        if (type === "moov") hasMoov = true;
        if (type === "mdat" && size > header) hasData = true;
      }
      if (["udta", "meta", "uuid"].includes(type)) {
        clean.write("free", p + 4, 4, "ascii");
        clean.fill(0, p + header, p + size);
      } else if (containers.has(type)) scan(p + header, p + size, depth + 1);
      else if (
        ["stsz", "stts", "stsc", "stco", "co64", "ctts", "stss"].includes(type)
      ) {
        const offset = p + header + (type === "stsz" ? 8 : 4);
        if (offset + 4 > p + size || clean.readUInt32BE(offset) > 10000)
          throw new Error("samples");
      }
      p += size;
    }
  }
  try {
    if (!clean.length || clean.length > config.maxUpload)
      throw new Error("length");
    scan(0, clean.length);
    if (!hasFtyp || !hasMoov || !hasData) throw new Error("container");
    const file = createFile(false);
    file.onError = () => {
      throw new Error("parser");
    };
    file.appendBuffer(
      MP4BoxBuffer.fromArrayBuffer(new Uint8Array(clean).buffer, 0),
    );
    file.flush();
    const info = file.getInfo();
    const track = info.videoTracks[0];
    const duration = info.duration / info.timescale;
    if (
      info.isFragmented ||
      info.videoTracks.length !== 1 ||
      !track ||
      !/^(avc1|hvc1|hev1)/.test(track.codec) ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 15 ||
      !track.video ||
      !track.video.width ||
      !track.video.height ||
      track.video.width * track.video.height > config.maxPixels
    )
      throw new Error("video");
    return {
      bytes: clean,
      width: track.video.width,
      height: track.video.height,
      mime: "video/mp4",
      extension: "mp4",
    };
  } catch {
    throw new HttpError(
      400,
      "请选择有效的 MOV / MP4 动态片段（H.264 或 HEVC，最长 15 秒、最大 10 MB）",
    );
  }
}
