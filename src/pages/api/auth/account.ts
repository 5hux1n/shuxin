import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../../../lib/db";
import { owner, sessions, media, settings } from "../../../lib/db/schema";
import { guard, verifyPassword, logout, rateLimit } from "../../../lib/auth";
import { endpoint, body, json, HttpError } from "../../../lib/http";
import { avatarLinkSchema } from "../../../lib/profile-link";
import { siteSettings } from "../../../lib/posts/repo";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  const data = z
    .object({
      username: z
        .string()
        .regex(/^[a-zA-Z0-9_.-]{3,40}$/, "登录名为 3–40 位字母、数字或 _.-")
        .optional(),
      displayName: z.string().trim().nonempty("请填写昵称").max(80).optional(),
      current: z.string().max(128).optional(),
      bio: z.string().max(500).optional(),
      avatarId: z.uuid().nullable().optional(),
      avatarLink: avatarLinkSchema.optional(),
    })
    .refine((value) => Object.keys(value).length > 0, "缺少资料内容")
    .parse(await body(ctx.request));
  const row = db.select().from(owner).get()!;
  const changed = data.username !== undefined && data.username !== row.username;
  if (changed) {
    rateLimit("account", 8);
    if (
      !data.current ||
      !(await verifyPassword(data.current, row.passwordHash))
    )
      throw new HttpError(403, "修改登录名需要填写正确的当前密码");
  }
  sqlite
    .transaction(() => {
      const latest = db.select().from(owner).get();
      if (
        latest?.passwordHash !== row.passwordHash ||
        latest.username !== row.username
      )
        throw new HttpError(409, "账号状态已变化，请重新登录");
      if (data.avatarId) {
        const image = db
          .select()
          .from(media)
          .where(eq(media.id, data.avatarId))
          .get();
        if (
          !image ||
          [siteSettings().logoId, siteSettings().backgroundId].includes(
            image.id,
          ) ||
          image.postId ||
          !image.mime.startsWith("image/") ||
          image.liveId
        )
          throw new HttpError(400, "头像图片无效");
      }
      if (data.username !== undefined || data.displayName !== undefined || data.bio !== undefined || data.avatarId !== undefined) {
      db.update(owner)
        .set({
          ...(data.username !== undefined ? { username: data.username } : {}),
          ...(data.displayName !== undefined
            ? { displayName: data.displayName }
            : {}),
          ...(data.bio !== undefined ? { bio: data.bio } : {}),
          ...(data.avatarId !== undefined ? { avatarId: data.avatarId } : {}),
        })
        .where(eq(owner.id, 1))
        .run();
      }
      if (data.avatarLink !== undefined) {
        db.insert(settings).values({ key: "owner_avatar_link", value: data.avatarLink })
          .onConflictDoUpdate({ target: settings.key, set: { value: data.avatarLink } }).run();
      }
      if (changed) db.delete(sessions).run();
    })
    .immediate();
  if (changed) {
    logout(ctx.cookies);
    return json({ redirect: "/admin/login" });
  }
  return json({ message: "用户资料已保存" });
});
