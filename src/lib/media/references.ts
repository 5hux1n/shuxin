import type { Token } from "marked";
import { markdownParser } from "../markdown/parser";
import type { AstroCookies } from "astro";
import { unlockedPost } from "../posts/password";
import { and, eq, ne, like } from "drizzle-orm";
import { db } from "../db";
import { posts, media } from "../db/schema";
import { parsePlaylist } from "../music/playlist";
export function localMediaId(url: string) {
  return /^\/media\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(url)?.[1] ?? null;
}
export function markdownMediaIds(source: string) {
  const ids = new Set<string>();
  const add = (url: string) => { const id = localMediaId(url); if (id) ids.add(id); };
  function collect(tokens: Token[]) {
    for (const token of tokens) {
      if (token.type === "footnote") continue;
      if (token.type === "footnotes") {
        for (const note of token.items) collect(note.content);
        continue;
      }
      if (token.type === "image" || token.type === "link") add(token.href);
      if (token.type === "code" && token.lang === "playlist") {
        try { parsePlaylist(token.text).tracks.forEach(track => add(track.url)); }
        catch { /* Invalid playlists remain code and grant no media access. */ }
      }
      if ("tokens" in token && token.tokens) collect(token.tokens);
      if (token.type === "list") for (const item of token.items) collect(item.tokens);
      if (token.type === "table") for (const cell of [...token.header, ...token.rows.flat()]) collect(cell.tokens);
    }
  }
  collect(markdownParser().lexer(source));
  return ids;
}
export function publicMediaReference(id: string, cookies?: AstroCookies) {
  const cover = db.select({ id: media.id }).from(media).where(eq(media.liveId, id)).get();
  return db.select({ id: posts.id, body: posts.body, passwordHash: posts.passwordHash }).from(posts)
    .where(and(eq(posts.status, "published"), ne(posts.visibility, "private"), like(posts.body, "%/media/%")))
    .all().some(post => {
      if (!unlockedPost(post, cookies)) return false;
      const ids = markdownMediaIds(post.body);
      return ids.has(id) || !!(cover && ids.has(cover.id));
    });
}
export function mediaReferenceCounts() {
  const counts = new Map<string, number>();
  for (const post of db.select({ body: posts.body }).from(posts).where(like(posts.body, "%/media/%")).all()) {
    for (const id of markdownMediaIds(post.body)) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}
