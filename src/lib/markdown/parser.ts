import { Marked } from "marked";
import markedFootnote from "marked-footnote";
import { stickerCode } from "./stickers";
export function markdownParser(prefixId = "shuxin-footnote-") {
  return new Marked({
    gfm: true,
    breaks: true,
    extensions: [{
      name: "sticker-code",
      level: "inline",
      start: source => source.search(/:[a-z]+\d{2,4}:/),
      tokenizer(source) {
        const match = /^:([a-z]+\d{2,4}):/.exec(source);
        const item = match && stickerCode(match[1]);
        if (match && item) return { type: "sticker-code", raw: match[0], src: item.src, label: item.label };
      },
      renderer: token => `<img class="inline-sticker" src="${token.src}" alt="${String(token.label).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[char]!)}" loading="lazy">`,
    }],
  }).use(markedFootnote({ prefixId, description: "注释", headingClass: "footnotes-label", refMarkers: true, backRefLabel: "返回正文注释" }));
}
