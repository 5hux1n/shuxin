import { and, desc, eq, isNull, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { posts, media, owner, settings, categories } from "../db/schema";
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
export function searchCategories(query: string) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  return db.select({ id: categories.id, name: categories.name })
    .from(categories).innerJoin(posts, eq(posts.categoryId, categories.id))
    .where(publicRule).groupBy(categories.id, categories.name).all()
    .filter(({ name }) => {
      const label = name.toLocaleLowerCase();
      return label.includes(term) || term.includes(label);
    });
}
export function timeline(cursor: string | null, query = "", categoryId?: string) {
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
  const searchText = `%${query.replace(/[!%_]/g, "!$&")}%`;
  const matchingCategories = query ? searchCategories(query).map(({ id }) => id) : [];
  const searchRule = query
    ? or(and(isNull(posts.passwordHash), sql`${posts.body} LIKE ${searchText} ESCAPE '!'`), sql`${posts.title} LIKE ${searchText} ESCAPE '!'`, matchingCategories.length ? inArray(posts.categoryId, matchingCategories) : undefined)
    : undefined;
  const rows = db
    .select()
    .from(posts)
    .where(and(publicRule, after, searchRule, categoryId ? eq(posts.categoryId, categoryId) : undefined))
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
function groupPostMedia(rows: (typeof media.$inferSelect)[]) {
  const liveIds = new Set(rows.map((row) => row.liveId).filter(Boolean));
  return {
    images: rows.filter((row) => row.mime.startsWith("image/")),
    audio: rows.filter((row) => row.mime.startsWith("audio/")),
    videos: rows.filter((row) => row.mime.startsWith("video/") && !liveIds.has(row.id)),
    files: rows.filter((row) => row.mime === "application/octet-stream"),
  };
}
export function postAttachments(id: string) {
  return groupPostMedia(db.select().from(media).where(eq(media.postId, id)).orderBy(media.position, media.id).all());
}
export function timelineAttachments(ids: string[]) {
  const grouped = new Map<string, (typeof media.$inferSelect)[]>(ids.map((id) => [id, []]));
  if (ids.length) {
    const rows = db.select().from(media).where(inArray(media.postId, ids)).orderBy(media.position, media.id).all();
    for (const row of rows) grouped.get(row.postId!)!.push(row);
  }
  return new Map(Array.from(grouped, ([id, rows]) => [id, groupPostMedia(rows)]));
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
    .where(and(publicRule, isNull(posts.passwordHash)))
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
