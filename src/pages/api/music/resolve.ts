import { z } from "zod";
import { guard, rateLimit } from "../../../lib/auth";
import { body, endpoint, json, HttpError } from "../../../lib/http";
import { resolveMusic } from "../../../lib/music/resolve";
export const POST = endpoint(async (ctx) => {
  guard(ctx, false);
  rateLimit("music-resolve:" + ctx.cookies.get("shuxin_csrf")?.value, 30);
  const data = z
    .object({ url: z.string().max(2048) })
    .parse(await body(ctx.request));
  try {
    return json(await resolveMusic(data.url));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "音乐平台暂时无法响应，请稍后重试");
  }
});
