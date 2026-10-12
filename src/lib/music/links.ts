const platforms: Record<string, string> = {
  "music.163.com": "网易云音乐",
  "y.music.163.com": "网易云音乐",
  "163cn.tv": "网易云音乐",
  "y.qq.com": "QQ 音乐",
  "i.y.qq.com": "QQ 音乐",
  "i2.y.qq.com": "QQ 音乐",
  "c.y.qq.com": "QQ 音乐",
  "c6.y.qq.com": "QQ 音乐",
  "music.douyin.com": "汽水音乐",
  "qishui.douyin.com": "汽水音乐",
  "qishui.com": "汽水音乐",
  "www.qishui.com": "汽水音乐",
};
export function musicLink(value: string) {
  try {
    value = value.replace(/\\([:/.?&_=])/g, "$1");
    const match = value.match(/https:\/\/[^\s<>"，。）（)]+/);
    const url = new URL(match?.[0] ?? value);
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      !platforms[url.hostname]
    )
      return null;
    return { url: url.href, platform: platforms[url.hostname] };
  } catch {
    return null;
  }
}
