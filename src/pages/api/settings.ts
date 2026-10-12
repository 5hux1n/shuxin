import { z } from "zod";
import { backgroundUrl } from "../../lib/background";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../../lib/db";
import { settings, media, owner } from "../../lib/db/schema";
import { guard } from "../../lib/auth";
import { body, endpoint, json, HttpError } from "../../lib/http";
import { siteSettings } from "../../lib/posts/repo";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  const input = z
    .object({
      title: z.string().trim().max(80).optional(),
      description: z.string().max(300).optional(),
      theme: z.enum(["system", "light", "dark"]).optional(),
      logoId: z.uuid().nullable().optional(),
      logoText: z.string().trim().max(80).optional(),
      backgroundId: z.uuid().nullable().optional(),
      backgroundMode: z.enum(["upload", "image", "api", "bing"]).optional(),
      backgroundUrl: z
        .string()
        .trim()
        .max(2048)
        .refine(
          (value) => !value || Boolean(backgroundUrl(value)),
          "请填写公网 HTTPS 图片或 API 地址",
        )
        .optional(),
      backgroundApiType: z.enum(["image", "json"]).optional(),
      backgroundApiField: z
        .string()
        .trim()
        .max(120)
        .refine(
          (value) =>
            !value || /^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$/.test(value),
          "请使用点分隔的 JSON 字段，例如 images.0.url",
        )
        .transform((value) => value || "url")
        .optional(),
      backgroundOpacity: z.coerce.number().min(0).max(100).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, "缺少设置内容")
    .parse(await body(ctx.request));
  sqlite
    .transaction(() => {
      const site = siteSettings(),
        avatar = db.select().from(owner).get()?.avatarId;
      const mode = input.backgroundMode ?? site.backgroundMode;
      if (
        ["image", "api"].includes(mode) &&
        !(input.backgroundUrl ?? site.backgroundUrl)
      )
        throw new HttpError(400, "请填写背景图片或 API 地址");
      if (
        !(input.logoId === undefined ? site.logoId : input.logoId) &&
        !(input.logoText === undefined ? site.logoText : input.logoText).trim()
      )
        throw new HttpError(400, "请至少设置图片 Logo 或文字 Logo 中的一项");
      for (const field of ["logoId", "backgroundId"] as const) {
        const id = input[field];
        if (id) {
          const image = db.select().from(media).where(eq(media.id, id)).get();
          const other =
            field === "logoId"
              ? (input.backgroundId ?? site.backgroundId)
              : (input.logoId ?? site.logoId);
          if (
            !image ||
            image.postId ||
            image.liveId ||
            !image.mime.startsWith("image/") ||
            id === avatar ||
            id === other
          )
            throw new HttpError(400, "图片已用于其他内容，请重新上传");
        }
      }
      for (const [key, value] of Object.entries(input))
        if (value !== undefined) {
          const saved = value === null ? "" : String(value);
          db.insert(settings)
            .values({ key, value: saved })
            .onConflictDoUpdate({ target: settings.key, set: { value: saved } })
            .run();
        }
    })
    .immediate();
  const site = siteSettings();
  return json({
    message: "设置已保存",
    background: site,
    branding: {
      title: site.title,
      browserTitle: site.browserTitle,
      logoId: site.logoId,
      logoText: site.logoText,
    },
  });
});
