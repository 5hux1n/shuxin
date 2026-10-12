import { endpoint, HttpError } from "../../../lib/http";
let cached: { text: string; expires: number } | undefined;
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=3600",
};
const sources = [
  "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN",
  "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN",
  "https://bing.biturl.top/?resolution=1920&format=json&index=0&mkt=zh-CN",
];
export const GET = endpoint(async () => {
  if (cached && cached.expires > Date.now())
    return new Response(cached.text, { headers });
  for (const source of sources) {
    try {
      const response = await fetch(source, {
        redirect: "manual",
        signal: AbortSignal.timeout(2500),
        headers: {
          "User-Agent": "ShuXin/1.0 (+https://github.com/5hux1n/shuxin)",
        },
      });
      if (!response.ok) throw new Error(`Metadata HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > 65536) throw new Error("Metadata response too large");
      const data = JSON.parse(text);
      const image = data.images?.[0] ?? data;
      const url = new URL(image?.url, "https://www.bing.com");
      if (
        url.protocol !== "https:" ||
        url.hostname !== "www.bing.com" ||
        !(/^\/th$/.test(url.pathname) || url.pathname.startsWith("/az/"))
      )
        throw new Error("Invalid Bing image");
      const result = JSON.stringify({
        url: url.href,
        copyright: String(image.copyright ?? "").slice(0, 500),
      });
      cached = { text: result, expires: Date.now() + 3600000 };
      return new Response(result, { headers });
    } catch (error) {
      console.warn(
        "[shuxin] Bing metadata source unavailable",
        new URL(source).hostname,
        error instanceof Error ? error.message : "UnknownError",
      );
    }
  }
  throw new HttpError(502, "Bing 每日一图暂时不可用");
});
