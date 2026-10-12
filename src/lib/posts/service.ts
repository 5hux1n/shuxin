import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../db";
import { posts, media, owner, categories } from "../db/schema";
import { HttpError } from "../http";
import { getPost, siteSettings, postVideo } from "./repo";
import { fileName } from "../downloads";
import { markdownMediaIds } from "../media/references";
export const postInput = z
  .object({
    body: z.string().max(100_000, "正文不能超过 100000 字"),
    title: z.string().trim().max(120, "标题不能超过 120 字").optional(),
    categoryId: z.uuid().nullable().optional(),
    status: z.enum(["draft", "published"]),
    visibility: z.enum(["public", "unlisted", "private"]),
    pinned: z.boolean(),
    images: z
      .array(
        z.object({
          id: z.uuid(),
          alt: z.string().max(500),
          linkUrl: z
            .string()
            .max(2048)
            .optional()
            .refine((value) => {
              if (!value) return true;
              try {
                const url = new URL(value);
                return (
                  ["http:", "https:"].includes(url.protocol) &&
                  !url.username &&
                  !url.password
                );
              } catch {
                return false;
              }
            }, "图片链接必须为有效 HTTP / HTTPS 地址"),
        }),
      )
      .max(12, "最多添加 12 张图片"),
    audio: z
      .array(z.object({ id: z.uuid(), title: z.string().max(120) }))
      .max(3, "最多添加 3 个音频")
      .optional(),
    videos: z
      .array(z.object({ id: z.uuid(), title: z.string().max(120) }))
      .max(3, "最多添加 3 个视频")
      .optional(),
    files: z
      .array(z.object({ id: z.uuid(), title: z.string().min(1).max(255) }))
      .max(12, "最多添加 12 个文件")
      .optional(),
    updatedAt: z.number().int().optional(),
  })
  .refine(
    (v) =>
      v.body.trim().length > 0 ||
      v.images.length > 0 ||
      (v.audio?.length ?? 0) > 0 ||
      (v.videos?.length ?? 0) > 0 ||
      (v.files?.length ?? 0) > 0,
    {
      message: "请填写正文或添加媒体",
    },
  );
