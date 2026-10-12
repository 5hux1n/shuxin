import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { posts, media, owner, settings } from "../db/schema";
import { z } from "zod";
import { profileAvatarLink } from "../profile-link";
import { browserBrandTitle } from "../branding";
export type Post = typeof posts.$inferSelect;
export const publicRule = and(
  eq(posts.status, "published"),
  eq(posts.visibility, "public"),
);
const cursorSchema = z.tuple([
  z.number().int().min(0).max(1),
  z.number().int().nonnegative(),
  z.string().max(64),
]);
export function timeline(cursor: string | null, query = "") {
  let after;
  if (cursor) {
    try {
      const [p, t, id] = cursorSchema.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString()),
      );
      after = or(
        lt(posts.pinned, Boolean(p)),
        and(eq(posts.pinned, Boolean(p)), lt(posts.publishedAt, t)),
        and(
          eq(posts.pinned, Boolean(p)),
          eq(posts.publishedAt, t),
          lt(posts.id, id),
        ),
      );
    } catch {
      return { entries: [], cursor: null, invalid: true };
    }
  }
  // Escape literal search operators before the parameterized LIKE query.
  const searchRule = query
    ? sql`${posts.body} LIKE ${`%${query.replace(/[!%_]/g, "!$&")}%`} ESCAPE '!'`
    : undefined;
  const rows = db
    .select()
    .from(posts)
    .where(and(publicRule, after, searchRule))
    .orderBy(desc(posts.pinned), desc(posts.publishedAt), desc(posts.id))
    .limit(21)
    .all();
  const entries = rows.slice(0, 20);
  const last = entries.at(-1);
  return {
    entries,
    cursor:
      rows.length > 20 && last
        ? Buffer.from(
            JSON.stringify([Number(last.pinned), last.publishedAt, last.id]),
          ).toString("base64url")
        : null,
    invalid: false,
  };
}
export function getPost(id: string) {
  return db.select().from(posts).where(eq(posts.id, id)).get();
}
export function readable(post: Post, authenticated: boolean) {
  return (
    authenticated ||
    (post.status === "published" && post.visibility !== "private")
  );
}
export function postMedia(id: string) {
  return db
    .select()
    .from(media)
    .where(eq(media.postId, id))
    .orderBy(media.position, media.id)
    .all()
    .filter((image) => image.mime.startsWith("image/"));
}
export function postAudio(id: string) {
  return db
    .select()
    .from(media)
    .where(eq(media.postId, id))
    .orderBy(media.position, media.id)
    .all()
    .filter((row) => row.mime.startsWith("audio/"));
}
export function profile() {
  const row = db
    .select({
      displayName: owner.displayName,
      bio: owner.bio,
      avatarId: owner.avatarId,
    })
    .from(owner)
    .get();
  return { ...(row ?? { displayName: "书信", bio: "", avatarId: null }), avatarLink: profileAvatarLink() };
}
export function siteSettings() {
  const rows = db.select().from(settings).all();
  const site = {
    logoId: "",
    logoMode: "",
    logoText: "ShuXin",
    backgroundId: "",
    backgroundMode: "upload",
    backgroundUrl: "",
    backgroundApiType: "image",
    backgroundApiField: "url",
    backgroundOpacity: "20",
    title: "书信",
    description: "",
    theme: "system",
    ...Object.fromEntries(rows.map((r) => [r.key, r.value])),
  };
  const profile = db.select({ name: owner.displayName, bio: owner.bio }).from(owner).get();
  return {
    ...site,
    configuredTitle: site.title,
    title: site.title.trim() || site.logoText.trim() || profile?.name || "ShuXin",
    browserTitle: browserBrandTitle(site.title, site.description, site.logoText, profile?.name || "", profile?.bio || ""),
  };
}
export function publicPosts() {
  return db
    .select()
    .from(posts)
    .where(publicRule)
    .orderBy(desc(posts.publishedAt), desc(posts.id))
    .all();
}

export function postVideo(id: string) {
  const rows = db
    .select()
    .from(media)
    .where(eq(media.postId, id))
    .orderBy(media.position, media.id)
    .all();
  const liveIds = new Set(rows.map((row) => row.liveId).filter(Boolean));
  return rows.filter(
    (row) => row.mime.startsWith("video/") && !liveIds.has(row.id),
  );
}

export function postFiles(id: string) {
  return db
    .select()
    .from(media)
    .where(eq(media.postId, id))
    .orderBy(media.position, media.id)
    .all()
    .filter((row) => row.mime === "application/octet-stream");
}
