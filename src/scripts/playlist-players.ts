import { csrf } from "./api";
import { playlistAudioUrl } from "../lib/audio/links";
import { safeCover } from "../lib/music/public";
export function bindPlaylistPlayers(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".playlist-player").forEach((figure) => {
    if (figure.dataset.bound) return;
    figure.dataset.bound = "true";
    const tracks = Array.from(
      figure.querySelectorAll<HTMLButtonElement>(".playlist-track"),
    );
    const main = figure.querySelector<HTMLButtonElement>(".playlist-play")!,
      message = figure.querySelector<HTMLElement>(".music-message")!;
    const repeat = figure.querySelector<HTMLButtonElement>(
      "[data-playlist-repeat]",
    )!;
    const toggle = figure.querySelector<HTMLButtonElement>(
      "[data-playlist-toggle]",
    )!;
    const list = figure.querySelector<HTMLOListElement>(".playlist-tracks")!;
    list.hidden = true;
    list.id = `playlist-${crypto.randomUUID()}`;
    toggle.setAttribute("aria-controls", list.id);
    toggle.addEventListener("click", () => {
      list.hidden = !list.hidden;
      toggle.setAttribute("aria-expanded", String(!list.hidden));
      const name = list.hidden ? "展开歌单" : "收起歌单";
      toggle.setAttribute("aria-label", name);
      toggle.title = name;
    });
    const player = document.createElement("audio");
    player.preload = "none";
    figure.append(player);
    const mute = figure.querySelector<HTMLButtonElement>(
      "[data-playlist-mute]",
    )!;
    player.addEventListener("volumechange", () => {
      mute.setAttribute("aria-pressed", String(player.muted));
      const name = player.muted ? "取消静音" : "静音";
      mute.setAttribute("aria-label", name);
      mute.title = name;
    });
    mute.addEventListener("click", () => {
      player.muted = !player.muted;
    });
    let index = 0,
      mode = 2,
      generation = 0,
      tried = 0,
      intended = false;
    const label = (playing: boolean) => {
      main
        .querySelector(".playlist-main-icon")!
        .classList.toggle("is-paused", playing);
      main.setAttribute("aria-label", playing ? "暂停歌单" : "播放歌单");
      tracks.forEach((track, i) => {
        const current = i === index && Boolean(player.getAttribute("src"));
        track.classList.toggle("current", current);
        if (current) track.setAttribute("aria-current", "true");
        else track.removeAttribute("aria-current");
        track
          .querySelector(".playlist-track-action")!
          .classList.toggle("is-paused", current && playing);
        track.setAttribute(
          "aria-label",
          `${current && playing ? "暂停" : "播放"} ${track.dataset.trackTitle}`,
        );
      });
    };
    const randomIndex = () =>
      tracks.length < 2
        ? index
        : (index + 1 + Math.floor(Math.random() * (tracks.length - 1))) %
          tracks.length;
    const nextIndex = () =>
      mode === 0
        ? index
        : mode === 1
          ? randomIndex()
          : index + 1 < tracks.length
            ? index + 1
            : -1;
    async function start(target: number, skip = false) {
      if (target < 0 || target >= tracks.length) {
        intended = false;
        label(false);
        return;
      }
      const run = ++generation;
      player.pause();
      player.removeAttribute("src");
      player.load();
      index = target;
      if (!skip) tried = 0;
      intended = true;
      main.disabled = true;
      message.textContent = "正在加载…";
      tracks.forEach((t, i) => {
        t.classList.toggle("current", i === index);
        t.setAttribute("aria-current", i === index ? "true" : "false");
      });
      const track = tracks[index],
        url = track.dataset.trackUrl!;
      figure.querySelector(".music-title")!.textContent =
        track.dataset.trackTitle!;
      figure.querySelector(".music-artist")!.textContent =
        track.dataset.trackArtist || "歌单";
      const cover = figure.querySelector<HTMLImageElement>(".music-cover")!;
      cover.src =
        safeCover(track.dataset.trackCover) || "/music-placeholder.webp";
      try {
        let source = playlistAudioUrl(url);
        if (!source) {
          const response = await fetch("/api/music/resolve", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrf(),
            },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(25000),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "解析失败");
          if (run !== generation) return;
          if (data.title)
            figure.querySelector(".music-title")!.textContent = data.title;
          if (data.artist)
            figure.querySelector(".music-artist")!.textContent = data.artist;
          if (safeCover(data.cover)) cover.src = safeCover(data.cover);
          source = data.audio;
          if (!source)
            throw new Error(
              data.iframe
                ? "此曲使用官方播放器，不能自动连播"
                : data.message || "没有公开音源",
            );
        }
        if (run !== generation) return;
        player.src = source!;
        await player.play();
        if (run !== generation) return;
        message.textContent = "";
        tried = 0;
      } catch (e) {
        if (run !== generation) return;
        message.textContent = `${track.dataset.trackTitle}：${(e as Error).message}`;
        label(false);
        tried++;
        // Stop after one traversal so unavailable lists never request forever.
        if (tried < tracks.length && mode !== 0) {
          const next = nextIndex();
          if (next >= 0) {
            void start(next, true);
            return;
          }
        }
        intended = false;
      } finally {
        if (run === generation) {
          main.disabled = false;
          label(!player.paused);
        }
      }
    }
    player.addEventListener("play", () => {
      document
        .querySelectorAll<HTMLMediaElement>("audio,video")
        .forEach((a) => {
          if (a !== player) a.pause();
        });
      label(true);
    });
    player.addEventListener("pause", () => label(false));
    player.addEventListener("ended", () => {
      if (intended) void start(nextIndex());
    });
    player.addEventListener("error", () => {
      message.textContent = "此音频无法播放，请切换下一首。";
      intended = false;
      label(false);
      main.disabled = false;
    });
    tracks.forEach((track) => {
      track.title = [track.dataset.trackTitle, track.dataset.trackArtist]
        .filter(Boolean)
        .join(" · ");
      const info = track.querySelector<HTMLElement>(".playlist-track-info")!;
      track.addEventListener("keydown", (event) => {
        if (
          (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
          info.scrollWidth > info.clientWidth
        ) {
          event.preventDefault();
          info.scrollLeft += event.key === "ArrowLeft" ? -80 : 80;
        }
      });
      const cover = track.querySelector<HTMLImageElement>(".music-cover")!;
      cover.src =
        safeCover(track.dataset.trackCover) || "/music-placeholder.webp";
    });
    coverFallback(figure);
    const togglePlayback = async () => {
      if (!player.paused) {
        intended = false;
        player.pause();
      } else if (player.getAttribute("src") && !player.error && !player.ended) {
        intended = true;
        try {
          await player.play();
        } catch {
          message.textContent = "播放未完成，请重试。";
        }
      } else void start(index);
    };
    main.addEventListener("click", togglePlayback);
    figure
      .querySelector("[data-playlist-prev]")!
      .addEventListener(
        "click",
        () => void start((index - 1 + tracks.length) % tracks.length),
      );
    figure
      .querySelector("[data-playlist-next]")!
      .addEventListener(
        "click",
        () =>
          void start(mode === 1 ? randomIndex() : (index + 1) % tracks.length),
      );
    repeat.addEventListener("click", () => {
      mode = (mode + 1) % 3;
      const name = ["单曲循环", "随机播放", "顺序播放"][mode];
      repeat.setAttribute("aria-label", `${name}，点击切换播放模式`);
      repeat.title = name;
      repeat.dataset.mode = String(mode);
    });
    tracks.forEach((t, i) =>
      t.addEventListener("click", () => {
        if (i === index && player.getAttribute("src") && !main.disabled)
          void togglePlayback();
        else void start(i);
      }),
    );
    const initialCover = safeCover(tracks[0]?.dataset.trackCover);
    if (initialCover)
      figure.querySelector<HTMLImageElement>(".music-cover")!.src =
        initialCover;
  });
}
function coverFallback(figure: HTMLElement) {
  figure.querySelectorAll<HTMLImageElement>(".music-cover").forEach((img) => {
    img.addEventListener("error", () => {
      if (!img.src.endsWith("/music-placeholder.webp"))
        img.src = "/music-placeholder.webp";
    });
  });
}
