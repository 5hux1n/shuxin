import { eq } from "drizzle-orm";
import { db } from "../db";
import { media } from "../db/schema";
import { localMediaId } from "../media/references";
import {
  downloadProvider,
  downloadUrl,
  downloadIconPath,
  renderExternalDownload,
} from "../downloads";
import { renderCode } from "./code";
import { stickerPath, smallSticker, stickerCode } from "./stickers";
import { musicLink } from "../music/links";
import { audioUrl } from "../audio/links";
import { Marked, Renderer } from "marked";
import sanitizeHtml from "sanitize-html";
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}
function localMedia(url: string) {
  const id = localMediaId(url);
  return id ? db.select().from(media).where(eq(media.id, id)).get() : undefined;
}
function localImage(url: string) { return !!localMedia(url)?.mime.startsWith("image/"); }
const markdown = new Marked({
  extensions: [{
    name: "sticker-code",
    level: "inline",
    start: source => source.search(/:[a-z]+\d{2,4}:/),
    tokenizer(source) {
      const match = /^:([a-z]+\d{2,4}):/.exec(source);
      const item = match && stickerCode(match[1]);
      if (match && item) return { type: "sticker-code", raw: match[0], src: item.src, label: item.label };
    },
    renderer: token => `<img class="inline-sticker" src="${escape(token.src)}" alt="${escape(token.label)}" loading="lazy">`,
  }],
});
export function renderMarkdown(source: string) {
  const renderer = new Renderer();
  renderer.image = token => {
    if (stickerPath(token.href)) return `<img class="inline-sticker" src="${token.href}" alt="${escape(token.text)}" loading="lazy">`;
    if (localImage(token.href)) return `<img class="media-image" src="${escape(token.href)}" alt="${escape(token.text)}" loading="lazy">`;
    return "";
  };
  renderer.code = (token) => renderCode(token.text, token.lang || "");
  const paragraph = renderer.paragraph;
  renderer.paragraph = function (token) {
    const link = token.tokens.length === 1 ? token.tokens[0] : null;
    const resource = link?.type === "link" ? localMedia(link.href) : undefined;
    if (resource && link?.type === "link") {
      const title = escape(link.text || resource.alt || "媒体");
      if (resource.mime.startsWith("video/"))
        return `<figure class="audio-player video-player"><figcaption>${title}</figcaption><video src="${escape(link.href)}" controls playsinline preload="none" aria-label="${title}"></video><p class="audio-error" hidden="hidden">当前浏览器无法播放此视频。</p></figure>`;
      if (resource.mime.startsWith("audio/"))
        return `<figure class="audio-player audio-card"><div class="music-card"><img class="music-cover" src="/music-placeholder.webp" alt="" loading="lazy"><div class="music-info"><figcaption class="music-title">${title}</figcaption><span class="music-artist">音频</span></div><button class="music-play" type="button" aria-label="播放音频" title="播放音频">▶</button></div><audio src="${escape(link.href)}" preload="none" aria-label="${title}"></audio><p class="audio-error" hidden="hidden">音频暂时无法播放，请稍后重试。</p></figure>`;
    }
    if (
      link?.type === "link" &&
      downloadUrl(link.href) &&
      downloadProvider(link.href)
    )
      return renderExternalDownload({ url: link.href, title: link.text });
    const music = link?.type === "link" ? musicLink(link.href) : null;
    if (music && link?.type === "link")
      return `<figure class="music-player" data-music-url="${escape(music.url)}"><div class="music-card"><img class="music-cover" src="/music-placeholder.webp" alt="" loading="lazy"><div class="music-info"><figcaption class="music-title">${escape(link.text || music.platform)}</figcaption><span class="music-artist">${escape(music.platform)}</span></div><button class="music-play" type="button" aria-label="播放音乐" title="播放音乐">▶</button></div><p class="music-message" aria-live="polite"></p></figure>`;
    const url = link?.type === "link" ? audioUrl(link.href) : null;
    if (url && link?.type === "link")
      return `<figure class="audio-player audio-card"><div class="music-card"><img class="music-cover" src="/music-placeholder.webp" alt="" loading="lazy"><div class="music-info"><figcaption class="music-title">${escape(link.text || "音频")}</figcaption><span class="music-artist">音频外链</span></div><button class="music-play" type="button" aria-label="播放音频" title="播放音频">▶</button></div><audio src="${escape(url)}" preload="none" aria-label="${escape(link.text || "音频")}"></audio><p class="audio-error" hidden="hidden">音频暂时无法播放，请稍后重试。</p></figure>\n`;
    return paragraph.call(this, token);
  };
  return sanitizeHtml(
    markdown.parse(source, {
      async: false,
      gfm: true,
      breaks: true,
      renderer,
    }) as string,
    {
      allowedTags: [
        "figure",
        "figcaption",
        "audio",
        "video",
        "div",
        "span",
        "img",
        "input",
        "button",
        "p",
        "br",
        "strong",
        "em",
        "del",
        "a",
        "ul",
        "ol",
        "li",
        "blockquote",
        "pre",
        "code",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
      ],
      allowedAttributes: {
        video: ["src", "controls", "playsinline", "preload", "aria-label"],
        a: [
          "href",
          "title",
          "rel",
          "class",
          "target",
          "download",
          "aria-label",
        ],
        figure: ["class", "data-music-url"],
        audio: ["src", "controls", "preload", "aria-label"],
        p: ["class", "hidden", "aria-live"],
        button: [
          "type",
          "class",
          "aria-label",
          "title",
          "aria-pressed",
          "data-code-copy",
          "data-code-wrap",
          "data-playlist-prev",
          "data-playlist-next",
          "data-playlist-repeat",
          "data-playlist-mute",
          "data-playlist-toggle",
          "data-mode",
          "aria-expanded",
          "data-track-url",
          "data-track-title",
          "data-track-artist",
          "data-track-cover",
        ],
        div: ["class"],
        span: ["class", "data-line", "aria-hidden"],
        img: ["src", "alt", "class", "loading"],
        input: ["type", "disabled", "checked"],
        figcaption: ["class"],
        code: ["class"],
        ol: ["class", "hidden", "aria-label"],
        th: ["align"],
        td: ["align"],
      },
      allowedClasses: {
        figure: [
          "audio-player",
          "audio-card",
          "video-player",
          "music-player",
          "playlist-player",
        ],
        div: [
          "music-card",
          "music-info",
          "download-card",
          "download-info",
          "playlist-controls",
          "code-block",
          "code-tools",
        ],
        span: [
          "music-artist",
          "code-language",
          "code-line",
          "hljs-*",
          "playlist-*",
          "download-*",
        ],
        code: ["hljs", "language-*"],
        ol: ["playlist-tracks"],
        img: ["music-cover", "inline-sticker", "native-emoji", "media-image", "download-cover"],
        figcaption: ["music-title"],
        button: [
          "music-play",
          "playlist-play",
          "playlist-track",
          "playlist-control",
          "button",
          "code-copy",
          "code-wrap",
        ],
        a: ["audio-download", "download-action"],
        p: ["audio-error", "music-message"],
      },
      exclusiveFilter: (frame) =>
        frame.tag === "img" &&
        frame.attribs.src !== "/music-placeholder.webp" &&
        !stickerPath(frame.attribs.src) &&
        !localImage(frame.attribs.src || "") &&
        !downloadIconPath(frame.attribs.src || ""),
      allowedSchemes: ["http", "https", "mailto"],
      allowProtocolRelative: false,
      transformTags: {
        input: (_tag, attrs) => ({
          tagName: "input",
          attribs: {
            type: "checkbox",
            disabled: "disabled",
            ...("checked" in attrs ? { checked: "checked" } : {}),
          },
        }),
        img: (_tag, attrs) => ({
          tagName: "img",
          attribs: {
            src: localImage(attrs.src || "") ? attrs.src : downloadIconPath(attrs.src || "")
              ? attrs.src
              : stickerPath(attrs.src || "")
                ? attrs.src
                : attrs.class === "music-cover" &&
                    attrs.src === "/music-placeholder.webp"
                  ? "/music-placeholder.webp"
                  : "",
            alt: localImage(attrs.src || "") ? attrs.alt || "" : stickerPath(attrs.src || "") ? attrs.alt || "表情" : "",
            class: localImage(attrs.src || "") ? "media-image" : downloadIconPath(attrs.src || "")
              ? "download-cover"
              : stickerPath(attrs.src || "")
                ? (smallSticker(attrs.src) ? "inline-sticker native-emoji" : "inline-sticker")
                : "music-cover",
            loading: "lazy",
          },
        }),
        audio: (_tag, attrs) => ({
          tagName: "audio",
          attribs: {
            ...attrs,
            src: localMedia(attrs.src || "")?.mime.startsWith("audio/") ? attrs.src : audioUrl(attrs.src ?? "") ?? "",
            controls: "",
            preload: "none",
          },
        }),
        video: (_tag, attrs) => ({
          tagName: "video", attribs: {
            src: localMedia(attrs.src || "")?.mime.startsWith("video/") ? attrs.src : "",
            controls: "", playsinline: "", preload: "none", "aria-label": attrs["aria-label"] || "视频",
          },
        }),
        a: sanitizeHtml.simpleTransform("a", {
          rel: "noopener noreferrer nofollow",
        }),
      },
    },
  );
}
export function plainText(source: string, includeStickers = false) {
  const rendered = renderMarkdown(source)
    .replace(/<div class="code-tools">[\s\S]*?<\/div>/g, "")
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/g, "")
    .replace(/<span class="code-line"/g, '\n<span class="code-line"')
    .replace(/<img\b[^>]*>/g, tag => {
      if (!includeStickers || !/class="[^"]*\binline-sticker\b/.test(tag)) return tag;
      const alt = /\balt="([^"]*)"/.exec(tag)?.[1] || "表情";
      return ` [${alt}] `;
    });
  return sanitizeHtml(rendered, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, " ")
    .trim();
}
export function xml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
