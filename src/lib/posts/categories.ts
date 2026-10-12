import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, sqlite } from "../db";
import { categories } from "../db/schema";
import { HttpError } from "../http";

export const categoryInput = z.object({
  name: z.string().trim().min(1, "请填写分类名称").max(40, "分类名称不能超过 40 字")
    .refine((value) => Array.from(value).every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127), "分类名称不能包含控制字符"),
});
export function listCategories() {
  return db.select().from(categories).orderBy(asc(categories.createdAt), asc(categories.id)).all();
}
export function getCategory(id: string | null) {
  return id ? db.select().from(categories).where(eq(categories.id, id)).get() : undefined;
}
export function saveCategory(input: unknown, id?: string) {
  const { name } = categoryInput.parse(input);
  const categoryId = id ? z.uuid().parse(id) : randomUUID();
  sqlite.transaction(() => {
    if (id && !getCategory(id)) throw new HttpError(404, "分类不存在，请刷新页面");
    const duplicate = db.select().from(categories).where(eq(categories.name, name)).get();
    if (duplicate && duplicate.id !== categoryId) throw new HttpError(409, "已有同名分类");
    if (id) db.update(categories).set({ name }).where(eq(categories.id, id)).run();
    else db.insert(categories).values({ id: categoryId, name, createdAt: Date.now() }).run();
  }).immediate();
  return getCategory(categoryId)!;
}
export function deleteCategory(id: string) {
  z.uuid().parse(id);
  if (!getCategory(id)) throw new HttpError(404, "分类不存在，请刷新页面");
  db.delete(categories).where(eq(categories.id, id)).run();
}
