import { z } from "zod";
import { eq } from "drizzle-orm";
import { guard } from "../../../lib/auth";
import { db, sqlite } from "../../../lib/db";
import { media, owner } from "../../../lib/db/schema";
import { uploadLiveVideo } from "../../../lib/media/service";
import { promoteMedia, removeFile } from "../../../lib/storage/media";
import { readUpload } from "../../../lib/media/request";
import { endpoint, HttpError, json } from "../../../lib/http";
import { siteSettings } from "../../../lib/posts/repo";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  const imageId = z.uuid().parse(ctx.url.searchParams.get("image"));
  if (!ctx.request.headers.get("content-type")?.startsWith("video/"))
    throw new HttpError(415, "请选择 MOV 或 MP4 动态片段");
  const image = db.select().from(media).where(eq(media.id, imageId)).get();
  if (
    !image ||
    !image.mime.startsWith("image/") ||
    image.liveId ||
    image.postId ||
    [siteSettings().logoId, siteSettings().backgroundId].includes(imageId) ||
    db.select().from(owner).get()?.avatarId === imageId
  )
    throw new HttpError(400, "请选择尚未发布的 Live Photo 封面");
  const video = uploadLiveVideo(await readUpload(ctx.request));
  try {
    await promoteMedia(video.id);
    sqlite
      .transaction(() => {
        const latest = db
          .select()
          .from(media)
          .where(eq(media.id, imageId))
          .get();
        if (
          !latest ||
          latest.liveId ||
          latest.postId ||
          [siteSettings().logoId, siteSettings().backgroundId].includes(
            imageId,
          ) ||
          db.select().from(owner).get()?.avatarId === imageId
        )
          throw new HttpError(409, "图片状态已变化，请重新添加");
        db.update(media)
          .set({ liveId: video.id })
          .where(eq(media.id, imageId))
          .run();
      })
      .immediate();
  } catch (error) {
    db.delete(media).where(eq(media.id, video.id)).run();
    await removeFile(`${video.id}.mp4`);
    throw error;
  }
  return json({ ...video, imageId }, 201);
});
