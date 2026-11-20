import { createHash } from "node:crypto";
import { imagePreview } from "./service";
// Cached only after authorization; source hashes invalidate restored or replaced bytes.
const cache = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
let cacheBytes = 0;
const budget = 8 * 1024 * 1024;
export function animatedWebp(bytes: Buffer) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    if (bytes.toString("ascii", offset, offset + 4) === "ANIM") return true;
    offset += 8 + bytes.readUInt32LE(offset + 4) + (bytes.readUInt32LE(offset + 4) % 2);
  }
  return false;
}
export async function previewImage(source: Buffer, width: number) {
  const key = createHash("sha256").update(source).digest("hex") + ":" + width;
  const existing = cache.get(key);
  if (existing) { cache.delete(key); cache.set(key, existing); return existing; }
  if (pending.has(key)) return pending.get(key)!;
  const work = imagePreview(source, width);
  pending.set(key, work);
  let bytes: Buffer;
  try { bytes = await work; } finally { pending.delete(key); }
  if (bytes.length <= budget) {
    while (cacheBytes + bytes.length > budget || cache.size >= 128) {
      const first = cache.keys().next().value!;
      cacheBytes -= cache.get(first)!.length;
      cache.delete(first);
    }
    cache.set(key, bytes); cacheBytes += bytes.length;
  }
  return bytes;
}
