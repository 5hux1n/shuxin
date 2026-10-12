import { accessibleMedia } from "../../lib/media/service";
import { mediaSize, streamMedia } from "../../lib/storage/media";
import { fileName } from "../../lib/downloads";
import { endpoint } from "../../lib/http";
export const GET = endpoint(async (ctx) => {
  const image = accessibleMedia(ctx.params.id!, Boolean(ctx.locals.owner));
  if (!image) return new Response("媒体不存在", { status: 404 });
  const size = mediaSize(image.key);
  const headers = new Headers({
    "Content-Type": image.mime,
    "Cache-Control": "private, no-store",
    "Content-Disposition":
      image.mime === "application/octet-stream"
        ? `attachment; filename="download.bin"; filename*=UTF-8''${encodeURIComponent(fileName(image.alt)).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
        : "inline",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
    "Accept-Ranges": "bytes",
  });
  const range = ctx.request.headers.get("range");
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
    return new Response(await streamMedia(image.key, start, end), {
      status: 206,
      headers,
    });
  }
  headers.set("Content-Length", String(size));
  return new Response(await streamMedia(image.key, 0, size - 1), { headers });
});
