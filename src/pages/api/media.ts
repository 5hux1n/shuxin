import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { media } from "../../lib/db/schema";
import { fileName } from "../../lib/downloads";
import { guard } from "../../lib/auth";
import { endpoint, HttpError, json } from "../../lib/http";
import { upload } from "../../lib/media/service";
import { promoteMedia } from "../../lib/storage/media";
import { readUpload } from "../../lib/media/request";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  if (!ctx.request.headers.get("content-type")?.startsWith("image/"))
    throw new HttpError(415, "请选择图片");
  const raw = ctx.request.headers.get("X-File-Name");
  let name: string | undefined;
  if (raw) {
    try { name = fileName(z.string().min(1).max(255).parse(decodeURIComponent(raw))); }
    catch { throw new HttpError(400, "文件名无效"); }
  }
  const result = await upload(await readUpload(ctx.request));
  if (name) db.update(media).set({ alt: name }).where(eq(media.id, result.id)).run();
  await promoteMedia(result.id);
  return json(result, 201);
});
