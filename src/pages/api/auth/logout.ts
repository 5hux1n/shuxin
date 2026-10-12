import { endpoint, json } from "../../../lib/http";
import { guard, logout } from "../../../lib/auth";
export const POST = endpoint((ctx) => {
  guard(ctx);
  logout(ctx.cookies);
  return json({ redirect: "/" });
});
