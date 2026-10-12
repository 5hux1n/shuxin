export function audioUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !/\.(mp3|m4a|aac|wav|ogg|opus|flac|aif|aiff|wma|mka|webm)$/i.test(
        url.pathname,
      ) ||
      !host.includes(".") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":") ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function playlistAudioUrl(value: string) {
  return /^\/media\/[a-f0-9-]{36}$/.test(value) ? value : audioUrl(value);
}
