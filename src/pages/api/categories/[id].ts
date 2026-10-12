import { guard } from "../../../lib/auth";
import { body, endpoint, json } from "../../../lib/http";
import { deleteCategory, listCategories, saveCategory } from "../../../lib/posts/categories";
export const PATCH = endpoint(async (ctx) => {
  guard(ctx);
  const category = saveCategory(await body(ctx.request), ctx.params.id!);
  return json({ category, categories: listCategories() });
});
export const DELETE = endpoint((ctx) => {
  guard(ctx);
  deleteCategory(ctx.params.id!);
  return json({ categories: listCategories() });
});
