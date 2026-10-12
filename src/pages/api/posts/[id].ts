import { guard } from "../../../lib/auth";
import { endpoint, json, body } from "../../../lib/http";
import { savePost, deletePost } from "../../../lib/posts/service";
export const PATCH = endpoint(async (ctx) => {
  guard(ctx);
  return json({
    post: await savePost(await body(ctx.request), ctx.params.id!),
    redirect: "/admin",
  });
});
export const DELETE = endpoint(async (ctx) => {
  guard(ctx, true);
  await deletePost(ctx.params.id!);
  return json({ redirect: "/admin" });
});
