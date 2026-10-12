import { z } from "zod";
import { musicLink } from "./links";
import { audioUrl, playlistAudioUrl } from "../audio/links";
import { HttpError } from "../http";
import {
  sharePage,
  publicText,
  object,
  array,
  text,
  embeddedJson,
  safeCover,
} from "./public";
const track = z.object({
  title: z.string().max(300).default("音频"),
  url: z
    .string()
    .max(2048)
    .refine(
      (v) => Boolean(playlistAudioUrl(v) || musicLink(v)),
      "歌单含不支持的链接",
    ),
  artist: z.string().max(300).default(""),
  cover: z
    .string()
    .max(2048)
    .default("")
    .transform((v) => safeCover(v)),
});
export const playlistSchema = z.object({
  title: z.string().max(120).default("歌单"),
  tracks: z.array(track).min(1).max(300),
  total: z.number().int().min(0).max(100000).optional(),
});
export type Playlist = z.infer<typeof playlistSchema>;
export function parsePlaylist(input: string) {
  const raw: unknown = JSON.parse(input);
  return playlistSchema.parse(Array.isArray(raw) ? { tracks: raw } : raw);
}
export async function importPlaylist(
  input: string,
  resolvedPage?: Awaited<ReturnType<typeof sharePage>>,
): Promise<Playlist> {
  const source = input.trim();
  if (source.startsWith("{") || source.startsWith("["))
    return parsePlaylist(source);
  if (source.includes("\n") || source.startsWith("#EXTM3U")) {
    let title = "";
    const tracks: Playlist["tracks"] = [];
    for (const line of source.split(/\r?\n/)) {
      if (line.startsWith("#EXTINF:")) {
        title = line.slice(line.indexOf(",") + 1).trim();
        continue;
      }
      if (!line.trim() || line.startsWith("#")) continue;
      const url = audioUrl(line.trim()) || musicLink(line.trim())?.url;
      if (!url)
        throw new HttpError(
          400,
          "歌单中有不支持的链接，请使用 HTTPS 音频直链或音乐分享链接",
        );
      tracks.push({
        url,
        title: title || musicLink(url)?.platform || "音频",
        artist: "",
        cover: "",
      });
      title = "";
    }
    return playlistSchema.parse({ tracks });
  }
  if (audioUrl(source))
    return playlistSchema.parse({ tracks: [{ url: source, title: "音频" }] });
  const page = resolvedPage ?? (await sharePage(source)),
    url = new URL(page.url);
  let total: number | undefined;
  let title = "歌单",
    tracks: Playlist["tracks"] = [];
  const add = (song: unknown, platform: string) => {
    const s = object(song);
    let link = "",
      name = "",
      artist = "",
      cover = "";
    if (platform === "网易云音乐") {
      if (!/^\d{1,20}$/.test(String(s.id))) return;
      link = `https://music.163.com/song?id=${s.id}`;
      name = text(s.name);
      artist = array(s.ar || s.artists)
        .map((a) => text(object(a).name))
        .join("、");
      cover = safeCover(object(s.al || s.album).picUrl);
    }
    if (platform === "QQ 音乐") {
      const mid = text(s.songmid || s.mid);
      if (!/^[a-zA-Z0-9]{14}$/.test(mid)) return;
      link = `https://y.qq.com/n/ryqq/songDetail/${mid}`;
      name = text(s.songname || s.name);
      artist = array(s.singer)
        .map((a) => text(object(a).name))
        .join("、");
      const album = text(s.albummid || object(s.album).mid);
      if (/^[a-zA-Z0-9]{14}$/.test(album))
        cover = `https://y.gtimg.cn/music/photo_new/T002R300x300M000${album}.jpg`;
    }
    if (link)
      tracks.push({ url: link, title: name || platform, artist, cover });
  };
  if (page.platform === "网易云音乐") {
    const id =
      url.searchParams.get("id") ||
      new URLSearchParams(url.hash.split("?")[1]).get("id");
    if (id && /^\d{1,20}$/.test(id) && /playlist/.test(url.href)) {
      const data = object(
          JSON.parse(
            await publicText(
              `https://music.163.com/api/playlist/detail?id=${id}`,
            ),
          ),
        ),
        p = object(data.result || data.playlist);
      title = text(p.name) || title;
      array(p.tracks)
        .slice(0, 300)
        .forEach((s) => add(s, page.platform));
    }
  } else if (page.platform === "QQ 音乐") {
    const id =
      url.searchParams.get("id") ||
      url.searchParams.get("disstid") ||
      url.pathname.match(/playlist\/(\d+)/)?.[1];
    if (id && /^\d{1,20}$/.test(id)) {
      const data = object(
          JSON.parse(
            await publicText(
              `https://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?disstid=${id}&type=1&json=1&utf8=1&onlysong=0&format=json`,
              { headers: { Referer: "https://y.qq.com/" } },
            ),
          ),
        ),
        p = object(array(data.cdlist)[0]);
      title = text(p.dissname) || title;
      array(p.songlist)
        .slice(0, 300)
        .forEach((s) => add(s, page.platform));
    }
  } else if (page.platform === "汽水音乐") {
    const loader = object(
      object(embeddedJson(page.html, "_ROUTER_DATA =")).loaderData,
    );
    const p =
      Object.values(loader)
        .map(object)
        .find((v) => v.playlist || v.playlistInfo) || {};
    const list = object(p.playlist || p.playlistInfo);
    title = text(list.title) || title;
    if (typeof list.count_tracks === "number") total = list.count_tracks;
    array(list.tracks || p.tracks || p.medias)
      .slice(0, 300)
      .forEach((v) => {
        const s = object(
            object(object(v).entity).track || object(v).track || v,
          ),
          id = String(s.id || "");
        if (/^\d{1,20}$/.test(id))
          tracks.push({
            title: text(s.name) || "汽水音乐",
            artist: array(s.artists)
              .map((a) => text(object(a).name))
              .join("、"),
            cover:
              safeCover(object(s.album).cover) ||
              (() => {
                const image = object(object(s.album).url_cover);
                return safeCover(
                  text(array(image.urls)[0]) +
                    text(image.uri) +
                    "~c5_300x300.jpg",
                );
              })(),
            url: `https://music.douyin.com/qishui/share/track?track_id=${id}`,
          });
      });
  }
  if (!tracks.length)
    throw new HttpError(
      422,
      "此歌单没有返回公开曲目，请导出 M3U / JSON，或粘贴多行歌曲链接导入",
    );
  tracks = tracks.filter(
    (s, i) => tracks.findIndex((t) => t.url === s.url) === i,
  );
  return playlistSchema.parse({ title: title.slice(0, 120), tracks, total });
}
