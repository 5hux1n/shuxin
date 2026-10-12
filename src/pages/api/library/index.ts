import { z } from "zod";
import { guard } from "../../../lib/auth";
import { endpoint, body, HttpError, json } from "../../../lib/http";
import { libraryPage, deleteLibraryMedia } from "../../../lib/media/library";
export const GET = endpoint(ctx => {
  if (!ctx.locals.owner) throw new HttpError(401, "请先登录");
  const value = ctx.url.searchParams.get("cursor");
  let cursor;
  if (value) {
    try { cursor = z.object({ time: z.number().int().nonnegative(), id: z.uuid() }).parse(JSON.parse(value)); }
    catch { throw new HttpError(400, "文件库分页无效"); }
  }
  return json(libraryPage(cursor));
});
export const POST = endpoint(async ctx => {
  guard(ctx);
  const data = z.object({ action: z.literal("delete"), ids: z.array(z.uuid()).min(1).max(60) }).parse(await body(ctx.request));
  return json(await deleteLibraryMedia(data.ids));
});
