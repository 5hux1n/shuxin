import { notice } from "./api";
import { backgroundUrl } from "../lib/background";
let generation = 0;
export async function applyBackground(layer: HTMLElement) {
  const current = ++generation;
  const source = layer.dataset.backgroundSource;
  const message = document.querySelector<HTMLElement>("#background-notice");
  if (message) {
    message.textContent = "";
    message.classList.remove("error");
  }
  layer.style.backgroundImage = "";
  if (!source) return;
  try {
    let url = source;
    if (layer.dataset.backgroundJson === "true") {
      const response = await fetch(source, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("背景 API 请求失败");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("背景 API 未返回内容");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          throw new Error("背景 API 数据过大");
        }
        chunks.push(result.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      let value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      for (const key of (layer.dataset.backgroundField || "url").split(".")) {
        if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
          throw new Error("找不到背景图片字段");
        value = (value as Record<string, unknown>)[key];
      }
      if (typeof value !== "string") throw new Error("背景图片字段不是地址");
      url =
        backgroundUrl(
          new URL(
            value,
            source === "/api/background/bing" ? location.origin : source,
          ).href,
        ) ?? "";
      if (!url) throw new Error("背景 API 未返回有效 HTTPS 图片地址");
    }
    if (current !== generation) return;
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("背景图片加载失败"));
      image.src = url;
    });
    if (current !== generation) return;
    layer.style.backgroundImage = `url(${JSON.stringify(url)})`;
    const preview = document.querySelector<HTMLImageElement>(
      "#background-preview",
    );
    if (preview) {
      preview.src = url;
      preview.hidden = false;
    }
  } catch (error) {
    if (current !== generation) return;
    notice(document.querySelector<HTMLElement>("#background-notice"), (error as Error).message, true);
  }
}
const layer = document.querySelector<HTMLElement>(".site-background");
if (layer) void applyBackground(layer);
