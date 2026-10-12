import { HttpError } from "../http";
import { musicLink } from "./links";

export const coverHosts = [
  "music.126.net",
  "qq.com",
  "gtimg.cn",
  "byteimg.com",
  "douyinpic.com",
];
export function trustedUrl(value: unknown, hosts: string[]) {
  if (typeof value !== "string" || value.length > 8192) return "";
  try {
    const url = new URL(value.replace(/^http:\/\//, "https://"));
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export const safeCover = (value: unknown) => trustedUrl(value, coverHosts);
export const audioHosts: Record<string, string[]> = {
  网易云音乐: ["music.126.net", "music.163.com"],
  "QQ 音乐": ["qq.com"],
  汽水音乐: ["douyinvod.com", "bytecdn.cn", "douyin.com"],
};
export async function publicText(url: string, init: RequestInit = {}) {
  let current = url;
  const original = new URL(url);
  const family =
    ["qq.com", "music.163.com"].find(
      (h) => original.hostname === h || original.hostname.endsWith(`.${h}`),
    ) || original.hostname;
  const signal = AbortSignal.timeout(8000);
  for (let step = 0; step < 4; step++) {
    const response = await fetch(current, {
      ...init,
      redirect: "manual",
      signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ...init.headers,
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || (init.method && init.method !== "GET"))
        throw new HttpError(502, "音乐接口暂时无法响应");
      const next = trustedUrl(new URL(location, current).href, [family]);
      if (!next) throw new HttpError(502, "音乐接口跳转到了不支持的网站");
      current = next;
      continue;
    }
    if (!response.ok) {
      console.warn(
        "[shuxin] music upstream",
        new URL(current).hostname,
        response.status,
      );
      throw new HttpError(502, "音乐平台暂时无法访问，请稍后重试");
    }
    return boundedText(response);
  }
  throw new HttpError(502, "音乐接口跳转过多，请稍后重试");
}
export async function boundedText(response: Response) {
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) {
        await reader.cancel();
        throw new HttpError(502, "分享页面过大");
      }
      chunks.push(value);
    }
  return Buffer.concat(chunks).toString();
}
export async function sharePage(value: string) {
  const original = musicLink(value);
  if (!original) throw new HttpError(400, "请填写支持的音乐平台分享链接");
  let url = original.url;
  const signal = AbortSignal.timeout(12000);
  for (let step = 0; step < 6; step++) {
    if (musicLink(url)?.platform !== original.platform)
      throw new HttpError(400, "分享链接跳转到了不支持的网站");
    const canonical = new URL(url);
    // These song routes expose metadata via public JSON; the desktop HTML can reject edge servers.
    if (
      original.platform === "QQ 音乐" &&
      /\/songDetail\/[a-zA-Z0-9]{14}/.test(canonical.pathname)
    )
      return { url, platform: original.platform, html: "" };
    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/json",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) break;
      const next = new URL(location, url);
      if (next.protocol === "http:") next.protocol = "https:";
      url = next.href;
      continue;
    }
    if (!response.ok) {
      console.warn(
        "[shuxin] music upstream",
        new URL(url).hostname,
        response.status,
      );
      throw new HttpError(502, "音乐平台暂时无法访问，请稍后重试");
    }
    return {
      url,
      platform: original.platform,
      html: await boundedText(response),
    };
  }
  throw new HttpError(502, "分享链接跳转过多，请使用歌曲页面链接");
}
export type Data = { [key: string]: unknown };
export const object = (value: unknown): Data =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Data)
    : {};
export const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
export const text = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 300) : "";
export function embeddedJson(html: string, marker: string): unknown {
  const pos = html.indexOf(marker);
  if (pos < 0) return null;
  const rest = html.slice(pos + marker.length);
  const start = rest.search(/[[{]/);
  if (start < 0) return null;
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = start; i < rest.length; i++) {
    const c = rest[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{" || c === "[") depth++;
    else if ((c === "}" || c === "]") && --depth === 0) {
      try {
        return JSON.parse(rest.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
export function pageMeta(html: string, name: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1] === name)
      return (tag.match(/content=["']([^"']+)["']/i)?.[1] ?? "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .trim()
        .slice(0, 300);
  }
  return "";
}

export async function optionalJson(url: string, init: RequestInit = {}) {
  try {
    return object(JSON.parse(await publicText(url, init)));
  } catch (error) {
    console.warn(
      "[shuxin] music metadata unavailable",
      new URL(url).hostname,
      error instanceof Error ? error.name : "Error",
    );
    return {};
  }
}
