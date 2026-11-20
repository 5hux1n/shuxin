import { api, notice, uploadImage } from "./api";
const form = document.querySelector<HTMLFormElement>("[data-quick-composer]");
if (form) {
  const body = form.querySelector<HTMLTextAreaElement>("textarea")!;
  const message = form.querySelector<HTMLElement>(".notice");
  const picker = form.querySelector<HTMLInputElement>('[type="file"]')!;
  const imageList = form.querySelector<HTMLElement>("[data-quick-images]")!;
  const passwordToggle = form.querySelector<HTMLInputElement>('[name="passwordProtected"]')!;
  const password = form.querySelector<HTMLInputElement>('[name="password"]')!;
  let busy = false;
  let leaving = false;
  let uploaded: { id: string; alt: string }[] = [];
  function setBusy(value: boolean) {
    busy = value;
    form!.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>("input, textarea, button").forEach(field => { field.disabled = value; });
    password.disabled = value || !passwordToggle.checked;
    form!.setAttribute("aria-busy", String(value));
  }
  function renderImages() {
    imageList.replaceChildren();
    for (const [index, image] of uploaded.entries()) {
      const item = document.createElement("div");
      const img = document.createElement("img");
      img.src = `/media/${image.id}?w=108`;
      img.alt = image.alt;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-button";
      remove.textContent = "移除";
      remove.setAttribute("aria-label", `移除第 ${index + 1} 张图片`);
      remove.addEventListener("click", () => {
        if (busy) return;
        uploaded = uploaded.filter(entry => entry !== image);
        renderImages();
      });
      item.append(img, remove);
      imageList.append(item);
    }
    body.required = !uploaded.length;
  }
  form.addEventListener("invalid", event => {
    if (event.target instanceof HTMLElement) {
      const details = event.target.closest("details");
      if (details) details.open = true;
    }
  }, true);
  window.addEventListener("pageshow", event => {
    if (event.persisted && leaving) location.reload();
  });
  passwordToggle.addEventListener("change", () => {
    password.disabled = !passwordToggle.checked;
    password.required = passwordToggle.checked;
    if (!passwordToggle.checked) password.value = "";
  });
  form.querySelector("[data-quick-upload]")!.addEventListener("click", () => { if (!busy) picker.click(); });
  picker.addEventListener("change", async () => {
    const files = Array.from(picker.files ?? []);
    if (!files.length || busy) return;
    if (uploaded.length + files.length > 12) { notice(message, "最多添加 12 张图片", true); picker.value = ""; return; }
    setBusy(true);
    notice(message, "正在上传图片…");
    try {
      for (const file of files) {
        const image = await uploadImage(file);
        uploaded.push({ id: image.id, alt: "" });
        renderImages();
      }
      notice(message, "图片已上传，发布后访客才能查看。");
    } catch (error) {
      notice(message, (error as Error).message, true);
    } finally {
      picker.value = "";
      setBusy(false);
    }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(form);
    if (!body.value.trim() && !uploaded.length) { notice(message, "请填写正文或添加图片", true); return; }
    setBusy(true);
    notice(message, "正在发布动态…");
    try {
      const data = await api("/api/posts", {
        body: body.value, title: String(values.get("title") ?? "").trim(), status: "published",
        visibility: values.get("visibility"), pinned: false, images: uploaded,
        passwordProtected: values.has("passwordProtected"),
        ...(values.has("passwordProtected") ? { password: String(values.get("password") ?? "") } : {}),
      });
      leaving = true;
      location.assign(values.get("visibility") === "public" ? "/" : data.permalink || "/admin");
    } catch (error) {
      notice(message, (error as Error).message, true);
      setBusy(false);
    }
  });
  body.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      if (!busy) form.requestSubmit();
    }
  });
  form.querySelector<HTMLAnchorElement>("[data-quick-full]")!.addEventListener("click", async event => {
    if (busy) { event.preventDefault(); return; }
    if (!body.value.trim() && !uploaded.length) return;
    event.preventDefault();
    const values = new FormData(form);
    if (passwordToggle.checked && !password.value) {
      form.querySelector<HTMLDetailsElement>("details")!.open = true;
      password.focus();
      password.reportValidity();
      return;
    }
    setBusy(true);
    notice(message, "正在保存草稿…");
    try {
      const data = await api("/api/posts", {
        body: body.value, title: String(values.get("title") ?? "").trim(), status: "draft",
        visibility: values.get("visibility"), pinned: false, images: uploaded,
        passwordProtected: values.has("passwordProtected"),
        ...(values.has("passwordProtected") ? { password: String(values.get("password") ?? "") } : {}),
      });
      leaving = true;
      location.assign(`/admin/edit/${data.permalink!.split("/").pop()}`);
    } catch (error) {
      notice(message, (error as Error).message, true);
      setBusy(false);
    }
  });
  window.addEventListener("beforeunload", event => {
    if (!leaving && (busy || body.value.trim() || uploaded.length)) { event.preventDefault(); }
  });
}
