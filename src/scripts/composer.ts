import { bindLibrary } from "./file-library";
import { bindCategories } from "./categories";
import {
  downloadFromShare,
  fileIcon,
  fileName,
  fileSize,
  renderFileDownload,
} from "../lib/downloads";
import type { Playlist } from "../lib/music/playlist";
import { bindCodeBlocks } from "./code-blocks";
import { bindPlaylistPlayers } from "./playlist-players";
import { bindMusicPlayers } from "./music-players";
import { bindAudioPlayers } from "./audio-players";
import { api, notice, uploadImage, uploadLivePhoto, uploadAudio } from "./api";
export function bindComposer() {
const composer = document.querySelector<HTMLFormElement>("#composer");
if (composer) {
  const form = composer;
  const textarea = form.querySelector<HTMLTextAreaElement>("#post-body")!;
  const rows = form.querySelector<HTMLElement>("#image-editor")!;
  const message = form.querySelector<HTMLElement>("#composer-notice")!;
  const picker = form.querySelector<HTMLInputElement>("#image-files")!;
  const audioPicker = form.querySelector<HTMLInputElement>("#audio-files")!;
  const videoPicker = form.querySelector<HTMLInputElement>("#video-files")!;
  const videoRows = form.querySelector<HTMLElement>("#video-editor")!;
  const filePicker = form.querySelector<HTMLInputElement>("#attachment-files")!;
  const fileRows = form.querySelector<HTMLElement>("#file-editor")!;
  const audioRows = form.querySelector<HTMLElement>("#audio-editor")!;
  const preview = form.querySelector<HTMLElement>(".preview-pane")!;
  const toggle = form.querySelector<HTMLButtonElement>("#preview-toggle")!;
  let uploading = false;
  let dirty = false;
  let saving = false;
  let previewing = false;
  const images = () =>
    Array.from(rows.querySelectorAll<HTMLElement>(".image-row")).map((row) => ({
      id: row.dataset.imageId!,
      liveId: row.dataset.liveId,
      alt: row.querySelector<HTMLInputElement>("[data-image-alt]")!.value,
      linkUrl: row
        .querySelector<HTMLInputElement>("[data-image-link]")!
        .value.trim(),
    }));
  const audioItems = (container = audioRows) =>
    Array.from(container.querySelectorAll<HTMLElement>(".audio-row")).map(
      (row) => ({
        id: row.dataset.audioId!,
        title: row.querySelector<HTMLInputElement>("[data-audio-title]")!.value,
      }),
    );
  const fileItems = () =>
    Array.from(fileRows.querySelectorAll<HTMLElement>(".file-row")).map(
      (row) => ({
        id: row.dataset.fileId!,
        title: fileName(
          row.querySelector<HTMLInputElement>("[data-file-name]")!.value,
        ),
        size: Number(row.dataset.fileSize),
      }),
    );
  form.querySelectorAll<HTMLButtonElement>("[data-md]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      if (previewing || saving || uploading) return;
      const start = textarea.selectionStart,
        end = textarea.selectionEnd,
        selected = textarea.value.slice(start, end);
      const samples: Record<string, [string, string, string]> = {
        bold: ["**", "**", "粗体文字"],
        italic: ["*", "*", "斜体文字"],
        strike: ["~~", "~~", "删除文字"],
        heading: ["### ", "", "标题"],
        quote: ["> ", "", "引用文字"],
        unordered: ["- ", "", "列表项目"],
        ordered: ["1. ", "", "列表项目"],
        task: ["- [ ] ", "", "待办项目"],
        link: ["[", "](https://example.com)", "链接文字"],
        code: ["`", "`", "代码"],
        block: ["```\n", "\n```", "代码"],
        table: ["", "", "| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |"],
        rule: ["", "", "---"],
      };
      const command = button.dataset.md!,
        [before, after, fallback] = samples[command];
      const block = [
        "heading",
        "quote",
        "unordered",
        "ordered",
        "task",
        "block",
        "table",
        "rule",
      ].includes(command);
      const prefix =
        block && start > 0 && textarea.value[start - 1] !== "\n" ? "\n" : "";
      let content = selected || fallback;
      if (
        selected &&
        ["quote", "unordered", "ordered", "task"].includes(command)
      )
        content = selected
          .split("\n")
          .map((line, index) => (index ? before : "") + line)
          .join("\n");
      const inserted = prefix + before + content + after;
      textarea.setRangeText(inserted, start, end, "end");
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length + before.length,
        start + prefix.length + before.length + content.length,
      );
      markDirty();
    });
  });
  function markDirty() {
    dirty = true;
  }
  form.addEventListener("input", markDirty);
  form.addEventListener("change", markDirty);
  const categoryBusy = bindCategories(form, markDirty);
  const lifecycle = new AbortController();
  form.addEventListener("shuxin:before-leave", event => {
    if (saving || uploading || categoryBusy()) {
      event.preventDefault();
      notice(message, "请等当前保存或上传完成后再切换页面。", true);
    } else if (dirty && !confirm("动态尚未保存，离开后将丢失修改。确定离开？")) event.preventDefault();
  });
  window.addEventListener("beforeunload", (event) => {
    if (form.isConnected && ((dirty && !saving) || categoryBusy())) {
      event.preventDefault();
    }
  }, { signal: lifecycle.signal });
  function bindRow(row: HTMLElement) {
    row.querySelector("[data-image-remove]")!.addEventListener("click", () => {
      row.remove();
      markDirty();
    });
    row.querySelector("[data-image-up]")!.addEventListener("click", () => {
      if (row.previousElementSibling)
        rows.insertBefore(row, row.previousElementSibling);
      markDirty();
    });
    row.querySelector("[data-image-down]")!.addEventListener("click", () => {
      if (row.nextElementSibling)
        rows.insertBefore(row.nextElementSibling, row);
      markDirty();
    });
  }
  rows.querySelectorAll<HTMLElement>(".image-row").forEach(bindRow);
  function appendImage(image: { id: string; url: string; liveId?: string }) {
    const row = document.createElement("div");
    row.className = "image-row";
    row.dataset.imageId = image.id;
    if (image.liveId) row.dataset.liveId = image.liveId;
    const img = document.createElement("img");
    img.src = image.url;
    img.alt = "";
    img.width = 64;
    img.height = 64;
    row.append(img);
    const fields = document.createElement("div");
    if (image.liveId) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Live Photo";
      fields.append(badge);
    }
    const label = document.createElement("label");
    label.className = "sr-only";
    label.htmlFor = `alt-${image.id}`;
    label.textContent = "图片替代文本";
    const alt = document.createElement("input");
    alt.id = `alt-${image.id}`;
    alt.dataset.imageAlt = "";
    alt.placeholder = "描述图片内容（替代文本）";
    alt.maxLength = 500;
    fields.append(label, alt);
    const linkLabel = document.createElement("label");
    linkLabel.className = "sr-only";
    linkLabel.htmlFor = `link-${image.id}`;
    linkLabel.textContent = "图片链接";
    const linkInput = document.createElement("input");
    linkInput.id = linkLabel.htmlFor;
    linkInput.dataset.imageLink = "";
    linkInput.placeholder = "点击图片跳转到的网址（可选）";
    linkInput.maxLength = 2048;
    fields.append(linkLabel, linkInput);
    const actions = document.createElement("div");
    actions.className = "image-actions";
    for (const [key, text] of [
      ["imageUp", "前移"],
      ["imageDown", "后移"],
      ["imageRemove", "移除"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button";
      button.dataset[key] = "";
      button.textContent = text;
      actions.append(button);
    }
    fields.append(actions);
    row.append(fields);
    rows.append(row);
    bindRow(row);
    markDirty();
  }
  function setUploadState(value: boolean) {
    uploading = value;
    picker.disabled =
      audioPicker.disabled =
      videoPicker.disabled =
      filePicker.disabled =
      toggle.disabled =
        value;
    form
      .querySelectorAll<HTMLButtonElement>(
        "[type=submit],[data-pick],#music-add",
      )
      .forEach((button) => (button.disabled = value));
  }
  function bindFileRow(row: HTMLElement) {
    row.querySelector("[data-file-remove]")!.addEventListener("click", () => {
      row.remove();
      markDirty();
    });
  }
  fileRows.querySelectorAll<HTMLElement>(".file-row").forEach(bindFileRow);
  function appendFile(item: { id: string; title: string; size: number }) {
        const row = document.createElement("div");
        row.className = "file-row";
        row.dataset.fileId = item.id;
        row.dataset.fileSize = String(item.size);
        const icon = document.createElement("img");
        icon.src = fileIcon(item.title);
        icon.alt = "";
        icon.width = icon.height = 32;
        const info = document.createElement("div");
        info.className = "file-row-info";
        const input = document.createElement("input");
        input.dataset.fileName = "";
        input.value = fileName(item.title);
        input.maxLength = 255;
        input.setAttribute("aria-label", "文件名称");
        const size = document.createElement("span");
        size.className = "download-detail";
        size.textContent = fileSize(item.size);
        info.append(input, size);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "text-button";
        remove.dataset.fileRemove = "";
        remove.textContent = "移除文件";
        row.append(icon, info, remove);
        fileRows.append(row);
        bindFileRow(row);
        markDirty();
  }
  filePicker.addEventListener("change", async () => {
    const files = Array.from(filePicker.files || []);
    if (!files.length) return;
    if (uploading || saving || previewing) {
      notice(message, "请先完成当前操作。", true);
      return;
    }
    if (fileItems().length + files.length > 12) {
      notice(message, "最多添加 12 个文件。", true);
      filePicker.value = "";
      return;
    }
    setUploadState(true);
    try {
      for (const [index, file] of files.entries()) {
        const item = await uploadAudio(
          file,
          (percent) =>
            notice(
              message,
              `正在上传文件 ${index + 1}/${files.length}：${percent}%`,
            ),
          "file",
        );
        appendFile({ ...item, title: item.filename || fileName(file.name), size: item.size ?? file.size });
      }
      notice(message, "文件已添加。");
    } catch (error) {
      notice(message, (error as Error).message, true);
    } finally {
      filePicker.value = "";
      setUploadState(false);
    }
  });
  const downloadEditor = form.querySelector<HTMLElement>(
    "#download-link-editor",
  )!;
  const downloadToggle = form.querySelector<HTMLButtonElement>(
    "#download-link-toggle",
  )!;
  downloadToggle.addEventListener("click", () => {
    downloadEditor.hidden = !downloadEditor.hidden;
    downloadToggle.setAttribute(
      "aria-expanded",
      String(!downloadEditor.hidden),
    );
  });
  form.querySelector("#download-link-add")!.addEventListener("click", () => {
    if (saving || uploading || previewing) return;
    const source = form.querySelector<HTMLTextAreaElement>("#download-source")!,
      name = form.querySelector<HTMLInputElement>("#download-name")!,
      code = form.querySelector<HTMLInputElement>("#download-code")!;
    try {
      const data = downloadFromShare(source.value, name.value, code.value);
      const insertion =
        "\n\n```download\n" + JSON.stringify(data, null, 2) + "\n```\n";
      if (textarea.value.length + insertion.length > textarea.maxLength)
        throw new Error("正文长度超限，请缩短后添加链接。");
      textarea.value += insertion;
      markDirty();
      source.value = name.value = code.value = "";
      downloadEditor.hidden = true;
      downloadToggle.setAttribute("aria-expanded", "false");
      notice(message, "下载链接已添加。");
    } catch {
      notice(
        message,
        "请填写有效的 HTTPS 下载链接，名称不超过 255 字，提取码不超过 40 字。",
        true,
      );
    }
  });
  function bindAudioRow(row: HTMLElement) {
    row.querySelector("[data-audio-remove]")!.addEventListener("click", () => {
      row.remove();
      markDirty();
    });
  }
  audioRows.querySelectorAll<HTMLElement>(".audio-row").forEach(bindAudioRow);
  videoRows.querySelectorAll<HTMLElement>(".audio-row").forEach(bindAudioRow);
  function appendAudio(
    item: { id: string; url: string },
    title: string,
    video = false,
  ) {
    const row = document.createElement("div");
    row.className = "audio-row";
    row.dataset.audioId = item.id;
    const label = document.createElement("label");
    label.className = "sr-only";
    label.htmlFor = `${video ? "video" : "audio"}-title-${item.id}`;
    label.textContent = video ? "视频名称" : "音频名称";
    const input = document.createElement("input");
    input.id = label.htmlFor;
    input.dataset.audioTitle = "";
    input.maxLength = 120;
    input.value = title.slice(0, 120);
    input.placeholder = video ? "视频名称" : "音频名称";
    const player = document.createElement(video ? "video" : "audio");
    player.src = item.url;
    player.controls = true;
    player.preload = "none";
    player.setAttribute(
      "aria-label",
      title || (video ? "视频预览" : "音频预览"),
    );
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button";
    remove.dataset.audioRemove = "";
    remove.textContent = video ? "移除视频" : "移除音频";
    row.append(label, input, player, remove);
    (video ? videoRows : audioRows).append(row);
    bindAudioRow(row);
    markDirty();
  }
  const libraryDialog = form.querySelector<HTMLDialogElement>("#composer-library")!;
  let refreshLibrary: (() => void) | undefined;
  form.querySelector("#library-open")!.addEventListener("click", () => {
    if (saving || uploading || previewing) return;
    libraryDialog.showModal();
    const root = libraryDialog.querySelector<HTMLElement>("[data-file-library]")!;
    if (refreshLibrary) { refreshLibrary(); return; }
    refreshLibrary = bindLibrary(root, async source => {
      if (saving || uploading || previewing) throw new Error("请先完成当前操作。");
      const label = (source.title || "文件").replace(/[\\[\]]/g, "\\$&").replace(/[\r\n]/g, " ");
      let insertion = `\n\n${source.kind === "image" ? "!" : ""}[${label}](${source.url})\n\n`;
      if (source.liveId) insertion += `[Live Photo 片段](/media/${source.liveId})\n\n`;
      if (textarea.value.length - (textarea.selectionEnd - textarea.selectionStart) + insertion.length > textarea.maxLength)
        throw new Error("正文长度超限，请缩短后插入。");
      textarea.setRangeText(insertion, textarea.selectionStart, textarea.selectionEnd, "end");
      markDirty();
      libraryDialog.close();
      textarea.focus();
      notice(message, "资源链接已插入。");
    });
  });
  form.querySelector("#library-close")!.addEventListener("click", () => libraryDialog.close());
  async function addAudioFiles(files: File[], video = false) {
    if (uploading || saving) {
      notice(message, "正在处理，请稍候。");
      return;
    }
    if (audioItems(video ? videoRows : audioRows).length + files.length > 3) {
      notice(
        message,
        video ? "最多添加 3 个视频。" : "最多添加 3 个音频。",
        true,
      );
      return;
    }
    setUploadState(true);
    try {
      for (let i = 0; i < files.length; i++) {
        notice(message, `正在上传音频 ${i + 1}/${files.length}…`);
        const file =
          !video && /\.wma$/i.test(files[i].name)
            ? await (
                await import("./audio-convert")
              ).convertWma(files[i], (text) => notice(message, text))
            : files[i];
        appendAudio(
          await uploadAudio(
            file,
            (percent) =>
              notice(
                message,
                `正在上传${video ? "视频" : "音频"} ${i + 1}/${files.length}：${percent}%`,
              ),
            video ? "video" : "audio",
          ),
          files[i].name.replace(/\.[^.]+$/, ""),
          video,
        );
      }
      notice(message, video ? "视频已添加。" : "音频已添加。");
    } catch (error) {
      notice(message, (error as Error).message, true);
    } finally {
      setUploadState(false);
      audioPicker.value = "";
      videoPicker.value = "";
    }
  }
  audioPicker.addEventListener(
    "change",
    () => void addAudioFiles(Array.from(audioPicker.files ?? [])),
  );
  videoPicker.addEventListener(
    "change",
    () => void addAudioFiles(Array.from(videoPicker.files ?? []), true),
  );
  form
    .querySelectorAll<HTMLButtonElement>("[data-sticker-pack]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        form
          .querySelectorAll<HTMLElement>("[data-sticker-group]")
          .forEach((group) => {
            group.hidden =
              group.dataset.stickerGroup !== button.dataset.stickerPack;
          });
        form
          .querySelectorAll<HTMLButtonElement>("[data-sticker-pack]")
          .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      }),
    );
  form.querySelectorAll<HTMLButtonElement>("[data-sticker]").forEach((button) =>
    button.addEventListener("click", () => {
      if (previewing || saving || uploading) return;
      textarea.setRangeText(
        `:${button.dataset.stickerCode}:`,
        textarea.selectionStart,
        textarea.selectionEnd,
        "end",
      );
      form.querySelector(".sticker-picker")!.removeAttribute("open");
      textarea.focus();
      markDirty();
    }),
  );
  form.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      if (saving || uploading || previewing) return;
      form.querySelector<HTMLInputElement>(`#${button.dataset.pick}`)!.click();
    });
  });
  const musicEditor = form.querySelector<HTMLElement>("#music-editor")!;
  const musicToggle = form.querySelector<HTMLButtonElement>("#music-toggle")!;
  const musicSource = form.querySelector<HTMLTextAreaElement>("#music-source")!;
  musicToggle.addEventListener("click", () => {
    musicEditor.hidden = !musicEditor.hidden;
    musicToggle.setAttribute("aria-expanded", String(!musicEditor.hidden));
  });
  const playlistFile = form.querySelector<HTMLInputElement>("#playlist-file")!;
  playlistFile.addEventListener("change", async () => {
    const file = playlistFile.files?.[0];
    if (!file) return;
    try {
      if (file.size > 100000) throw new Error("歌单文件不能超过 100 KB");
      musicSource.value = await file.text();
    } catch (error) {
      notice(message, (error as Error).message, true);
    } finally {
      playlistFile.value = "";
    }
  });
  form.querySelector("#music-add")!.addEventListener("click", async () => {
    if (saving || uploading || previewing) return;
    setUploadState(true);
    notice(message, "正在解析音乐…");
    try {
      const result = (await api("/api/music/import", {
        source: musicSource.value,
      })) as unknown as
        | { kind: "playlist"; playlist: Playlist }
        | { kind: "audio" | "music"; url: string; title: string };
      const snippet =
        result.kind === "playlist"
          ? "\n\n```playlist\n" +
            JSON.stringify(result.playlist, null, 2) +
            "\n```\n"
          : `\n\n[${result.title.replace(/[\\[\]]/g, "\\$&")}](<${result.url}>)\n`;
      if (textarea.value.length + snippet.length > textarea.maxLength)
        throw new Error("正文长度超限");
      textarea.setRangeText(
        snippet,
        textarea.selectionStart,
        textarea.selectionEnd,
        "end",
      );
      markDirty();
      musicSource.value = "";
      musicEditor.hidden = true;
      musicToggle.setAttribute("aria-expanded", "false");
      notice(
        message,
        result.kind === "playlist"
          ? `已添加歌单，共 ${result.playlist.tracks.length} 首歌曲`
          : "音乐已添加。",
      );
    } catch (error) {
      notice(message, (error as Error).message, true);
    } finally {
      setUploadState(false);
    }
  });
  async function addFiles(files: File[]) {
    if (uploading || saving) {
      notice(message, "正在上传，请稍候。");
      return;
    }
    const videos = files.filter(
      (file) =>
        /\.(mov|mp4)$/i.test(file.name) || file.type.startsWith("video/"),
    );
    const covers = files.filter(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name),
    );
    if (!covers.length && videos.length === files.length) {
      await addAudioFiles(videos, true);
      return;
    }
    const stem = (file: File) =>
      file.name.replace(/\.[^.]+$/, "").toLowerCase();
    const tasks = covers.map((image) => ({
      image,
      video:
        videos.find((video) => stem(video) === stem(image)) ??
        (covers.length === 1 && videos.length === 1 ? videos[0] : undefined),
    }));
    if (
      covers.length + videos.length !== files.length ||
      videos.some(
        (video) => tasks.filter((task) => task.video === video).length !== 1,
      )
    ) {
      notice(
        message,
        "请选择图片或配套的 Live Photo 图片与 MOV / MP4；批量配对需使用相同文件名。",
        true,
      );
      return;
    }
    if (images().length + tasks.length > 12) {
      notice(message, "最多添加 12 张图片。", true);
      return;
    }
    setUploadState(true);
    try {
      for (let i = 0; i < tasks.length; i++) {
        notice(message, `正在上传 ${i + 1}/${tasks.length}…`);
        const task = tasks[i];
        appendImage(
          task.video
            ? await uploadLivePhoto(task.image, task.video)
            : await uploadImage(task.image),
        );
      }
      notice(message, "图片已添加。");
    } catch (e) {
      notice(message, (e as Error).message, true);
    } finally {
      setUploadState(false);
      picker.value = "";
    }
  }
  picker.addEventListener("change", () => {
    void addFiles(Array.from(picker.files ?? []));
  });
  form.addEventListener("paste", (event) => {
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter((f): f is File => Boolean(f));
    if (files.length) {
      event.preventDefault();
      void addFiles(files);
    }
  });
  form.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types.includes("Files")) {
      event.preventDefault();
      form.classList.add("drop-active");
    }
  });
  form.addEventListener("dragleave", (event) => {
    if (!form.contains(event.relatedTarget as Node))
      form.classList.remove("drop-active");
  });
  form.addEventListener("drop", (event) => {
    event.preventDefault();
    form.classList.remove("drop-active");
    const files = Array.from(event.dataTransfer?.files ?? []);
    const audios = files.filter(
      (file) =>
        file.type.startsWith("audio/") ||
        /\.(mp3|m4a|aac|wav|ogg|opus|flac|aif|aiff|mka|wma)$/i.test(file.name),
    );
    if (audios.length) {
      if (audios.length !== files.length)
        notice(message, "请分别添加音频和图片。", true);
      else void addAudioFiles(audios);
    } else if (files.length) {
      if (
        files.every(
          (file) =>
            file.type.startsWith("video/") ||
            /\.(mp4|m4v|mov|webm|mkv|ogv)$/i.test(file.name),
        )
      )
        void addAudioFiles(files, true);
      else void addFiles(files);
    }
  });
  toggle.addEventListener("click", async () => {
    if (previewing) {
      preview.hidden = true;
      form.querySelector<HTMLElement>(".markdown-toolbar")!.hidden = false;
      textarea.hidden = false;
      rows.hidden = false;
      audioRows.hidden = false;
      videoRows.hidden = false;
      fileRows.hidden = false;
      previewing = false;
      toggle.querySelector("[data-tool-label]")!.textContent = "预览";
      toggle.setAttribute("aria-pressed", "false");
      toggle.title = "预览";
      return;
    }
    toggle.disabled = true;
    try {
      const data = await api("/api/preview", { body: textarea.value });
      form.querySelector("#preview-body")!.innerHTML = data.html;
      const gallery = form.querySelector("#preview-images")!;
      gallery.replaceChildren();
      images().forEach((image) => {
        const img = document.createElement("img");
        img.src = `/media/${image.id}`;
        img.alt = image.alt;
        if (image.liveId) {
          const video = document.createElement("video");
          video.src = `/media/${image.liveId}`;
          video.poster = img.src;
          video.controls = true;
          video.playsInline = true;
          video.muted = true;
          video.preload = "none";
          gallery.append(video);
        } else if (image.linkUrl) {
          const url = new URL(image.linkUrl);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            throw new Error("图片链接必须为有效 HTTP / HTTPS 地址");
          const link = document.createElement("a");
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.append(img);
          gallery.append(link);
        } else gallery.append(img);
      });
      const audioPreview = form.querySelector("#preview-audio")!;
      audioPreview.replaceChildren();
      [
        ...audioItems().map((item) => ({ ...item, video: false })),
        ...audioItems(videoRows).map((item) => ({ ...item, video: true })),
      ].forEach((item) => {
        const figure = document.createElement("figure");
        figure.className = item.video
          ? "audio-player video-player"
          : "audio-player audio-card";
        const caption = document.createElement("figcaption");
        caption.textContent = item.title || "音频";
        const player = document.createElement(item.video ? "video" : "audio");
        player.src = `/media/${item.id}`;
        player.controls = true;
        player.preload = "none";
        player.setAttribute("aria-label", item.title || "音频");
        if (item.video) figure.append(caption, player);
        else {
          const card = document.createElement("div");
          card.className = "music-card";
          const cover = document.createElement("img");
          cover.className = "music-cover";
          cover.src = "/music-placeholder.webp";
          cover.alt = "";
          const info = document.createElement("div");
          info.className = "music-info";
          caption.className = "music-title";
          const artist = document.createElement("span");
          artist.className = "music-artist";
          artist.textContent = "音频文件";
          info.append(caption, artist);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "music-play";
          button.setAttribute("aria-label", "播放音频");
          button.textContent = "▶";
          card.append(cover, info, button);
          figure.append(card, player);
        }
        audioPreview.append(figure);
      });
      form.querySelector("#preview-files")!.innerHTML = fileItems()
        .map((file) => renderFileDownload(file.id, file.title, file.size))
        .join("");
      bindCodeBlocks(preview);
      bindPlaylistPlayers(preview);
      bindAudioPlayers(preview);
      bindMusicPlayers(preview);
      audioRows.hidden = true;
      videoRows.hidden = true;
      fileRows.hidden = true;
      textarea.hidden = true;
      rows.hidden = true;
      preview.hidden = false;
      form.querySelector<HTMLElement>(".markdown-toolbar")!.hidden = true;
      previewing = true;
      toggle.querySelector("[data-tool-label]")!.textContent = "继续编辑";
      toggle.setAttribute("aria-pressed", "true");
      toggle.title = "继续编辑";
      notice(message, "");
    } catch (e) {
      notice(message, (e as Error).message, true);
    } finally {
      toggle.disabled = false;
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (uploading || saving || categoryBusy()) return;
    const submitter = (event as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const status = submitter?.value === "draft" ? "draft" : "published";
    const values = new FormData(form);
    const id = form.dataset.postId;
    saving = true;
    form.querySelector<HTMLFieldSetElement>("#category-field")!.disabled = true;
    form
      .querySelectorAll<HTMLButtonElement>("[type=submit]")
      .forEach((b) => (b.disabled = true));
    notice(message, status === "draft"
      ? form.dataset.postStatus === "published" ? "正在转为草稿…" : "正在保存草稿…"
      : form.dataset.postStatus === "published" ? "正在保存修改…" : "正在发布动态…");
    try {
      const data = await api(
        id ? `/api/posts/${id}` : "/api/posts",
        {
          body: textarea.value,
          title: String(values.get("title") ?? "").trim(),
          categoryId: values.get("categoryId") || null,
          status,
          visibility: values.get("visibility"),
          pinned: values.has("pinned"),
          images: images(),
          audio: audioItems(),
          videos: audioItems(videoRows),
          files: fileItems().map(({ id, title }) => ({ id, title })),
          ...(id ? { updatedAt: Number(form.dataset.updatedAt) } : {}),
        },
        id ? "PATCH" : "POST",
      );
      dirty = false;
      saving = false;
      form.querySelector<HTMLFieldSetElement>("#category-field")!.disabled = false;
      form.querySelectorAll<HTMLButtonElement>('[type="submit"]').forEach(button => button.disabled = false);
      form.dispatchEvent(new CustomEvent("shuxin:navigate", { bubbles: true, detail: { href: data.redirect } }));
    } catch (e) {
      saving = false;
      form.querySelector<HTMLFieldSetElement>("#category-field")!.disabled = false;
      notice(message, (e as Error).message, true);
      form
        .querySelectorAll<HTMLButtonElement>("[type=submit]")
        .forEach((b) => (b.disabled = false));
    }
  });
  return () => lifecycle.abort();
}
}
