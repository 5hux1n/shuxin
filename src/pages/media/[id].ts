import { createHash } from "node:crypto";
import { previewImage, animatedWebp } from "../../lib/media/preview";
import { accessibleMedia } from "../../lib/media/service";
import { mediaSize, streamMedia, previewSource } from "../../lib/storage/media";
import { fileName } from "../../lib/downloads";
import { endpoint } from "../../lib/http";
export const GET = endpoint(async (ctx) => {
  const image = accessibleMedia(ctx.params.id!, Boolean(ctx.locals.owner), ctx.cookies);
  if (!image) return new Response("媒体不存在", { status: 404 });
  const requestedWidth = ctx.url.searchParams.get("w");
  if (requestedWidth !== null && !["108", "720", "1440"].includes(requestedWidth))
    return new Response("预览尺寸无效", { status: 400 });
  let preview: Buffer | undefined;
  if (requestedWidth && ["image/jpeg", "image/png", "image/webp"].includes(image.mime)) {
    const source = await previewSource(image.key);
    if (!animatedWebp(source)) preview = await previewImage(source, Number(requestedWidth));
  }
  const size = preview?.length ?? mediaSize(image.key);
  const headers = new Headers({
    "Content-Type": preview ? "image/webp" : image.mime,
    "Cache-Control": preview ? "private, no-cache, must-revalidate" : "private, no-store",
    "Content-Disposition":
      image.mime === "application/octet-stream"
        ? `attachment; filename="download.bin"; filename*=UTF-8''${encodeURIComponent(fileName(image.alt)).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
        : "inline",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
    "Accept-Ranges": "bytes",
  });
  const range = ctx.request.headers.get("range");
  if (preview) {
    const etag = '"' + createHash("sha256").update(preview).digest("hex") + '"';
    headers.set("ETag", etag);
    if (!range && ctx.request.headers.get("if-none-match")?.split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag || tag.trim() === "*"))
      return new Response(null, { status: 304, headers });
  }
  const body = async (start: number, end: number) => preview ? new Uint8Array(preview.subarray(start, end + 1)) : streamMedia(image.key, start, end);
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start: number,
      end = size - 1;
    if (match && match[1]) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), end);
    } else if (match && match[2] && Number(match[2]) > 0)
      start = Math.max(0, size - Number(match[2]));
    else start = -1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start > end ||
      start >= size
    ) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(await body(start, end), {
      status: 206,
      headers,
    });
  }
  headers.set("Content-Length", String(size));
  return new Response(await body(0, size - 1), { headers });
});
