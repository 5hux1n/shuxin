import { z } from "zod";
import { guard, rateLimit } from "../../../lib/auth";
import { body, endpoint, json, HttpError } from "../../../lib/http";
import { importPlaylist } from "../../../lib/music/playlist";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  rateLimit("playlist-import:" + ctx.locals.owner!.id, 10);
  const data = z
    .object({ source: z.string().min(1).max(100000) })
    .parse(await body(ctx.request));
  try {
    return json(await importPlaylist(data.source));
  } catch (e) {
    if (e instanceof HttpError || e instanceof z.ZodError) throw e;
    throw new HttpError(502, "歌单平台暂时无法响应，请稍后重试");
  }
});
