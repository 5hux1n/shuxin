import { api, notice } from "./api";

export function bindCategories(form: HTMLFormElement, markDirty: () => void) {
  const field = form.querySelector<HTMLElement>("#category-field")!;
  const selected = field.querySelector<HTMLInputElement>("#post-category")!;
  const choices = field.querySelector<HTMLElement>(".category-options")!;
  const editor = field.querySelector<HTMLElement>("#category-editor")!;
  const name = field.querySelector<HTMLInputElement>("#category-name")!;
  const save = field.querySelector<HTMLButtonElement>("#category-save")!;
  const rename = field.querySelector<HTMLButtonElement>("#category-rename")!;
  const remove = field.querySelector<HTMLButtonElement>("#category-delete")!;
  const message = form.querySelector<HTMLElement>("#composer-notice");
  let editingId: string | null = null;
  let busy = false;
  const selectedButton = () => Array.from(choices.querySelectorAll<HTMLButtonElement>("[data-category-id]"))
    .find((button) => button.dataset.categoryId === selected.value);
  function updateSelection() {
    choices.querySelectorAll<HTMLButtonElement>("[data-category-id]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.categoryId === selected.value));
    });
    rename.disabled = remove.disabled = busy || !selected.value;
  }
  function render(items: { id: string; name: string }[]) {
    if (selected.value && !items.some((item) => item.id === selected.value)) selected.value = "";
    choices.replaceChildren();
    for (const item of [{ id: "", name: "不分类" }, ...items]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-choice";
      button.dataset.categoryId = item.id;
      button.textContent = item.name;
      choices.append(button);
    }
    updateSelection();
  }
  function openEditor(id: string | null) {
    editingId = id;
    name.value = id ? selectedButton()?.textContent?.trim() ?? "" : "";
    save.textContent = id ? "保存名称" : "添加分类";
    editor.hidden = false;
    name.focus();
  }
  function setBusy(value: boolean) {
    busy = value;
    field.setAttribute("aria-busy", String(value));
    field.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = value; });
    name.disabled = value;
    updateSelection();
  }
  choices.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-category-id]");
    if (!button || busy) return;
    selected.value = button.dataset.categoryId!;
    editor.hidden = true;
    updateSelection();
    markDirty();
  });
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
      selected.value = data.category!.id;
      render(data.categories!);
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
    const categoryName = selectedButton()?.textContent?.trim();
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
