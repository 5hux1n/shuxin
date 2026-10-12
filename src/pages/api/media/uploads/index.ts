import { z } from "zod";
import { guard, rateLimit } from "../../../../lib/auth";
import { body, endpoint, json } from "../../../../lib/http";
import { beginUpload } from "../../../../lib/media/uploads";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  rateLimit("media-upload-start", 30);
  const data = z
    .object({
      kind: z.enum(["audio", "video", "file"]),
      size: z.number().int().positive(),
    })
    .parse(await body(ctx.request));
  return json(beginUpload(data.kind, data.size), 201);
});
