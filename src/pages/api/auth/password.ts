import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../../../lib/db";
import { owner, sessions } from "../../../lib/db/schema";
import {
  guard,
  verifyPassword,
  passwordHash,
  logout,
  rateLimit,
} from "../../../lib/auth";
import { endpoint, body, json, HttpError } from "../../../lib/http";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  rateLimit("password", 8);
  const data = z
    .object({
      current: z.string().max(128),
      password: z.string().nonempty("请填写新密码").max(128),
    })
    .parse(await body(ctx.request));
  const row = db.select().from(owner).get()!;
  if (!(await verifyPassword(data.current, row.passwordHash)))
    throw new HttpError(403, "当前密码不正确");
  const encoded = await passwordHash(data.password);
  sqlite
    .transaction(() => {
      const latest = db.select().from(owner).get();
      if (
        latest?.passwordHash !== row.passwordHash ||
        latest.username !== row.username
      )
        throw new HttpError(409, "密码已变化，请重新登录");
      db.update(owner)
        .set({ passwordHash: encoded })
        .where(eq(owner.id, 1))
        .run();
      db.delete(sessions).run();
    })
    .immediate();
  logout(ctx.cookies);
  return json({ redirect: "/admin/login" });
});
