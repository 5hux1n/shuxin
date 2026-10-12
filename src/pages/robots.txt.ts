import { config } from "../lib/config";
export function GET() {
  return new Response(
    `User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /search\nDisallow: /media/\nSitemap: ${config.origin}/sitemap.xml\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
