import { siteSettings } from "./lib/posts/repo";
import { backgroundUrl } from "./lib/background";
import { randomBytes } from "node:crypto";
import { defineMiddleware } from "astro:middleware";
import { currentOwner, csrfToken } from "./lib/auth";
import { db } from "./lib/db";
import { owner } from "./lib/db/schema";
import { assertConfiguration } from "./lib/config";
export const onRequest = defineMiddleware(async (ctx, next) => {
  assertConfiguration();
  if (ctx.url.pathname === "/api/background/bing" && ["GET", "HEAD"].includes(ctx.request.method)) {
    const response = await next();
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  ctx.locals.owner = currentOwner(ctx.cookies);
  ctx.locals.csrf = csrfToken(ctx.cookies);
  ctx.locals.nonce = randomBytes(16).toString("base64");
  const p = ctx.url.pathname;
  const protectedPage =
    p.startsWith("/admin") &&
    !["/admin/login", "/admin/setup"].includes(p.replace(/\/$/, "")) &&
    !ctx.locals.owner;
  const response = protectedPage
    ? ctx.redirect(
        db.select().from(owner).get() ? "/admin/login" : "/admin/setup",
      )
    : await next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  const site = siteSettings();
  const backgroundOrigin =
    site.backgroundMode === "api" &&
    site.backgroundApiType === "json" &&
    backgroundUrl(site.backgroundUrl)
      ? new URL(site.backgroundUrl).origin
      : "";
  const backgroundConnect =
    ctx.locals.owner && p.startsWith("/admin") ? "https:" : backgroundOrigin;
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'nonce-${ctx.locals.nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.music.126.net https://*.qq.com https://*.gtimg.cn https://*.byteimg.com https://*.douyinpic.com https:; media-src 'self' https:; frame-src https://music.163.com; worker-src 'self' blob:; connect-src 'self' ${backgroundConnect}; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  );
  if (p !== "/api/background/bing")
    response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Cookie");
  if (p.startsWith("/admin") || p.startsWith("/api"))
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
});
