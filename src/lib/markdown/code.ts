import { renderExternalDownload } from "../downloads";
import hljs from "highlight.js/lib/common";
import { parsePlaylist } from "../music/playlist";
export function playlistTrackTitle(value: string) {
  return (
    value
      .replace(
        /(?:\s*[·|—–-]\s*|\.|\s*[（(])(?:mp3|flac|m4a|ogg|wav|wma|aac|opus|aiff|alac|webm|mka)[）)]?$/i,
        "",
      )
      .trim() || value
  );
}
export function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function numberedLines(html: string) {
  const open: string[] = [];
  const lines: string[] = [];
  let line = "";
  for (const token of html.split(/(<span\b[^>]*>|<\/span>|\n)/)) {
    if (token === "\n") {
      lines.push(line + "</span>".repeat(open.length));
      line = open.join("");
    } else {
      line += token;
      if (token.startsWith("<span")) open.push(token);
      else if (token === "</span>") open.pop();
    }
  }
  lines.push(line + "</span>".repeat(open.length));
  return lines
    .map((v, i) => `<span class="code-line" data-line="${i + 1}">${v}</span>`)
    .join("");
}
export function renderCode(code: string, lang: string) {
  if (lang === "download") {
    try {
      return renderExternalDownload(JSON.parse(code));
    } catch {
      /* Invalid download content remains a code block. */
    }
  }
  if (lang === "playlist") {
    try {
      const list = parsePlaylist(code);
      return `<figure class="playlist-player"><div class="music-card"><img class="music-cover" src="/music-placeholder.webp" alt="" loading="lazy"><div class="music-info"><figcaption class="music-title">${escape(list.title)}</figcaption><span class="music-artist">${list.tracks.length} 首歌曲</span><div class="playlist-controls"><button type="button" class="playlist-control" data-playlist-prev aria-label="上一首" title="上一首"><span class="playlist-prev" aria-hidden="true"></span></button><button type="button" class="playlist-control" data-playlist-next aria-label="下一首" title="下一首"><span class="playlist-next" aria-hidden="true"></span></button><button type="button" class="playlist-control" data-playlist-toggle aria-expanded="false" aria-label="展开歌单" title="展开歌单"><span class="playlist-list-icon" aria-hidden="true"></span></button><button type="button" class="playlist-control" data-playlist-mute aria-pressed="false" aria-label="静音" title="静音"><span class="playlist-volume-icon" aria-hidden="true"></span></button><button type="button" class="playlist-control" data-playlist-repeat data-mode="2" aria-label="顺序播放，点击切换播放模式" title="顺序播放"><span class="playlist-repeat-icon" aria-hidden="true"></span></button></div></div><button class="music-play playlist-play" type="button" aria-label="播放歌单"><span class="playlist-main-icon" aria-hidden="true"></span></button></div><ol class="playlist-tracks" hidden="hidden" aria-label="歌单曲目">${list.tracks.map((s, i) => `<li><button type="button" class="playlist-track" data-track-url="${escape(s.url)}" data-track-title="${escape(playlistTrackTitle(s.title))}" data-track-artist="${escape(s.artist)}" data-track-cover="${escape(s.cover)}" aria-label="播放 ${escape(playlistTrackTitle(s.title))}"><span class="playlist-number" aria-hidden="true">${i + 1}</span><img class="music-cover" src="/music-placeholder.webp" alt="" loading="lazy"><span class="playlist-track-info"><span class="playlist-track-title">${escape(playlistTrackTitle(s.title))}</span>${s.artist ? `<span class="playlist-track-artist"> · ${escape(s.artist)}</span>` : ""}</span><span class="playlist-track-action" aria-hidden="true"></span></button></li>`).join("")}</ol><p class="music-message" aria-live="polite"></p></figure>`;
    } catch {
      /* Invalid playlist content remains a readable code block. */
    }
  }
  const language = lang.split(/\s/)[0].toLowerCase();
  const html =
    code.length <= 20000 && hljs.getLanguage(language)
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : escape(code);
  return `<div class="code-block"><div class="code-tools"><span class="code-language">${escape(language || "text")}</span><button type="button" class="code-copy" data-code-copy aria-label="复制代码">复制</button><button type="button" class="code-wrap" data-code-wrap aria-pressed="false">换行</button></div><pre><code class="hljs">${numberedLines(html)}</code></pre></div>`;
}
