import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { workerContext } from "../runtime";
import type { APIContext, AstroCookies } from "astro";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../db";
import { owner, sessions } from "../db/schema";
import { config } from "../config";
import { HttpError } from "../http";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function derive(password: string, salt: string) {
  // Workers production caps WebCrypto PBKDF2 at 100000; retain the same RFC 8018 output.
  if (workerContext.getStore())
    return Buffer.from(
      await pbkdf2Async(
        sha256,
        new TextEncoder().encode(password),
        new Uint8Array(Buffer.from(salt, "hex")),
        { c: 600000, dkLen: 32, asyncTick: 10 },
      ),
    );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return Buffer.from(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new Uint8Array(Buffer.from(salt, "hex")),
        iterations: 600000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
}
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `pbkdf2:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [type, salt, value] = encoded.split(":");
  if (!salt || !value) return false;
  const actual =
    type === "pbkdf2"
      ? await derive(password, salt)
      : type === "scrypt"
        ? scryptSync(password, salt, 64, {
            N: 32768,
            r: 8,
            p: 1,
            maxmem: 64 * 1024 * 1024,
          })
        : null;
  if (!actual) return false;
  const expected = Buffer.from(value, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
const cookieOptions = () => ({
  path: "/",
  httpOnly: true,
  secure: config.secure,
  sameSite: "strict" as const,
});
export function createSession(cookies: AstroCookies) {
  sqlite.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  const token = randomBytes(32).toString("hex");
  db.insert(sessions)
    .values({
      tokenHash: hash(token),
      ownerId: 1,
      expiresAt: Date.now() + config.sessionSeconds * 1000,
    })
    .run();
  cookies.set("shuxin_session", token, {
    ...cookieOptions(),
    maxAge: config.sessionSeconds,
  });
}
export function currentOwner(cookies: AstroCookies) {
  const token = cookies.get("shuxin_session")?.value;
  if (!token) return null;
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hash(token)))
    .get();
  if (!session || session.expiresAt <= Date.now()) return null;
  const result = db.select().from(owner).get();
  if (!result) return null;
  const { passwordHash: _password, ...safe } = result;
  return safe;
}
export function csrfToken(cookies: AstroCookies) {
  let token = cookies.get("shuxin_csrf")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString("hex");
    cookies.set("shuxin_csrf", token, { ...cookieOptions(), maxAge: 86400 });
  }
  return token;
}
export function guard(ctx: APIContext, authenticated = true) {
  if (authenticated && !ctx.locals.owner) throw new HttpError(401, "请先登录");
  if (ctx.request.headers.get("origin") !== config.origin)
    throw new HttpError(403, "请求来源不被允许");
  const sent = ctx.request.headers.get("x-csrf-token") || "";
  const saved = ctx.cookies.get("shuxin_csrf")?.value || "";
  if (!sent || !saved || hash(sent) !== hash(saved))
    throw new HttpError(403, "页面已过期，请刷新后重试");
}
export function rateLimit(key: string, limit = 8) {
  const now = Date.now();
  sqlite.prepare("DELETE FROM login_limits WHERE expires_at < ?").run(now);
  const k = hash(config.secret + key);
  const row = sqlite
    .prepare("SELECT attempts FROM login_limits WHERE key=?")
    .get(k) as { attempts: number } | undefined;
  if (row && row.attempts >= limit)
    throw new HttpError(429, "尝试次数过多，请 15 分钟后再试");
  sqlite
    .prepare(
      "INSERT INTO login_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1",
    )
    .run(k, now + 15 * 60 * 1000);
}
export function clearLimit(key: string) {
  sqlite
    .prepare("DELETE FROM login_limits WHERE key=?")
    .run(hash(config.secret + key));
}
export function logout(cookies: AstroCookies) {
  const token = cookies.get("shuxin_session")?.value;
  if (token)
    db.delete(sessions)
      .where(eq(sessions.tokenHash, hash(token)))
      .run();
  cookies.delete("shuxin_session", { path: "/" });
}
