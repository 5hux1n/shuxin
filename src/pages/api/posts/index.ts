import { guard } from "../../../lib/auth";
import { endpoint, json, body } from "../../../lib/http";
import { savePost } from "../../../lib/posts/service";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  const post = await savePost(await body(ctx.request));
  return json({ post, redirect: "/admin" }, 201);
});
