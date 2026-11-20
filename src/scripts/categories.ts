import { api, notice } from "./api";

export function bindCategories(form: HTMLFormElement, markDirty: () => void, signal: AbortSignal) {
  const field = form.querySelector<HTMLElement>("#category-field")!;
  const selected = field.querySelector<HTMLSelectElement>("#post-category")!;
  const selectBox = field.querySelector<HTMLElement>("#category-select")!;
  const trigger = field.querySelector<HTMLButtonElement>("#category-select-trigger")!;
  const menu = field.querySelector<HTMLElement>("#category-select-menu")!;
  const editor = field.querySelector<HTMLElement>("#category-editor")!;
  const name = field.querySelector<HTMLInputElement>("#category-name")!;
  const save = field.querySelector<HTMLButtonElement>("#category-save")!;
  const rename = field.querySelector<HTMLButtonElement>("#category-rename")!;
  const remove = field.querySelector<HTMLButtonElement>("#category-delete")!;
  const message = form.querySelector<HTMLElement>("#composer-notice");
  let editingId: string | null = null;
  let busy = false;
  function closeMenu(focus = false) {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (focus) trigger.focus({ preventScroll: true });
  }
  function renderMenu() {
    menu.replaceChildren();
    for (const option of Array.from(selected.options)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-select-option";
      button.setAttribute("role", "option");
      button.tabIndex = -1;
      button.dataset.categoryValue = option.value;
      button.textContent = option.textContent;
      menu.append(button);
    }
  }
  function openMenu() {
    if (busy || field.matches(":disabled")) return;
    const rect = selectBox.getBoundingClientRect();
    const height = Math.min(menu.children.length * 40 + 10, 240, innerHeight * .4);
    selectBox.classList.toggle("opens-up", innerHeight - rect.bottom < height + 8 && rect.top > height + 8);
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const option = Array.from(menu.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.dataset.categoryValue === selected.value);
    option?.focus({ preventScroll: true });
    option?.scrollIntoView({ block: "nearest" });
  }
  function updateSelection() {
    rename.disabled = remove.disabled = busy || !selected.value;
    trigger.querySelector("[data-category-label]")!.textContent = selected.selectedOptions[0]?.textContent ?? "不分类";
    menu.querySelectorAll<HTMLButtonElement>("button").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.categoryValue === selected.value)));
  }
  function render(items: { id: string; name: string }[], selectedId = selected.value) {
    selected.replaceChildren();
    for (const item of [{ id: "", name: "不分类" }, ...items]) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      selected.append(option);
    }
    selected.value = items.some((item) => item.id === selectedId) ? selectedId : "";
    renderMenu();
    updateSelection();
  }
  function openEditor(id: string | null) {
    editingId = id;
    closeMenu();
    name.value = id ? selected.selectedOptions[0]?.textContent?.trim() ?? "" : "";
    save.textContent = id ? "保存名称" : "添加分类";
    editor.hidden = false;
    name.focus();
  }
  function setBusy(value: boolean) {
    busy = value;
    field.setAttribute("aria-busy", String(value));
    field.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = value; });
    name.disabled = value;
    selected.disabled = value;
    if (value) closeMenu();
    updateSelection();
  }
  selected.addEventListener("change", () => {
    if (busy) return;
    editor.hidden = true;
    updateSelection();
    markDirty();
  });
  renderMenu();
  updateSelection();
  selectBox.hidden = false;
  selected.hidden = true;
  trigger.addEventListener("click", () => { if (menu.hidden) openMenu(); else closeMenu(); });
  trigger.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      openMenu();
      if (event.key === "Home") menu.querySelector<HTMLButtonElement>("button")?.focus();
      if (event.key === "End") menu.querySelectorAll<HTMLButtonElement>("button")[menu.children.length - 1]?.focus();
    }
  });
  menu.addEventListener("click", (event) => {
    const option = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-category-value]");
    if (!option || busy) return;
    selected.value = option.dataset.categoryValue!;
    editor.hidden = true;
    updateSelection();
    closeMenu(true);
    markDirty();
  });
  menu.addEventListener("keydown", (event) => {
    const options = Array.from(menu.querySelectorAll<HTMLButtonElement>("button"));
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") { event.preventDefault(); closeMenu(true); }
    if (event.key === "Tab") closeMenu(true);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => { if (!selectBox.contains(event.target as Node)) closeMenu(); }, { signal });
  selectBox.addEventListener("focusout", (event) => { if (!selectBox.contains(event.relatedTarget as Node | null)) closeMenu(); });
  field.querySelector("#category-add")!.addEventListener("click", () => openEditor(null));
  rename.addEventListener("click", () => { if (selected.value) openEditor(selected.value); });
  field.querySelector("#category-cancel")!.addEventListener("click", () => { editor.hidden = true; });
  async function saveName() {
    if (busy) return;
    if (!name.value.trim()) {
      notice(message, "请填写分类名称", true);
      name.focus();
      return;
    }
    setBusy(true);
    notice(message, editingId ? "正在保存分类…" : "正在添加分类…");
    try {
      const data = await api(editingId ? `/api/categories/${editingId}` : "/api/categories", { name: name.value }, editingId ? "PATCH" : "POST");
      render(data.categories!, data.category!.id);
      editor.hidden = true;
      markDirty();
      notice(message, editingId ? "分类名称已保存" : "分类已添加");
    } catch (error) {
      notice(message, (error as Error).message, true);
    } finally { setBusy(false); }
  }
  save.addEventListener("click", () => { void saveName(); });
  name.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); void saveName(); }
    if (event.key === "Escape") { event.preventDefault(); editor.hidden = true; }
  });
  remove.addEventListener("click", async () => {
    if (busy || !selected.value) return;
    const categoryName = selected.selectedOptions[0]?.textContent?.trim();
    if (!confirm(`删除分类“${categoryName}”？该分类下的动态会保留并取消分类。`)) return;
    const id = selected.value;
    setBusy(true);
    notice(message, "正在删除分类…");
    try {
      const data = await api(`/api/categories/${id}`, undefined, "DELETE");
      selected.value = "";
      render(data.categories!);
      editor.hidden = true;
      markDirty();
      notice(message, "分类已删除，动态已保留");
    } catch (error) {
      notice(message, (error as Error).message, true);
    } finally { setBusy(false); }
  });
  return () => busy;
}
