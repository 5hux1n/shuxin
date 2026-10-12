import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { getPost } from "../../../../lib/posts/repo";
import { posts } from "../../../../lib/db/schema";
import { guard } from "../../../../lib/auth";
import { body, endpoint, json, HttpError } from "../../../../lib/http";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  const data = z.object({ pinned: z.boolean() }).parse(await body(ctx.request));
  const existing = getPost(ctx.params.id!);
  if (!existing) throw new HttpError(404, "动态不存在");
  db.update(posts)
    .set({
      pinned: data.pinned,
      updatedAt: Math.max(Date.now(), existing.updatedAt + 1),
    })
    .where(eq(posts.id, ctx.params.id!))
    .run();
  return json({ message: "已保存" });
});
