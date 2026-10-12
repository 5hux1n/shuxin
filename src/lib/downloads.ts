import { z } from "zod";

const providers = [
  {
    name: "百度网盘",
    hosts: ["pan.baidu.com", "yun.baidu.com"],
    icon: "cloud-baidu-appstore.png",
  },
  {
    name: "阿里云盘",
    hosts: ["alipan.com", "aliyundrive.com"],
    icon: "cloud-alipan-appstore.png",
  },
  { name: "夸克网盘", hosts: ["pan.quark.cn"], icon: "cloud-quark-appstore.png" },
  {
    name: "123 云盘",
    hosts: [
      "123pan.com",
      "123pan.cn",
      "123684.com",
      "123865.com",
      "123912.com",
    ],
    icon: "cloud-123pan-appstore.png",
  },
  {
    name: "蓝奏云",
    hosts: [
      "lanzou.com",
      "lanzoui.com",
      "lanzoux.com",
      "lanzouy.com",
      "lanzout.com",
      "lanzouv.com",
    ],
    icon: "cloud-download.svg",
  },
  { name: "天翼云盘", hosts: ["cloud.189.cn"], icon: "cloud-download.svg" },
  {
    name: "115 网盘",
    hosts: ["115.com", "115cdn.com"],
    icon: "cloud-download.svg",
  },
  {
    name: "OneDrive",
    hosts: ["1drv.ms", "onedrive.live.com", "sharepoint.com"],
    icon: "cloud-download.svg",
  },
  {
    name: "Google Drive",
    hosts: ["drive.google.com"],
    icon: "cloud-download.svg",
  },
  { name: "Dropbox", hosts: ["dropbox.com"], icon: "cloud-download.svg" },
];
export function downloadProvider(url: string) {
  const host = new URL(url).hostname.toLowerCase();
  return providers.find((p) =>
    p.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
  );
}
export function downloadUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export const downloadSchema = z.object({
  title: z.string().trim().max(255).default(""),
  url: z
    .string()
    .max(2048)
    .refine((v) => Boolean(downloadUrl(v)), "下载链接必须为有效 HTTPS 地址"),
  code: z.string().trim().max(40).default(""),
});
export function downloadFromShare(source: string, title: string, code: string) {
  const url = source.match(/https:\/\/[^\s<>"）)]+/i)?.[0] || source.trim();
  const inferred =
    source.match(
      /(?:提取码|访问码|密码)\s*[:：]?\s*([A-Za-z0-9]{3,12})/i,
    )?.[1] || "";
  return downloadSchema.parse({ title, url, code: code || inferred });
}
export function fileName(value: string) {
  return (
    Array.from(value)
      .filter(
        (c) =>
          c.charCodeAt(0) >= 32 &&
          (c.length > 1 ||
            c.charCodeAt(0) < 0xd800 ||
            c.charCodeAt(0) > 0xdfff) &&
          c.charCodeAt(0) !== 127 &&
          c !== "/" &&
          c !== "\\",
      )
      .join("")
      .trim()
      .slice(0, 255)
      .replace(/[\uD800-\uDBFF]$/, "") || "文件"
  );
}
export function fileIcon(name: string) {
  const ext = name.split(".").at(-1)?.toLowerCase() || "";
  const type = [
    ["archive", "zip rar 7z gz bz2 xz tar tgz zst"],
    ["text", "txt md pdf doc docx rtf odt epub"],
    ["spreadsheet", "csv xls xlsx ods"],
    ["code", "js ts jsx tsx json html css xml yaml yml py sh sql php swift go"],
    ["image", "jpg jpeg png webp gif svg heic heif avif ico"],
    ["audio", "mp3 m4a wav flac ogg opus aac wma aiff"],
    ["video", "mp4 mov mkv webm avi m4v ogv"],
    ["box", "exe msi apk ipa deb dmg pkg appimage"],
  ].find(([, extensions]) => extensions.split(" ").includes(ext))?.[0];
  return `/download-icons/file${type ? `-${type}` : ""}.svg`;
}
export function fileSize(size: number) {
  if (size < 1024) return `${size} B`;
  const index = Math.min(3, Math.floor(Math.log(size) / Math.log(1024)));
  return `${(size / 1024 ** index).toLocaleString("en-US", { maximumFractionDigits: 1 })} ${["B", "KB", "MB", "GB"][index]}`;
}
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function card(
  title: string,
  detail: string,
  url: string,
  icon: string,
  external: boolean,
) {
  return `<div class="download-card"><img class="download-cover" src="${icon}" alt="" loading="lazy"><div class="download-info"><span class="download-title">${escape(title)}</span><span class="download-detail">${escape(detail)}</span></div><a class="download-action" href="${escape(url)}" ${external ? 'target="_blank" rel="noopener noreferrer nofollow"' : 'download="download"'} aria-label="下载 ${escape(title)}" title="${external ? "打开下载链接" : "下载文件"}"><span class="download-icon" aria-hidden="true"></span></a></div>`;
}
export function renderExternalDownload(raw: unknown) {
  const data = downloadSchema.parse(raw);
  const url = downloadUrl(data.url)!;
  const provider = downloadProvider(url);
  const title = data.title || provider?.name || "文件下载";
  const detail = [
    provider?.name || new URL(url).hostname,
    data.code ? `提取码：${data.code}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return card(
    title,
    detail,
    url,
    `/download-icons/${provider?.icon || "cloud-download.svg"}`,
    true,
  );
}
export function renderFileDownload(id: string, name: string, size: number) {
  z.uuid().parse(id);
  const title = fileName(name);
  const ext = title.includes(".")
    ? title.split(".").at(-1)!.toUpperCase()
    : "文件";
  return card(
    title,
    `${ext.slice(0, 12)} · ${fileSize(size)}`,
    `/media/${id}`,
    fileIcon(title),
    false,
  );
}
export function downloadIconPath(value: string) {
  return /^\/download-icons\/(?:file(?:-(?:archive|text|code|image|audio|video|spreadsheet|box))?\.svg|cloud-download\.svg|cloud-(?:baidu|quark|123pan)\.ico|cloud-alipan\.png|cloud-(?:baidu|alipan|quark|123pan)-appstore\.png)$/.test(
    value,
  );
}