export async function savePost(input: unknown, id?: string) {
  const data = postInput.parse(input);
  let now = Date.now();
  const postId = id ?? randomUUID();
  sqlite
    .transaction(() => {
      const existing = id ? getPost(id) : null;
      if (existing) now = Math.max(now, existing.updatedAt + 1);
      if (id && !existing) throw new HttpError(404, "动态不存在");
      if (existing && data.updatedAt !== existing.updatedAt)
        throw new HttpError(409, "动态已在其他页面修改，请重新打开后编辑");
      const categoryId = data.categoryId === undefined ? existing?.categoryId ?? null : data.categoryId;
      if (categoryId && !db.select().from(categories).where(eq(categories.id, categoryId)).get())
        throw new HttpError(400, "所选分类已删除，请重新选择");
      if (new Set(data.images.map((i) => i.id)).size !== data.images.length)
        throw new HttpError(400, "图片不能重复");
      for (const id of markdownMediaIds(data.body)) {
        if (!db.select({ id: media.id }).from(media).where(eq(media.id, id)).get())
          throw new HttpError(400, "正文引用的文件已删除，请移除失效链接后再保存");
      }
      const retained = new Set<string>();
      const live = new Map<string, string>();
      const logo = siteSettings().logoId;
      const avatar = db.select().from(owner).get()?.avatarId;
      for (const image of data.images) {
        const row = db.select().from(media).where(eq(media.id, image.id)).get();
        if (
          !row ||
          !row.mime.startsWith("image/") ||
          row.id === avatar ||
          row.id === logo ||
          row.id === siteSettings().backgroundId ||
          (row.postId && row.postId !== postId)
        )
          throw new HttpError(400, "图片不存在或已用于其他内容");
        retained.add(row.id);
        if (row.liveId) {
          const video = db
            .select()
            .from(media)
            .where(eq(media.id, row.liveId))
            .get();
          if (
            !video ||
            !video.mime.startsWith("video/") ||
            (video.postId && video.postId !== postId)
          )
            throw new HttpError(400, "动态片段无效");
          retained.add(video.id);
          live.set(row.id, video.id);
        }
      }
      const audio =
        data.audio ??
        (existing
          ? db
              .select()
              .from(media)
              .where(eq(media.postId, postId))
              .all()
              .filter((row) => row.mime.startsWith("audio/"))
              .map((row) => ({ id: row.id, title: row.alt }))
          : []);
      if (new Set(audio.map((row) => row.id)).size !== audio.length)
        throw new HttpError(400, "音频不能重复");
      for (const item of audio) {
        const row = db.select().from(media).where(eq(media.id, item.id)).get();
        if (
          !row ||
          !row.mime.startsWith("audio/") ||
          (row.postId && row.postId !== postId)
        )
          throw new HttpError(400, "音频不存在或已用于其他内容");
        retained.add(row.id);
      }
      const videos =
        data.videos ??
        (existing
          ? postVideo(postId).map((row) => ({ id: row.id, title: row.alt }))
          : []);
      if (new Set(videos.map((item) => item.id)).size !== videos.length)
        throw new HttpError(400, "视频不能重复");
      for (const item of videos) {
        const row = db.select().from(media).where(eq(media.id, item.id)).get();
        const parent = db
          .select()
          .from(media)
          .where(eq(media.liveId, item.id))
          .get();
        if (
          !row ||
          !row.mime.startsWith("video/") ||
          parent ||
          (row.postId && row.postId !== postId)
        )
          throw new HttpError(400, "视频不存在或已用于其他内容");
        retained.add(row.id);
      }
      const files =
        data.files ??
        (existing
          ? db
              .select()
              .from(media)
              .where(eq(media.postId, postId))
              .all()
              .filter((row) => row.mime === "application/octet-stream")
              .map((row) => ({ id: row.id, title: row.alt }))
          : []);
      if (new Set(files.map((item) => item.id)).size !== files.length)
        throw new HttpError(400, "文件不能重复");
      for (const item of files) {
        const row = db.select().from(media).where(eq(media.id, item.id)).get();
        if (
          !row ||
          row.mime !== "application/octet-stream" ||
          (row.postId && row.postId !== postId)
        )
          throw new HttpError(400, "文件不存在或已用于其他内容");
        retained.add(row.id);
      }
      const fields = {
        body: data.body,
        title: data.title ?? existing?.title ?? "",
        categoryId,
        status: data.status,
        visibility: data.visibility,
        pinned: data.pinned,
        updatedAt: now,
        publishedAt:
          data.status === "published" ? (existing?.publishedAt ?? now) : null,
      };
      if (existing)
        db.update(posts).set(fields).where(eq(posts.id, postId)).run();
      else
        db.insert(posts)
          .values({ id: postId, createdAt: now, ...fields })
          .run();
      const old = db.select().from(media).where(eq(media.postId, postId)).all();
      for (const row of old)
        if (!retained.has(row.id)) {
          db.update(media).set({ postId: null }).where(eq(media.id, row.id)).run();
        }
      [
        ...audio,
        ...videos,
        ...files.map((item) => ({ ...item, title: fileName(item.title) })),
      ].forEach((item, position) => {
        db.update(media)
          .set({ postId, alt: item.title, position })
          .where(eq(media.id, item.id))
          .run();
      });
      data.images.forEach((image, position) => {
        db.update(media)
          .set({
            postId,
            alt: image.alt,
            position,
            ...(image.linkUrl !== undefined ? { linkUrl: image.linkUrl } : {}),
          })
          .where(eq(media.id, image.id))
          .run();
        const videoId = live.get(image.id);
        if (videoId)
          db.update(media)
            .set({
              postId,
              alt: image.alt,
              position,
              ...(image.linkUrl !== undefined
                ? { linkUrl: image.linkUrl }
                : {}),
            })
            .where(eq(media.id, videoId))
            .run();
      });
    })
    .immediate();
  return getPost(postId)!;
}
export async function deletePost(id: string) {
  sqlite.transaction(() => {
    if (!getPost(id)) throw new HttpError(404, "动态不存在");
    db.update(media).set({ postId: null }).where(eq(media.postId, id)).run();
    db.delete(posts).where(eq(posts.id, id)).run();
  }).immediate();
}
