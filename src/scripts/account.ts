import { api, bindValidation, notice, uploadImage } from "./api";
export function bindAccount() {
const form = document.querySelector<HTMLFormElement>("#account-form")!;
const picker = form.querySelector<HTMLInputElement>("#avatar-file")!;
const preview = form.querySelector<HTMLImageElement>("#avatar-preview")!;
let busy = false;
function state(value: boolean) {
  busy = value;
  form
    .querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      "button,input[type=file]",
    )
    .forEach((el) => (el.disabled = value));
}
async function saveAvatar(file?: File) {
  if (busy) return;
  state(true);
  notice(
    form.querySelector(".notice"),
    file ? "正在上传并保存头像…" : "正在移除头像…",
  );
  try {
    const image = file ? await uploadImage(file) : null;
    await api("/api/auth/account", { avatarId: image?.id ?? null });
    preview.src = image?.url ?? "/favicon.svg";
    form.dataset.avatar = image?.id ?? "";
    notice(form.querySelector(".notice"), file ? "头像已保存" : "头像已移除");
  } catch (error) {
    notice(form.querySelector(".notice"), (error as Error).message, true);
  } finally {
    state(false);
    picker.value = "";
  }
}
picker.addEventListener("change", () => {
  const file = picker.files?.[0];
  if (file) void saveAvatar(file);
});
form
  .querySelector("#avatar-remove")!
  .addEventListener("click", () => void saveAvatar());
bindValidation(form);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  state(true);
  notice(form.querySelector(".notice"), "正在保存用户资料…");
  try {
    const data = await api(
      "/api/auth/account",
      Object.fromEntries(new FormData(form)),
    );
    const nickname = form.querySelector<HTMLInputElement>('[name="displayName"]')?.value;
    const greeting = document.querySelector<HTMLElement>("[data-admin-nickname]");
    if (greeting && nickname) greeting.textContent = nickname.trim();
    notice(form.querySelector(".notice"), data.message);
  } catch (error) {
    notice(form.querySelector(".notice"), (error as Error).message, true);
  } finally {
    state(false);
  }
});

}
