import { guard } from "../../../lib/auth";
import { endpoint, json, body } from "../../../lib/http";
import { savePost } from "../../../lib/posts/service";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  const post = await savePost(await body(ctx.request, 1_000_000));
  const { passwordHash, ...safe } = post;
  return json({ post: { ...safe, passwordProtected: Boolean(passwordHash) }, redirect: "/admin", permalink: `/p/${post.id}` }, 201);
});
