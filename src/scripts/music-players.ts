import { csrf } from "./api";
import { safeCover } from "../lib/music/public";
interface MusicDetails {
  title?: string;
  artist?: string;
  cover?: string;
  platform: string;
  audio?: string;
  iframe?: string;
  error?: string;
  message?: string;
}
const metadataCache = new Map<
  string,
  { created: number; request: Promise<MusicDetails> }
>();
export function bindMusicPlayers(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".music-player").forEach((figure) => {
    const button = figure.querySelector<HTMLButtonElement>(".music-play");
    if (!button || button.dataset.bound) return;
    button.dataset.bound = "true";
    const message = figure.querySelector<HTMLElement>(".music-message")!;
    let player: HTMLAudioElement | null = null,
      busy = false;
    const label = (playing: boolean) => {
      button.textContent = playing ? "Ⅱ" : "▶";
      button.setAttribute("aria-label", playing ? "暂停音乐" : "播放音乐");
      button.title = playing ? "暂停音乐" : "播放音乐";
    };
    async function details() {
      const url = figure.dataset.musicUrl!;
      const cached = metadataCache.get(url);
      let request =
        cached && Date.now() - cached.created < 120_000
          ? cached.request
          : undefined;
      if (!request) {
        request = (async () => {
          const res = await fetch("/api/music/resolve", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrf(),
            },
            body: JSON.stringify({ url: url }),
            signal: AbortSignal.timeout(30000),
          });
          const data = (await res.json()) as MusicDetails;
          if (!res.ok) throw new Error(data.error || "加载失败");
          return data;
        })();
        metadataCache.set(url, { created: Date.now(), request });
        if (metadataCache.size > 128)
          metadataCache.delete(metadataCache.keys().next().value!);
        request.catch(() => metadataCache.delete(url));
      }
      const data = await request;
      if (data.title)
        figure.querySelector(".music-title")!.textContent = data.title;
      figure.querySelector(".music-artist")!.textContent =
        data.artist || data.platform;
      const cover = figure.querySelector<HTMLImageElement>(".music-cover")!;
      if (data.cover && safeCover(data.cover)) {
        cover.addEventListener(
          "error",
          () => {
            cover.src = "/music-placeholder.webp";
          },
          { once: true },
        );
        cover.referrerPolicy = "no-referrer";
        cover.src = data.cover;
      }
      return data;
    }
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            void details().catch(() => undefined);
          }
        },
        { rootMargin: "200px" },
      );
      observer.observe(figure);
    }
    button.addEventListener("click", async () => {
      if (busy) return;
      if (player) {
        if (player.paused) {
          try {
            await player.play();
          } catch (error) {
            message.textContent = (error as Error).message;
          }
        } else player.pause();
        return;
      }
      busy = true;
      button.disabled = true;
      message.textContent = "正在加载…";
      try {
        const data = await details();
        if (data.audio) {
          player = document.createElement("audio");
          player.src = data.audio;
          player.preload = "none";
          figure.append(player);
          player.addEventListener("play", () => {
            document
              .querySelectorAll<HTMLMediaElement>("audio,video")
              .forEach((other) => {
                if (other !== player) other.pause();
              });
            label(true);
          });
          player.addEventListener("pause", () => label(false));
          player.addEventListener("ended", () => label(false));
          player.addEventListener("error", () => {
            message.textContent = "此音频暂时无法播放，请稍后重试。";
            metadataCache.delete(figure.dataset.musicUrl!);
            player?.remove();
            player = null;
            label(false);
          });
          await player.play();
          message.textContent = "";
        } else if (data.iframe) {
          const url = new URL(data.iframe);
          if (
            url.origin !== "https://music.163.com" ||
            url.pathname !== "/outchain/player"
          )
            throw new Error("播放器地址无效");
          const frame = document.createElement("iframe");
          frame.src = url.href;
          frame.title = "网易云音乐播放器";
          frame.height = "86";
          frame.referrerPolicy = "no-referrer";
          frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
          figure.append(frame);
          button.hidden = true;
          message.textContent = "";
        } else message.textContent = data.message || "此歌曲暂不支持站内播放。";
      } catch (error) {
        message.textContent = (error as Error).message;
      } finally {
        busy = false;
        button.disabled = false;
      }
    });
  });
}
