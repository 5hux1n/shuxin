import {
  sharePage,
  embeddedJson,
  object,
  array,
  text,
  pageMeta,
  safeCover,
  trustedUrl,
  audioHosts,
  optionalJson,
} from "./public";
export interface MusicDetails {
  title: string;
  artist: string;
  cover: string;
  platform: string;
  url: string;
  audio?: string;
  iframe?: string;
  message: string;
}
export async function resolveMusic(
  value: string,
  resolvedPage?: Awaited<ReturnType<typeof sharePage>>,
): Promise<MusicDetails> {
  const page = resolvedPage ?? (await sharePage(value));
  const parsed = new URL(page.url);
  const title =
    pageMeta(page.html, "og:title") ||
    page.html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    "";
  const parts = title.split(/\s+-\s+|_/);
  const info: MusicDetails = {
    title:
      /千万正版|高品质音乐平台|就是歌多|汽水音乐官网/.test(title) ||
      /^[\s-–—]*$/.test(parts[0])
        ? ""
        : parts[0].replace(/^《|》@汽水音乐$/g, ""),
    artist:
      pageMeta(page.html, "music:musician") ||
      (parts.length >= 3 ? parts[1] : ""),
    cover: safeCover(pageMeta(page.html, "og:image")),
    platform: page.platform,
    url: page.url,
    message: "此歌曲暂不支持站内播放",
  };
  if (page.platform === "网易云音乐") {
    const id =
      parsed.searchParams.get("id") ??
      new URLSearchParams(parsed.hash.split("?")[1]).get("id");
    if (id && /^\d{1,20}$/.test(id)) {
      const headers = { Referer: "https://music.163.com/" };
      const [metadata, playback] = await Promise.all([
        optionalJson(
          `https://music.163.com/api/song/detail?ids=${encodeURIComponent(JSON.stringify([id]))}`,
          { headers },
        ),
        optionalJson("https://music.163.com/api/song/enhance/player/url", {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            ids: JSON.stringify([id]),
            br: "128000",
          }).toString(),
        }),
      ]);
      const song = object(array(metadata.songs)[0]),
        stream = object(array(playback.data)[0]);
      info.title = text(song.name) || info.title;
      info.artist =
        array(song.artists || song.ar)
          .map((artist) => text(object(artist).name))
          .filter(Boolean)
          .join("、") || info.artist;
      info.cover =
        safeCover(object(song.album || song.al).picUrl) || info.cover;
      info.url = `https://music.163.com/song?id=${id}`;
      info.audio =
        trustedUrl(stream.url, audioHosts[page.platform]) || undefined;
      if (info.audio)
        info.message = stream.freeTrialInfo
          ? "平台提供的试听片段"
          : "平台提供的公开音源";
      else {
        info.iframe = `https://music.163.com/outchain/player?type=2&id=${id}&auto=0&height=66`;
        info.message = "平台未提供公开音源，是否可播放由官方播放器决定";
      }
      return info;
    }
  }
  if (page.platform === "汽水音乐") {
    const loader = object(
      object(embeddedJson(page.html, "_ROUTER_DATA =")).loaderData,
    );
    const option = object(object(loader.track_page).audioWithLyricsOption);
    info.title = text(option.trackName) || info.title;
    info.artist = text(option.artistName) || info.artist;
    info.cover = safeCover(option.coverURL) || info.cover;
    if (option.encrypt === false)
      info.audio =
        trustedUrl(option.url, audioHosts[page.platform]) || undefined;
  }
  if (page.platform === "QQ 音乐") {
    const mid =
      parsed.pathname.match(
        /(?:songDetail\/|song\/|song\/.*?)([a-zA-Z0-9]{14})(?:\.html)?/,
      )?.[1] || parsed.searchParams.get("songmid");
    if (mid && /^[a-zA-Z0-9]{14}$/.test(mid)) {
      const data = await optionalJson(
        `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=${mid}&format=json`,
        { headers: { Referer: "https://y.qq.com/" } },
      );
      const song = object(array(data.data)[0]);
      info.title = text(song.name) || info.title;
      info.artist = array(song.singer)
        .map((s) => text(object(s).name))
        .filter(Boolean)
        .join("、");
      const album = text(object(song.album).mid);
      if (/^[a-zA-Z0-9]{14}$/.test(album))
        info.cover = `https://y.gtimg.cn/music/photo_new/T002R300x300M000${album}.jpg`;
      const media = text(object(song.file).media_mid),
        mediaMid = /^[a-zA-Z0-9]{14}$/.test(media) ? media : mid;
      const key = await optionalJson("https://u.y.qq.com/cgi-bin/musicu.fcg", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Referer: "https://y.qq.com/",
        },
        body: JSON.stringify({
          comm: { ct: 24, cv: 0, format: "json" },
          req_1: {
            module: "music.vkey.GetVkey",
            method: "UrlGetVkey",
            param: {
              guid: String(crypto.getRandomValues(new Uint32Array(1))[0]),
              songmid: [mid, mid],
              songtype: [0, 0],
              filename: [
                `M500${mid}${mediaMid}.mp3`,
                `C400${mid}${mediaMid}.m4a`,
              ],
              uin: "0",
              loginflag: 0,
              platform: "20",
            },
          },
        }),
      });
      const vkey = object(object(key.req_1).data);
      const hosts = array(vkey.sip)
        .map((host) => trustedUrl(host, audioHosts[page.platform]))
        .filter(Boolean);
      for (const entry of array(vkey.midurlinfo)) {
        const candidate = object(entry).purl;
        if (typeof candidate !== "string" || !candidate) continue;
        for (const host of hosts) {
          const audio = trustedUrl(
            new URL(candidate, host).href,
            audioHosts[page.platform],
          );
          if (audio) {
            info.audio = audio;
            break;
          }
        }
        if (info.audio) break;
      }
      if (!info.audio && object(song.pay).pay_play === 1)
        info.message = "此歌曲需要平台授权，暂无公开音源";
      else if (!info.audio)
        info.message = "平台未向未登录访客提供音源，可能需要登录或受地区限制";
    }
  }
  if (!info.audio) {
    const html = page.html
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&");
    for (const candidate of html.matchAll(
      /(?:<audio[^>]*src=["']|["'](?:play_url|playUrl|audio_url|audioUrl|preview_url|previewUrl)["']\s*:\s*["'])(https:\/\/[^"'<>\s]+)/gi,
    )) {
      const audio = trustedUrl(candidate[1], audioHosts[page.platform]);
      if (audio) {
        info.audio = audio;
        break;
      }
    }
  }
  if (info.audio) info.message = "公开分享页音源，可能为试听片段";
  return info;
}
