import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { objectStores, settings } from "../db/schema";
import { config } from "../config";
import { HttpError } from "../http";

export function storageOrigin(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    host === "localhost" ||
    !host.includes(".") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":")
  )
    throw new Error("请使用不带路径的公网 HTTPS 域名");
  return url.origin;
}
const origin = z.string().transform((value, ctx) => {
  try {
    return storageOrigin(value);
  } catch {
    ctx.addIssue({
      code: "custom",
      message: "存储地址必须为不带路径的公网 HTTPS 域名",
    });
    return z.NEVER;
  }
});
export const storageInput = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(80),
    provider: z.enum(["s3", "r2", "oss", "cos", "qiniu"]),
    endpoint: origin,
    region: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9-]{1,80}$/),
    bucket: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}$/),
    prefix: z
      .string()
      .trim()
      .max(160)
      .regex(/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*$/)
      .default("shuxin"),
    pathStyle: z.boolean().default(false),
    downloadDomain: z.union([z.literal(""), origin]).default(""),
    managementEndpoint: z.union([z.literal(""), origin]).default(""),
    accessKey: z.string().trim().max(256).default(""),
    secretKey: z.string().trim().max(256).default(""),
  })
  .superRefine((value, ctx) => {
    if (value.provider === "qiniu" && !value.downloadDomain)
      ctx.addIssue({
        code: "custom",
        message: "七牛云需要配置私有空间的 HTTPS 下载域名",
      });
    if (["oss", "cos"].includes(value.provider) && value.pathStyle)
      ctx.addIssue({
        code: "custom",
        message: "阿里云 OSS、腾讯云 COS 请使用虚拟主机寻址",
      });
  });
export type StoreConfig = z.infer<typeof storageInput>;
const activeKey = "mediaStoreId";
function encryptionKey() {
  if (config.secret.length < 32) throw new HttpError(500, "请先配置会话密钥");
  return createHash("sha256")
    .update(`shuxin-object-storage-v1:${config.secret}`)
    .digest();
}
export function seal(value: StoreConfig) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}
export function unseal(value: string): StoreConfig {
  try {
    const [version, iv, tag, payload] = value.split(".");
    if (version !== "v1") throw new Error("version");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(iv, "base64"),
    );
    cipher.setAuthTag(Buffer.from(tag, "base64"));
    return storageInput.parse(
      JSON.parse(
        Buffer.concat([
          cipher.update(Buffer.from(payload, "base64")),
          cipher.final(),
        ]).toString(),
      ),
    );
  } catch {
    throw new HttpError(
      503,
      "存储配置无法解密，请恢复原 SESSION_SECRET 或重新配置存储凭据",
    );
  }
}
export function getStore(id: string) {
  const row = db
    .select()
    .from(objectStores)
    .where(eq(objectStores.id, id))
    .get();
  if (!row) throw new HttpError(503, "文件的存储配置不存在");
  return unseal(row.configuration);
}
export function activeStoreId() {
  return (
    db.select().from(settings).where(eq(settings.key, activeKey)).get()
      ?.value || ""
  );
}
export function selectStore(id: string) {
  if (id) getStore(id);
  db.insert(settings)
    .values({ key: activeKey, value: id })
    .onConflictDoUpdate({ target: settings.key, set: { value: id } })
    .run();
}
export function storageSettings() {
  return {
    active: activeStoreId(),
    profiles: db
      .select()
      .from(objectStores)
      .all()
      .map((row) => {
        const {
          accessKey: _ak,
          secretKey: _sk,
          ...safe
        } = unseal(row.configuration);
        return { ...safe, id: row.id, hasCredentials: true };
      }),
  };
}
export function prepareStore(raw: unknown) {
  const input = storageInput.parse(raw);
  if (input.id) {
    const previous = getStore(input.id);
    for (const key of [
      "provider",
      "endpoint",
      "region",
      "bucket",
      "prefix",
      "pathStyle",
      "downloadDomain",
      "managementEndpoint",
    ] as const)
      if (input[key] !== previous[key])
        throw new HttpError(
          400,
          "已有配置的存储位置不能修改，请新增配置；原文件继续使用旧配置",
        );
    input.accessKey ||= previous.accessKey;
    input.secretKey ||= previous.secretKey;
  }
  if (!input.accessKey || !input.secretKey)
    throw new HttpError(400, "请填写 Access Key 和 Secret Key");
  return input;
}
export function saveStore(input: StoreConfig) {
  const id = input.id || randomUUID();
  db.insert(objectStores)
    .values({
      id,
      name: input.name,
      configuration: seal({ ...input, id }),
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: objectStores.id,
      set: { name: input.name, configuration: seal({ ...input, id }) },
    })
    .run();
  selectStore(id);
  return id;
}
