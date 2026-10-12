import type { APIContext } from "astro";
import { ZodError } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
export function endpoint(
  fn: (ctx: APIContext) => Promise<Response> | Response,
) {
  return async (ctx: APIContext) => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e instanceof ZodError)
        return json({ error: e.issues.map((i) => i.message).join("；") }, 400);
      console.error(
        "[shuxin] request failed",
        e instanceof Error ? e.name : "UnknownError",
      );
      return json({ error: "请求未完成，请稍后重试。" }, 500);
    }
  };
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "请使用 JSON 请求");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "缺少请求内容");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256_000) {
      await reader.cancel();
      throw new HttpError(413, "请求内容过大");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new HttpError(400, "请求格式不正确");
  }
}
