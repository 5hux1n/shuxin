import { api, notice, bindValidation } from "./api";
type Profile = {
  id: string;
  name: string;
  provider: string;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  pathStyle: boolean;
  downloadDomain: string;
  managementEndpoint: string;
};
type State = { active: string; profiles: Profile[] };
export function bindStorage() {
let state: State = JSON.parse(
  document.querySelector("#storage-data")!.textContent!,
);
const form = document.querySelector<HTMLFormElement>("#storage-form")!;
const select = document.querySelector<HTMLSelectElement>("#storage-profile")!;
const fields = document.querySelector<HTMLElement>("#storage-fields")!;
const test = document.querySelector<HTMLButtonElement>("#storage-test")!;
const message = form.querySelector<HTMLElement>(".notice");
const field = (name: string) =>
  form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
const locationFields = [
  "provider",
  "endpoint",
  "region",
  "bucket",
  "prefix",
  "pathStyle",
  "downloadDomain",
  "managementEndpoint",
];
function provider() {
  const value = field("provider").value;
  document.querySelector<HTMLElement>("#qiniu-fields")!.hidden =
    value !== "qiniu";
  const hints: Record<string, string> = {
    s3: "填写服务商提供的 S3 Endpoint；AWS 区域示例 us-east-1。MinIO 需使用服务器可访问的 HTTPS 地址。",
    oss: "Endpoint 示例 https://oss-cn-hangzhou.aliyuncs.com，Region 填 cn-hangzhou。使用阿里云 OSS 原生 V4 签名。",
    cos: "Endpoint 示例 https://cos.ap-guangzhou.myqcloud.com，Region 填 ap-guangzhou；Bucket 包含 APPID 后缀。",
    qiniu:
      "Endpoint 填所在区域的上传域名，例如华东 https://up.qiniup.com。配置私有空间的 HTTPS 下载域名，Region 可填 z0；管理地址留空使用 https://rs.qiniuapi.com。",
    r2: "Endpoint 填账号的 R2 S3 API 地址，Region 填 auto。",
  };
  document.querySelector("#storage-provider-hint")!.textContent = hints[value];
  (field("pathStyle") as HTMLInputElement).disabled =
    ["oss", "cos", "qiniu"].includes(value) || select.value !== "new";
  if (["oss", "cos", "qiniu"].includes(value))
    (field("pathStyle") as HTMLInputElement).checked = false;
}
function selection() {
  const profile = state.profiles.find((row) => row.id === select.value);
  fields.hidden = !select.value;
  test.hidden = !select.value;
  for (const name of [...locationFields, "name", "accessKey", "secretKey"]) {
    const input = field(name);
    input.disabled =
      !select.value || (Boolean(profile) && locationFields.includes(name));
    input.required =
      Boolean(select.value) &&
      ["name", "endpoint", "region", "bucket"].includes(name);
    if (name === "pathStyle")
      (input as HTMLInputElement).checked = profile?.pathStyle ?? false;
    else
      input.value = profile
        ? String(profile[name as keyof Profile] ?? "")
        : name === "prefix"
          ? "shuxin"
          : name === "provider"
            ? "s3"
            : "";
  }
  field("accessKey").required = select.value === "new";
  field("secretKey").required = select.value === "new";
  provider();
  notice(message, "");
}
select.addEventListener("change", selection);
field("provider").addEventListener("change", provider);
bindValidation(form);
function payload(action: string) {
  if (action === "cleanup") return { action };
  if (!select.value) return { action: "select", id: "" };
  const result: Record<string, unknown> = { action };
  if (select.value !== "new") result.id = select.value;
  for (const name of [...locationFields, "name", "accessKey", "secretKey"])
    result[name] =
      name === "pathStyle"
        ? (field(name) as HTMLInputElement).checked
        : field(name).value;
  return result;
}
async function submit(action: string) {
  const data = payload(action);
  const buttons = [...form.querySelectorAll<HTMLButtonElement>("button")];
  if (buttons[0].disabled) return;
  buttons.forEach((button) => (button.disabled = true));
  select.disabled = true;
  notice(message, action === "cleanup" ? "正在清理文件…" : action === "test" ? "正在测试存储连接…" : "正在保存存储设置…");
  try {
    const result = await api("/api/storage", data);
    if (result.storage) {
      state = result.storage as State;
      select.replaceChildren(
        new Option("默认存储", ""),
        ...state.profiles.map((row) => new Option(row.name, row.id)),
        new Option("新增对象存储", "new"),
      );
      select.value = state.active;
      selection();
    }
    if (action === "save") {
      field("accessKey").value = "";
      field("secretKey").value = "";
    }
    notice(message, result.message);
  } catch (error) {
    notice(message, (error as Error).message, true);
  } finally {
    buttons.forEach((button) => (button.disabled = false));
    select.disabled = false;
  }
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void submit("save");
});
test.addEventListener("click", () => {
  if (form.reportValidity()) void submit("test");
});
document
  .querySelector("#storage-cleanup")!
  .addEventListener("click", () => void submit("cleanup"));
selection();

}
