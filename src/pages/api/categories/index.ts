import { guard } from "../../../lib/auth";
import { body, endpoint, json } from "../../../lib/http";
import { listCategories, saveCategory } from "../../../lib/posts/categories";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  const category = saveCategory(await body(ctx.request));
  return json({ category, categories: listCategories() }, 201);
});
