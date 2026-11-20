import { createHmac, timingSafeEqual } from "node:crypto";
import type { AstroCookies } from "astro";
import { config } from "../config";
import { hash } from "../auth";

type ProtectedPost = { id: string; passwordHash: string | null };
type Grant = { id: string; fingerprint: string; expires: number };
const cookieName = "shuxin_post_access";
const lifetime = 12 * 60 * 60;
const sign = (value: string) => createHmac("sha256", config.secret).update(`post-access:${value}`).digest("hex");
function grants(cookies?: AstroCookies): Grant[] {
  const value = cookies?.get(cookieName)?.value;
  if (!value || value.length > 3800) return [];
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || !/^[a-f0-9]{64}$/.test(signature)) return [];
  if (!timingSafeEqual(Buffer.from(sign(payload), "hex"), Buffer.from(signature, "hex"))) return [];
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!Array.isArray(parsed) || parsed.length > 12) return [];
    return parsed.filter((item): item is Grant => item && typeof item.id === "string" && typeof item.fingerprint === "string" && typeof item.expires === "number" && item.expires > Date.now());
  } catch {
    return [];
  }
}
export function unlockedPost(post: ProtectedPost, cookies?: AstroCookies) {
  if (!post.passwordHash) return true;
  const fingerprint = hash(post.passwordHash);
  return grants(cookies).some(grant => grant.id === post.id && grant.fingerprint === fingerprint);
}
export function grantPost(post: ProtectedPost, cookies: AstroCookies) {
  if (!post.passwordHash) return;
  const items = grants(cookies).filter(grant => grant.id !== post.id).slice(-11);
  items.push({ id: post.id, fingerprint: hash(post.passwordHash), expires: Date.now() + lifetime * 1000 });
  const payload = Buffer.from(JSON.stringify(items)).toString("base64url");
  cookies.set(cookieName, `${payload}.${sign(payload)}`, {
    path: "/", httpOnly: true, secure: config.secure, sameSite: "strict", maxAge: lifetime,
  });
}
