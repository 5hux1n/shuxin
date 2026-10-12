import { eq } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { media } from "../../../../lib/db/schema";
import { fileName } from "../../../../lib/downloads";
import { z } from "zod";
import { guard } from "../../../../lib/auth";
import { endpoint, json, HttpError } from "../../../../lib/http";
import {
  appendChunk,
  cancelUpload,
  completeUpload,
} from "../../../../lib/media/uploads";
import { promoteMedia } from "../../../../lib/storage/media";
import { readUpload } from "../../../../lib/media/request";
export const PUT = endpoint(async (ctx) => {
  guard(ctx);
  const id = z.uuid().parse(ctx.params.id);
  return json(
    appendChunk(
      id,
      Number(ctx.request.headers.get("X-Upload-Offset")),
      await readUpload(ctx.request),
    ),
  );
});
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  const raw = ctx.request.headers.get("X-File-Name");
  let filename: string | undefined;
  if (raw) {
    try {
      filename = z.string().min(1).max(255).parse(decodeURIComponent(raw));
    } catch {
      throw new HttpError(400, "文件名无效");
    }
  }
  const result = await completeUpload(z.uuid().parse(ctx.params.id), filename);
  if (filename) db.update(media).set({ alt: fileName(filename) }).where(eq(media.id, result.id)).run();
  await promoteMedia(result.id);
  return json(result, 201);
});
export const DELETE = endpoint((ctx) => {
  guard(ctx);
  cancelUpload(z.uuid().parse(ctx.params.id));
  return json({ message: "已取消上传" });
});
