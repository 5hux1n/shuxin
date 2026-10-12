import { audioUrl } from "../audio/links";
import { musicLink } from "./links";
import { sharePage, embeddedJson, object } from "./public";
import { importPlaylist } from "./playlist";
import { resolveMusic } from "./resolve";
import { HttpError } from "../http";
export async function importMusic(input: string) {
  const source = input.trim().replace(/\\([:/.?&_=])/g, "$1");
  const lines = source
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"));
  if (
    /^[{[]/.test(source) ||
    source.startsWith("#EXTM3U") ||
    (lines.length > 1 &&
      lines.every((line) => audioUrl(line.trim()) || musicLink(line.trim())))
  )
    return {
      kind: "playlist" as const,
      playlist: await importPlaylist(source),
    };
  const direct =
    audioUrl(source) ||
    audioUrl(source.match(/https:\/\/[^\s<>"，。）（)]+/)?.[0] ?? "");
  if (direct) return { kind: "audio" as const, url: direct, title: "音频" };
  const music = musicLink(source);
  if (!music)
    throw new HttpError(400, "请填写音频 HTTPS 链接、歌曲分享或歌单链接");
  const page = await sharePage(music.url),
    url = new URL(page.url);
  const loader = object(
    object(embeddedJson(page.html, "_ROUTER_DATA =")).loaderData,
  );
  const isPlaylist =
    /playlist|disst/i.test(url.pathname + url.hash) ||
    ["disstid", "playlist_id", "playlistId"].some((key) =>
      url.searchParams.has(key),
    ) ||
    Object.values(loader).some((value) => {
      const data = object(value);
      return Boolean(data.playlist || data.playlistInfo);
    });
  if (isPlaylist)
    return {
      kind: "playlist" as const,
      playlist: await importPlaylist(music.url, page),
    };
  const details = await resolveMusic(music.url, page);
  return {
    kind: "music" as const,
    url: details.url,
    title: details.title || music.platform,
  };
}
