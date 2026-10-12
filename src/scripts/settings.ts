import { applyBackground } from "./background";
import { backgroundSource, type BackgroundSettings } from "../lib/background";
import { api, bindValidation, notice, uploadImage } from "./api";
export function bindSettings() {
const form = document.querySelector<HTMLFormElement>("#settings-form")!;
let busy = false;
let savedLogoText =
  form.querySelector<HTMLInputElement>('[name="logoText"]')!.value;
function state(value: boolean) {
  busy = value;
  form
    .querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      'button,input[type=file],input[type=radio],input[name="logoText"]',
    )
    .forEach((el) => (el.disabled = value));
}
function logo(branding: {
  title: string;
  browserTitle: string;
  logoId: string;
  logoText: string;
}) {
  const brand = document.querySelector(".brand")!;
  brand.querySelector(".brand-logo,.lights")?.remove();
  brand.querySelector(".brand-title")?.remove();
  if (branding.logoId) {
    const img = document.createElement("img");
    img.className = "brand-logo";
    img.src = "/media/" + branding.logoId;
    img.alt = "";
    img.width = img.height = 32;
    brand.append(img);
  }
  if (branding.logoText) {
    const title = document.createElement("span");
    title.className = "brand-title text-logo";
    title.textContent = branding.logoText;
    brand.append(title);
  }
  form.dataset.logo = branding.logoId;
  savedLogoText = branding.logoText;
  const preview = form.querySelector<HTMLImageElement>("#logo-preview")!;
  preview.hidden = !branding.logoId;
  if (branding.logoId) preview.src = "/media/" + branding.logoId;
  else preview.removeAttribute("src");
  form.querySelector<HTMLElement>("#logo-remove")!.hidden = !branding.logoId;
  brand.setAttribute("aria-label", branding.title + " 首页");
  document.title = "网站设置 · " + branding.browserTitle;
}
async function saveLogo() {
  if (busy) return;
  if (
    form.querySelector<HTMLInputElement>('[name="logoText"]')!.value.trim() ===
    savedLogoText
  )
    return;
  state(true);
  notice(form.querySelector("#settings-notice"), "正在保存 Logo…");
  try {
    const logoText = form
      .querySelector<HTMLInputElement>('[name="logoText"]')!
      .value.trim();
    const result = await api("/api/settings", { logoText });
    logo(result.branding!);
    notice(form.querySelector("#settings-notice"), "Logo 已保存");
  } catch (error) {
    notice(
      form.querySelector("#settings-notice"),
      (error as Error).message,
      true,
    );
  } finally {
    state(false);
  }
}
form
  .querySelector('[name="logoText"]')!
  .addEventListener("blur", () => void saveLogo());
function background(site: BackgroundSettings) {
  let layer = document.querySelector<HTMLElement>(".site-background");
  const source = backgroundSource(site);
  if (!source) {
    if (layer) {
      layer.dataset.backgroundSource = "";
      void applyBackground(layer);
      layer.remove();
    }
    form.querySelector<HTMLImageElement>("#background-preview")!.hidden = true;
    return;
  }
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "site-background";
    layer.setAttribute("aria-hidden", "true");
    document.body.prepend(layer);
  }
  layer.dataset.backgroundSource = source;
  layer.dataset.backgroundJson = String(
    site.backgroundMode === "bing" ||
      (site.backgroundMode === "api" && site.backgroundApiType === "json"),
  );
  layer.dataset.backgroundField =
    site.backgroundMode === "bing" ? "url" : site.backgroundApiField;
  layer.style.opacity = String(Number(site.backgroundOpacity) / 100);
  void applyBackground(layer);
}
const backgroundMode =
  form.querySelector<HTMLSelectElement>("#background-mode")!;
const apiType = form.querySelector<HTMLSelectElement>("#background-api-type")!;
function backgroundControls() {
  form.querySelector<HTMLElement>("#background-upload")!.hidden =
    backgroundMode.value !== "upload";
  form.querySelector<HTMLElement>("#background-online")!.hidden = ![
    "image",
    "api",
  ].includes(backgroundMode.value);
  form.querySelector<HTMLElement>("#background-api")!.hidden =
    backgroundMode.value !== "api";
  form.querySelector<HTMLElement>("#background-json-field")!.hidden =
    apiType.value !== "json";
}
backgroundMode.addEventListener("change", backgroundControls);
apiType.addEventListener("change", backgroundControls);
async function saveImage(field: "logoId" | "backgroundId", file?: File) {
  if (busy) return;
  state(true);
  const imageLabel = field === "logoId" ? "Logo" : "背景";
  notice(form.querySelector("#settings-notice"), file ? `正在上传并保存${imageLabel}…` : `正在移除${imageLabel}…`);
  const name = field === "logoId" ? "logo" : "background";
  try {
    const image = file ? await uploadImage(file) : null;
    const result = await api("/api/settings", {
      [field]: image?.id ?? null,
      ...(field === "backgroundId"
        ? { backgroundMode: "upload", backgroundUrl: "" }
        : {}),
      ...(field === "logoId"
        ? {
            logoText: form
              .querySelector<HTMLInputElement>('[name="logoText"]')!
              .value.trim(),
          }
        : {}),
    });
    form.querySelector<HTMLImageElement>(`#${name}-preview`)!.src =
      image?.url ?? "/favicon.svg";
    if (field === "logoId") logo(result.branding!);
    else {
      backgroundMode.value = "upload";
      backgroundControls();
      background(result.background as BackgroundSettings);
    }
    notice(form.querySelector("#settings-notice"), `${imageLabel}${file ? "已保存" : "已移除"}`);
  } catch (error) {
    notice(
      form.querySelector("#settings-notice"),
      (error as Error).message,
      true,
    );
  } finally {
    state(false);
    form.querySelector<HTMLInputElement>(`#${name}-file`)!.value = "";
  }
}
for (const [name, field] of [
  ["logo", "logoId"],
  ["background", "backgroundId"],
] as const) {
  const picker = form.querySelector<HTMLInputElement>(`#${name}-file`)!;
  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    if (file) void saveImage(field, file);
  });
  form
    .querySelector(`#${name}-remove`)!
    .addEventListener("click", () => void saveImage(field));
}
const opacity = form.querySelector<HTMLInputElement>("#background-opacity")!;
opacity.addEventListener("input", () => {
  form.querySelector("#background-value")!.textContent = `${opacity.value}%`;
  const layer = document.querySelector<HTMLElement>(".site-background");
  if (layer) layer.style.opacity = String(Number(opacity.value) / 100);
});
bindValidation(form);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const values = Object.fromEntries(new FormData(form));
  state(true);
  notice(form.querySelector("#settings-notice"), "正在保存网站设置…");
  try {
    const result = await api("/api/settings", values);
    notice(form.querySelector("#settings-notice"), result.message);
    logo(result.branding!);
    background(result.background as BackgroundSettings);
  } catch (error) {
    notice(
      form.querySelector("#settings-notice"),
      (error as Error).message,
      true,
    );
  } finally {
    state(false);
  }
});

}
