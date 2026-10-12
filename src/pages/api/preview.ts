import { z } from "zod";
import { guard } from "../../lib/auth";
import { endpoint, body, json } from "../../lib/http";
import { renderMarkdown } from "../../lib/markdown";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  const input = z
    .object({ body: z.string().max(100_000) })
    .parse(await body(ctx.request));
  return json({ html: renderMarkdown(input.body) });
});
