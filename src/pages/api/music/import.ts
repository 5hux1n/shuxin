import { z } from "zod";
import { guard, rateLimit } from "../../../lib/auth";
import { body, endpoint, json, HttpError } from "../../../lib/http";
import { importMusic } from "../../../lib/music/import";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  rateLimit("music-import:" + ctx.locals.owner!.id, 10);
  const input = z
    .object({ source: z.string().trim().min(1).max(100000) })
    .parse(await body(ctx.request));
  try {
    return json(await importMusic(input.source));
  } catch (error) {
    if (error instanceof HttpError || error instanceof z.ZodError) throw error;
    throw new HttpError(502, "音乐平台暂时无法响应，请稍后重试");
  }
});
