import localizedPacks from "./sticker-assets.json";
const originalPacks = [
  {
    name: "猫猫",
    items: [
      { id: "cat-happy", label: "好耶" },
      { id: "cat-ok", label: "收到" },
      { id: "cat-sleep", label: "晚安" },
      { id: "cat-wow", label: "哇" },
    ],
  },
  {
    name: "兔兔",
    items: [
      { id: "rabbit-happy", label: "开心" },
      { id: "rabbit-love", label: "喜欢" },
      { id: "rabbit-cheer", label: "加油" },
      { id: "rabbit-thanks", label: "谢谢" },
    ],
  },
  {
    name: "日常",
    items: [
      { id: "daily-coffee", label: "喝杯咖啡" },
      { id: "daily-work", label: "努力中" },
      { id: "daily-break", label: "休息一下" },
      { id: "daily-done", label: "搞定" },
    ],
  },
];
export const stickerPacks = [
  ...localizedPacks.map(pack => ({ ...pack, items: pack.items.map(item => ({
    ...item,
    code: item.id.replace(/-(\d+)$/, (_match, number: string) => String(Number(number)).padStart(2, "0")),
  })) })),
];
// Keep existing posts readable after retiring the original packs from the picker.
const paths = new Set([
  ...stickerPacks.flatMap(pack => pack.items.map(item => item.src)),
  ...originalPacks.flatMap(pack => pack.items.map(item => `/stickers/${item.id}.svg`)),
]);
const codes = new Map(stickerPacks.flatMap(pack => pack.items.map(item => [item.code, item] as const)));
const itemsByPath = new Map([
  ...stickerPacks.flatMap(pack => pack.items.map(item => [item.src, { src: item.src, label: item.label }] as const)),
  ...originalPacks.flatMap(pack => pack.items.map(item => [`/stickers/${item.id}.svg`, { src: `/stickers/${item.id}.svg`, label: item.label }] as const)),
]);
export const stickerByPath = (src: string) => itemsByPath.get(src);
export const stickerCode = (code: string) => codes.get(code);
export const stickerPath = (src: string) => paths.has(src);
export const smallSticker = (src: string) => src.startsWith("/stickers/wechat/") && paths.has(src);
