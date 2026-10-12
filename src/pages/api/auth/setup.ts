import { z } from "zod";
import { db, sqlite } from "../../../lib/db";
import { owner } from "../../../lib/db/schema";
import {
  guard,
  passwordHash,
  createSession,
  rateLimit,
} from "../../../lib/auth";
import { endpoint, body, json, HttpError } from "../../../lib/http";
export const POST = endpoint(async (ctx) => {
  guard(ctx, false);
  if (db.select().from(owner).get()) throw new HttpError(409, "站点已经初始化");
  rateLimit("setup", 12);
  const data = z
    .object({
      username: z
        .string()
        .regex(/^[a-zA-Z0-9_.-]{3,40}$/, "登录名为 3–40 位字母、数字或 _.-"),
      password: z.string().nonempty("请填写密码").max(128),
      displayName: z.string().trim().min(1).max(80),
    })
    .parse(await body(ctx.request));
  const encoded = await passwordHash(data.password);
  sqlite
    .transaction(() => {
      if (db.select().from(owner).get())
        throw new HttpError(409, "站点已经初始化");
      db.insert(owner)
        .values({
          id: 1,
          username: data.username,
          passwordHash: encoded,
          displayName: data.displayName,
        })
        .run();
    })
    .immediate();
  createSession(ctx.cookies);
  return json({ redirect: "/admin" });
});
