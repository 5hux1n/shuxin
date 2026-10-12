import { z } from "zod";
import { db } from "../../../lib/db";
import { owner } from "../../../lib/db/schema";
import {
  guard,
  verifyPassword,
  createSession,
  rateLimit,
  clearLimit,
} from "../../../lib/auth";
import { endpoint, body, json, HttpError } from "../../../lib/http";
const dummy = "pbkdf2:00000000000000000000000000000000:" + "0".repeat(64);
export const POST = endpoint(async (ctx) => {
  guard(ctx, false);
  rateLimit("login-global", 40);
  const data = z
    .object({ username: z.string().max(80), password: z.string().max(128) })
    .parse(await body(ctx.request));
  rateLimit(`login:${data.username.toLowerCase()}`);
  const row = db.select().from(owner).get();
  const valid = await verifyPassword(data.password, row?.passwordHash ?? dummy);
  if (!row || row.username !== data.username || !valid)
    throw new HttpError(401, "登录名或密码不正确");
  const latest = db.select().from(owner).get();
  if (
    latest?.passwordHash !== row.passwordHash ||
    latest.username !== row.username
  )
    throw new HttpError(409, "账号状态已变化，请重新登录");
  clearLimit(`login:${data.username.toLowerCase()}`);
  createSession(ctx.cookies);
  return json({ redirect: "/admin" });
});
