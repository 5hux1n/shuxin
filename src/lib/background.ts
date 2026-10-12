export function backgroundUrl(value: string) {
  try {
    const url = new URL(value),
      host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !host.includes(".") ||
      host === "localhost" ||
      /[[:\]]/.test(host) ||
      /^[\d.]+$/.test(host) ||
      /\.(local|internal|localhost|test|invalid)$/.test(host)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export interface BackgroundSettings {
  backgroundId: string;
  backgroundMode: string;
  backgroundUrl: string;
  backgroundApiType: string;
  backgroundApiField: string;
  backgroundOpacity: string;
}
export function backgroundSource(site: BackgroundSettings) {
  if (site.backgroundMode === "bing") return "/api/background/bing";
  if (site.backgroundMode === "image" || site.backgroundMode === "api")
    return backgroundUrl(site.backgroundUrl) ?? "";
  return site.backgroundId ? `/media/${site.backgroundId}` : "";
}
