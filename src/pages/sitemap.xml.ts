import { publicPosts } from "../lib/posts/repo";
import { config } from "../lib/config";
export function GET() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${config.origin}/</loc></url>${publicPosts()
      .map(
        (p) =>
          `<url><loc>${config.origin}/p/${p.id}</loc><lastmod>${new Date(p.updatedAt).toISOString()}</lastmod></url>`,
      )
      .join("")}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
