import { config } from "../config";
import { HttpError } from "../http";
export async function readUpload(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "缺少文件");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > config.maxUpload) {
      await reader.cancel();
      throw new HttpError(413, "单个文件不能超过 10 MB");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
