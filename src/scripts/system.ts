import { api, bindValidation, csrf, notice } from "./api";
export function bindSystem() {
const form = document.querySelector<HTMLFormElement>("#login-name-form")!;
bindValidation(form);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector<HTMLButtonElement>("[type=submit]")!;
  if (button.disabled) return;
  button.disabled = true;
  notice(form.querySelector(".notice"), "正在保存用户名…");
  try {
    const result = await api(
      "/api/auth/account",
      Object.fromEntries(new FormData(form)),
    );
    if (result.redirect) location.href = result.redirect;
    else notice(form.querySelector(".notice"), result.message);
  } catch (error) {
    notice(form.querySelector(".notice"), (error as Error).message, true);
  } finally {
    button.disabled = false;
  }
});
const exportButton =
  document.querySelector<HTMLButtonElement>("#export-button")!;
exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;
  const message = document.querySelector<HTMLElement>("#export-notice");
  notice(message, "正在准备备份…");
  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "X-CSRF-Token": csrf() },
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error ?? "导出失败");
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `shuxin-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notice(message, "备份已生成，已开始下载。");
  } catch (e) {
    notice(message, (e as Error).message, true);
  } finally {
    exportButton.disabled = false;
  }
});


}
