import { downloadProvider, downloadUrl } from "../downloads";
import { marked } from "marked";
import { plainText, renderMarkdown } from "../markdown";
import { stickerByPath } from "../markdown/stickers";
import { musicLink } from "../music/links";
import { audioUrl } from "../audio/links";

export function adminPreview(source: string) {
  const text = (value: string) => plainText(value, true);
  const stickers = Array.from(renderMarkdown(source).matchAll(/<img\b[^>]*>/g))
    .map(match => stickerByPath(/\bsrc="([^"]+)"/.exec(match[0])?.[1] || ""))
    .filter((item): item is NonNullable<typeof item> => !!item);
  const onlyStickers = stickers.length > 0 && !plainText(source);
  const blocks = marked.lexer(source).filter((token) => token.type !== "space");
  const first = blocks[0];
  const singleLink = (token: (typeof blocks)[number]) =>
    token.type === "paragraph" &&
    token.tokens?.length === 1 &&
    token.tokens[0].type === "link"
      ? token.tokens[0]
      : null;
  const firstLink = first ? singleLink(first) : null;
  const opening = firstLink
    ? text(firstLink.text)
    : first &&
        ["heading", "paragraph", "blockquote"].includes(first.type) &&
        "text" in first &&
        typeof first.text === "string"
      ? text(first.text.split("\n")[0])
      : "";
  const shorten = (value: string, length: number) =>
    value.length > length ? value.slice(0, length).trimEnd() + "…" : value;
  const paragraphs = blocks
    .filter((token, index) => !(index === 0 && token.type === "heading"))
    .filter((token) =>
      ["paragraph", "blockquote", "list", "table"].includes(token.type),
    )
    .filter((token) => {
      const link = singleLink(token);
      return (
        !link ||
        !(
          musicLink(link.href) ||
          audioUrl(link.href) ||
          (downloadUrl(link.href) && downloadProvider(link.href))
        )
      );
    })
    .map((token) => text(token.raw))
    .filter((text) => text && text !== opening);
  return {
    title: onlyStickers ? "表情动态" : shorten(opening, 72),
    summary: shorten(onlyStickers ? text(source) : paragraphs[0] || "", 160),
    stickers,
    playlist: blocks.some(
      (token) => token.type === "code" && token.lang === "playlist",
    ),
    download: blocks.some(
      (token) =>
        (token.type === "code" && token.lang === "download") ||
        (singleLink(token) &&
          downloadUrl(singleLink(token)!.href) &&
          downloadProvider(singleLink(token)!.href)),
    ),
    code: blocks.some(
      (token) =>
        token.type === "code" &&
        token.lang !== "playlist" &&
        token.lang !== "download",
    ),
  };
}
