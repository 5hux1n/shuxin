import { api, notice, uploadImage, uploadAudio } from "./api";
import { fileIcon, fileSize } from "../lib/downloads";
export interface LibraryItem {
  id: string; kind: string; title: string; size: number; url: string;
  liveId: string | null; postId: string | null; protected: boolean; storage: string; referenceCount: number;
}
export function bindLibrary(root: HTMLElement, onPick?: (item: LibraryItem) => Promise<void>) {
  const list = root.querySelector<HTMLElement>(".library-list")!;
  const more = root.querySelector<HTMLButtonElement>("[data-library-more]")!;
  const remove = root.querySelector<HTMLButtonElement>("[data-library-delete]")!;
  const all = root.querySelector<HTMLInputElement>("[data-library-all]")!;
  const count = root.querySelector<HTMLElement>("[data-library-selected]")!;
  let items: LibraryItem[] = [], cursor: unknown = null, kind = "all", busy = false;
  const upload = root.querySelector<HTMLButtonElement>("[data-library-upload]");
  const uploadPicker = root.querySelector<HTMLInputElement>("[data-library-upload-files]");
  const selected = new Set<string>();
  function selectable(item: LibraryItem) { return !item.protected; }
  function visible() {
    const liveIds = new Set(items.map(item => item.liveId).filter(Boolean));
    return items.filter(item => !liveIds.has(item.id) && (kind === "all" || item.kind === kind));
  }
  function controls() {
    const eligible = visible().filter(selectable);
    remove.disabled = busy || !selected.size;
    count.textContent = `已选 ${selected.size} 项`;
    remove.textContent = "删除所选";
    all.checked = !!eligible.length && eligible.every(item => selected.has(item.id));
    all.indeterminate = eligible.some(item => selected.has(item.id)) && !all.checked;
    all.disabled = busy || !eligible.length;
    more.disabled = busy;
    if (upload) upload.disabled = busy;
    if (uploadPicker) uploadPicker.disabled = busy;
    list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(check => {
      const item = items.find(item => check.dataset.libraryId === item.id);
      check.disabled = busy || !!item?.protected;
    });
    root.querySelectorAll<HTMLButtonElement>("[data-library-pick],[data-library-single-delete]").forEach(button => button.disabled = busy);
  }
  function render() {
    list.replaceChildren();
    for (const item of visible()) {
      const row = document.createElement("div"); row.className = "library-row";
      const check = document.createElement("input"); check.type = "checkbox";
      check.dataset.libraryId = item.id;
      check.setAttribute("aria-label", `选择 ${item.title}`);
      check.disabled = !selectable(item) || busy; check.checked = selected.has(item.id);
      check.addEventListener("change", () => {
        if (check.checked) selected.add(item.id);
        else selected.delete(item.id);
        controls();
      });
      const img = document.createElement("img"); img.width = img.height = 48; img.alt = ""; img.loading = "lazy";
      img.src = item.kind === "image" ? item.url : fileIcon(item.title);
      const info = document.createElement("div"); info.className = "library-info";
      const title = document.createElement("a"); title.href = item.url; title.textContent = item.title;
      title.target = "_blank"; title.rel = "noopener noreferrer";
      const meta = document.createElement("span"); meta.className = "hint";
      meta.textContent = `${fileSize(item.size)} · ${item.storage} · ${item.protected ? "站点外观使用中" : item.postId ? "动态已关联" : "未关联"}${item.referenceCount ? ` · ${item.referenceCount} 条动态引用` : ""}${item.liveId ? " · Live Photo" : ""}`;
      info.append(title, meta); row.append(check, img, info);
      if (onPick) {
        const pick = document.createElement("button"); pick.type = "button"; pick.className = "button"; pick.textContent = "插入";
        pick.dataset.libraryPick = "";
        pick.addEventListener("click", async () => {
          if (busy) return; busy = true; controls();
          try { await onPick(item); }
          catch (error) { notice(null, (error as Error).message, true); }
          finally { busy = false; controls(); }
        }); row.append(pick);
      }
      if (!item.protected) {
        const button = document.createElement("button"); button.type = "button"; button.className = "button danger"; button.textContent = "删除";
        button.dataset.librarySingleDelete = "";
        button.addEventListener("click", () => void deleteItems([item.id])); row.append(button);
      }
      list.append(row);
    }
    root.querySelector<HTMLElement>(".library-empty")!.hidden = !!visible().length;
    more.hidden = !cursor; controls();
  }
  async function load(reset = false) {
    if (busy) return;
    busy = true; controls();
    try {
      const query = !reset && cursor ? `?cursor=${encodeURIComponent(JSON.stringify(cursor))}` : "";
      const data = await api("/api/library" + query, undefined, "GET") as unknown as { items: LibraryItem[]; cursor: unknown };
      items = reset ? data.items : [...items, ...data.items.filter(item => !items.some(old => old.id === item.id))];
      cursor = data.cursor; if (reset) selected.clear(); render();
    } catch (error) { notice(null, (error as Error).message, true); }
    finally { busy = false; render(); }
  }
  async function deleteItems(ids: string[]) {
    if (busy || !ids.length) return;
    if (!confirm(`删除 ${ids.length} 个文件？所有引用该文件的内容都会失效，Live Photo 及片段会一起删除。此操作无法撤销。`)) return;
    busy = true; controls();
    try { const data = await api("/api/library", { action: "delete", ids }); notice(null, data.message); }
    catch (error) { notice(null, (error as Error).message, true); }
    finally { busy = false; await load(true); }
  }
  upload?.addEventListener("click", () => { if (!busy) uploadPicker?.click(); });
  uploadPicker?.addEventListener("change", async () => {
    const files = Array.from(uploadPicker.files || []);
    if (busy || !files.length) { uploadPicker.value = ""; return; }
    busy = true; controls();
    let completed = 0;
    try {
      for (const [index, source] of files.entries()) {
        const image = /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(source.name) || /^image\/(jpeg|png|webp|gif|heic|heif)$/.test(source.type);
        const video = /\.(mp4|m4v|mov|webm|mkv|ogv)$/i.test(source.name) || source.type.startsWith("video/");
        const audio = /\.(mp3|m4a|aac|wav|flac|aif|aiff|ogg|opus|wma|mka)$/i.test(source.name) || source.type.startsWith("audio/");
        notice(null, `正在上传 ${index + 1}/${files.length}：${source.name}`);
        if (image) await uploadImage(source);
        else {
          const file = audio && /\.wma$/i.test(source.name)
            ? await (await import("./audio-convert")).convertWma(source, text => notice(null, text)) : source;
          await uploadAudio(file, percent => notice(null, `正在上传 ${index + 1}/${files.length}：${percent}%`), video ? "video" : audio ? "audio" : "file");
        }
        completed++;
      }
      notice(null, `已上传 ${completed} 个文件。`);
    } catch (error) {
      notice(null, `${completed ? `已上传 ${completed} 个文件；` : ""}${files[completed]?.name || "文件"}：${(error as Error).message}，其余文件未上传。`, true);
    } finally {
      uploadPicker.value = "";
      busy = false;
      await load(true);
    }
  });
  root.querySelectorAll<HTMLButtonElement>("[data-library-kind]").forEach(button => button.addEventListener("click", () => {
    kind = button.dataset.libraryKind!; selected.clear();
    root.querySelectorAll("[data-library-kind]").forEach(el => el.setAttribute("aria-pressed", String(el === button))); render();
  }));
  all.addEventListener("change", () => { visible().filter(selectable).forEach(item => all.checked ? selected.add(item.id) : selected.delete(item.id)); render(); });
  remove.addEventListener("click", () => void deleteItems([...selected]));
  more.addEventListener("click", () => void load());
  void load(true);
  return () => void load(true);
}
