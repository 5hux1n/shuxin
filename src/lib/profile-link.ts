import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./db/schema";
export const avatarLinkSchema = z.string().trim().max(2048).refine(value => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, "请填写完整的 HTTP 或 HTTPS 链接");
export function profileAvatarLink() {
  const row = db.select().from(settings).where(eq(settings.key, "owner_avatar_link")).get();
  const value = avatarLinkSchema.safeParse(row?.value ?? "");
  return value.success ? value.data : "";
}
