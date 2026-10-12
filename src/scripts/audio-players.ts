export function bindAudioPlayers(root: ParentNode) {
  root
    .querySelectorAll<HTMLMediaElement>(
      ".audio-player audio, .audio-player video",
    )
    .forEach((audio) => {
      if (audio.dataset.bound) return;
      audio.dataset.bound = "true";
      const card = audio.closest<HTMLElement>(".audio-card");
      const button = card?.querySelector<HTMLButtonElement>(".music-play");
      const hint =
        audio.parentElement?.querySelector<HTMLElement>(".audio-error");
      const label = (playing: boolean) => {
        if (button) {
          button.textContent = playing ? "Ⅱ" : "▶";
          button.setAttribute("aria-label", playing ? "暂停音频" : "播放音频");
          button.title = playing ? "暂停音频" : "播放音频";
        }
      };
      audio.addEventListener("error", () => {
        if (hint) hint.hidden = false;
        label(false);
      });
      audio.addEventListener("play", () => {
        document
          .querySelectorAll<HTMLMediaElement>("audio,video")
          .forEach((other) => {
            if (other !== audio) other.pause();
          });
        label(true);
      });
      audio.addEventListener("pause", () => label(false));
      audio.addEventListener("ended", () => label(false));
      button?.addEventListener("click", async () => {
        if (!audio.paused) {
          audio.pause();
          return;
        }
        button.disabled = true;
        if (hint) hint.hidden = true;
        try {
          await audio.play();
        } catch {
          if (hint) hint.hidden = false;
          label(false);
        } finally {
          button.disabled = false;
        }
      });
    });
}
