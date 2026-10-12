import { fileName } from "../lib/downloads";
export function csrf() {
  return (
    document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
      ?.content ?? ""
  );
}
export async function api(url: string, payload?: unknown, method = "POST") {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    ["/api/storage", "/api/music/import", "/api/library"].includes(url) ? 120000 : 20000,
  );
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("请求超时，请刷新确认操作结果后再重试。", {
        cause: error,
      });
    throw new Error("无法连接服务器，请检查网络后重试。", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
  let data: {
    error?: string;
    redirect: string;
    message: string;
    html: string;
    category?: { id: string; name: string };
    categories?: { id: string; name: string }[];
    storage?: unknown;
    background?: unknown;
    branding?: {
      title: string;
      browserTitle: string;
      logoId: string;
      logoText: string;
    };
  };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("服务器未返回有效结果，请刷新页面后重试。");
  }
  if (!response.ok) throw new Error(data.error ?? "请求未完成");
  return data;
}

export function bindValidation(form: HTMLFormElement) {
  form.addEventListener(
    "invalid",
    (event) => {
      const field = event.target as HTMLInputElement;
      const label = field.closest("label")?.childNodes[0]?.textContent?.trim();
      notice(
        form.querySelector(".notice"),
        `${label ? `${label}：` : ""}${field.validationMessage}`,
        true,
      );
    },
    true,
  );
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function notice(el: HTMLElement | null, message: string, error = false) {
  if (!location.pathname.startsWith("/admin")) {
    if (el) { el.textContent = message; el.classList.toggle("error", error); }
    return;
  }
  if (el) { el.textContent = ""; el.hidden = true; }
  let toast = document.querySelector<HTMLElement>("#admin-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "admin-toast";
    toast.className = "admin-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }
  (document.querySelector<HTMLDialogElement>("dialog[open]") || document.body).append(toast);
  clearTimeout(toastTimer);
  toast.classList.remove("visible");
  if (!message) return;
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.dataset.state = error ? "error" : /^(正在|保存中|处理中)/.test(message) ? "loading" : "success";
  requestAnimationFrame(() => toast!.classList.add("visible"));
  toastTimer = setTimeout(() => toast!.classList.remove("visible"), error ? 8000 : 4500);
}
export async function uploadImage(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error("单张图片不能超过 10 MB");
  if (/\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/.test(file.type)) {
    const { heicTo } = await import("heic-to/csp");
    const converted = await heicTo({
      blob: file,
      type: "image/jpeg",
      quality: 0.9,
    });
    file = new File([converted], file.name.replace(/\.hei[cf]$/i, ".jpg"), {
      type: "image/jpeg",
    });
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("单张图片不能超过 10 MB");
  const response = await fetch("/api/media", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "image/unknown",
      "X-File-Name": encodeURIComponent(fileName(file.name)),
      "X-CSRF-Token": csrf(),
    },
    body: file,
  });
  const result = (await response.json()) as {
    error?: string;
    id: string;
    width: number;
    height: number;
    alt: string;
    url: string;
  };
  if (!response.ok) throw new Error(result.error ?? "图片上传失败");
  return result as {
    id: string;
    width: number;
    height: number;
    alt: string;
    url: string;
  };
}

export async function uploadLivePhoto(image: File, video: File) {
  if (video.size > 10 * 1024 * 1024) throw new Error("动态片段不能超过 10 MB");
  const cover = await uploadImage(image);
  const response = await fetch(`/api/media/live?image=${cover.id}`, {
    method: "POST",
    headers: {
      "Content-Type":
        video.type ||
        (/\.mov$/i.test(video.name) ? "video/quicktime" : "video/mp4"),
      "X-CSRF-Token": csrf(),
    },
    body: video,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Live Photo 上传失败");
  return { ...cover, liveId: result.id as string };
}

export async function uploadAudio(
  file: File,
  progress?: (percent: number) => void,
  kind: "audio" | "video" | "file" = "audio",
) {
  async function request(
    url: string,
    method: string,
    body?: BodyInit,
    extra: Record<string, string> = {},
  ) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      method === "POST" && /\/uploads\/[^/]+$/.test(url) ? 600000 : 120000,
    );
    try {
      const response = await fetch(url, {
        method,
        headers: { "X-CSRF-Token": csrf(), ...extra },
        body,
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "媒体上传失败");
      return result;
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error("上传超时，请重新选择文件", { cause: error });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  const started = await request(
    "/api/media/uploads",
    "POST",
    JSON.stringify({ kind, size: file.size }),
    { "Content-Type": "application/json" },
  );
  try {
    for (let offset = 0; offset < file.size; offset += started.chunkSize) {
      await request(
        `/api/media/uploads/${started.id}`,
        "PUT",
        file.slice(offset, offset + started.chunkSize),
        {
          "X-Upload-Offset": String(offset),
          "Content-Type": "application/octet-stream",
        },
      );
      progress?.(
        Math.round(
          (Math.min(file.size, offset + started.chunkSize) * 100) / file.size,
        ),
      );
    }
    return (await request(
      `/api/media/uploads/${started.id}`,
      "POST",
      undefined,
      { "X-File-Name": encodeURIComponent(fileName(file.name)) },
    )) as {
      id: string;
      url: string;
      filename?: string;
      size?: number;
    };
  } catch (error) {
    await request(`/api/media/uploads/${started.id}`, "DELETE").catch(
      () => undefined,
    );
    throw error;
  }
}
