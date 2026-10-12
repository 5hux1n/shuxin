import { createHash, createHmac, randomUUID } from "node:crypto";
import { HttpError } from "../http";
import type { StoreConfig } from "./config";
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const encodedPath = (value: string) => value.split("/").map(encode).join("/");
const hex = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Uint8Array, value: string, algorithm = "sha256") =>
  createHmac(algorithm, key).update(value).digest();
const base64url = (value: string | Uint8Array) =>
  Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
const xmlEscape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
function xmlValue(xml: string, tag: string) {
  const value = new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(xml)?.[1];
  if (!value) throw new HttpError(502, "对象存储返回了无效的上传结果");
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
async function request(
  url: URL | string,
  init: RequestInit = {},
  missingOK = false,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new HttpError(502, "无法连接对象存储，请检查地址、网络和区域配置");
  }
  if (!response.ok && !(missingOK && [404, 612].includes(response.status))) {
    await response.body?.cancel();
    throw new HttpError(
      502,
      `对象存储请求失败（HTTP ${response.status}），请检查凭据、权限和区域配置`,
    );
  }
  return response;
}
export class ObjectClient {
  constructor(private store: StoreConfig) {}
  key(filename: string) {
    return [this.store.prefix.replace(/\/$/, ""), filename]
      .filter(Boolean)
      .join("/");
  }
  private objectUrl(key: string) {
    const url = new URL(this.store.endpoint);
    if (this.store.pathStyle)
      url.pathname = `/${encode(this.store.bucket)}/${encodedPath(key)}`;
    else {
      if (!url.hostname.startsWith(`${this.store.bucket}.`))
        url.hostname = `${this.store.bucket}.${url.hostname}`;
      url.pathname = `/${encodedPath(key)}`;
    }
    return url;
  }
  private async signed(
    key: string,
    method: string,
    query: Record<string, string> = {},
    body?: Uint8Array | string,
    extra: Record<string, string> = {},
  ) {
    const url = this.objectUrl(key);
    for (const [name, value] of Object.entries(query))
      url.searchParams.set(name, value);
    const time = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""),
      date = time.slice(0, 8);
    const headers = new Headers(extra);
    const oss = this.store.provider === "oss";
    const prefix = oss ? "x-oss" : "x-amz";
    const algorithm = oss ? "OSS4-HMAC-SHA256" : "AWS4-HMAC-SHA256";
    const payload = oss ? "UNSIGNED-PAYLOAD" : hex(body ?? "");
    headers.set(`${prefix}-date`, time);
    headers.set(`${prefix}-content-sha256`, payload);
    // Range participates in the signature for both protocols.
    const names = [...headers.keys(), ...(oss ? [] : ["host"])].sort();
    const canonicalHeaders = names
      .map(
        (name) =>
          `${name}:${name === "host" ? url.host : headers.get(name)!.trim().replace(/\s+/g, " ")}\n`,
      )
      .join("");
    const additional = oss
      ? names
          .filter(
            (name) =>
              !name.startsWith("x-oss-") &&
              !["content-type", "content-md5"].includes(name),
          )
          .join(";")
      : names.join(";");
    const queryString = [...url.searchParams]
      .map(([k, v]) => [encode(k), encode(v)])
      .sort((a, b) =>
        a[0] < b[0]
          ? -1
          : a[0] > b[0]
            ? 1
            : a[1] < b[1]
              ? -1
              : a[1] > b[1]
                ? 1
                : 0,
      )
      .map(([k, v]) => (oss && !v ? k : `${k}=${v}`))
      .join("&");
    const uri = oss
      ? `/${encode(this.store.bucket)}/${encodedPath(key)}`
      : url.pathname;
    const canonical = [
      method,
      uri,
      queryString,
      canonicalHeaders,
      additional,
      payload,
    ].join("\n");
    const scope = `${date}/${this.store.region}/${oss ? "oss/aliyun_v4_request" : "s3/aws4_request"}`;
    let signingKey = hmac(
      `${oss ? "aliyun_v4" : "AWS4"}${this.store.secretKey}`,
      date,
    );
    for (const part of [
      this.store.region,
      oss ? "oss" : "s3",
      oss ? "aliyun_v4_request" : "aws4_request",
    ])
      signingKey = hmac(signingKey, part);
    const signature = hmac(
      signingKey,
      [algorithm, time, scope, hex(canonical)].join("\n"),
    ).toString("hex");
    headers.set(
      "Authorization",
      `${algorithm} Credential=${this.store.accessKey}/${scope}, ${oss ? "AdditionalHeaders" : "SignedHeaders"}=${additional}, Signature=${signature}`,
    );
    return request(
      url,
      {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : typeof body === "string"
              ? body
              : new Uint8Array(body),
      },
      method === "DELETE",
    );
  }
  private qiniuToken(key: string) {
    const policy = base64url(
      JSON.stringify({
        scope: `${this.store.bucket}:${key}`,
        deadline: Math.floor(Date.now() / 1000) + 86400,
        insertOnly: 1,
      }),
    );
    return `${this.store.accessKey}:${base64url(hmac(this.store.secretKey, policy, "sha1"))}:${policy}`;
  }
  private qiniuPath(key: string) {
    return `/buckets/${encode(this.store.bucket)}/objects/${base64url(key)}/uploads`;
  }
  private qiniuUpload(
    key: string,
    method: string,
    suffix = "",
    body?: Uint8Array | string,
    mime?: string,
  ) {
    return request(this.store.endpoint + this.qiniuPath(key) + suffix, {
      method,
      headers: {
        Authorization: `UpToken ${this.qiniuToken(key)}`,
        ...(mime ? { "Content-Type": mime } : {}),
      },
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : new Uint8Array(body),
    });
  }
  async put(
    key: string,
    size: number,
    read: (start: number, length: number) => Uint8Array,
    mime: string,
  ) {
    if (this.store.provider === "qiniu")
      return this.putQiniu(key, size, read, mime);
    if (size <= 8 * 1024 * 1024) {
      await (
        await this.signed(key, "PUT", {}, read(0, size), {
          "Content-Type": mime,
        })
      ).body?.cancel();
      return;
    }
    const begin = await this.signed(key, "POST", { uploads: "" }, undefined, {
      "Content-Type": mime,
    });
    const uploadId = xmlValue(await begin.text(), "UploadId");
    try {
      const parts: string[] = [];
      for (
        let offset = 0, part = 1;
        offset < size;
        offset += 8 * 1024 * 1024, part++
      ) {
        const response = await this.signed(
          key,
          "PUT",
          { uploadId, partNumber: String(part) },
          read(offset, Math.min(8 * 1024 * 1024, size - offset)),
        );
        const etag = response.headers.get("etag");
        await response.body?.cancel();
        if (!etag) throw new HttpError(502, "对象存储未返回分片 ETag");
        parts.push(
          `<Part><PartNumber>${part}</PartNumber><ETag>${xmlEscape(etag)}</ETag></Part>`,
        );
      }
      const finished = await this.signed(
        key,
        "POST",
        { uploadId },
        `<CompleteMultipartUpload>${parts.join("")}</CompleteMultipartUpload>`,
        { "Content-Type": "application/xml" },
      );
      const result = await finished.text();
      if (/<(?:\w+:)?Error[\s>]/.test(result))
        throw new HttpError(502, "对象存储合并文件失败，请重新上传");
    } catch (error) {
      try {
        await (await this.signed(key, "DELETE", { uploadId })).body?.cancel();
      } catch {
        console.error("[shuxin] multipart abort failed");
      }
      throw error;
    }
  }
  private async putQiniu(
    key: string,
    size: number,
    read: (start: number, length: number) => Uint8Array,
    mime: string,
  ) {
    const begin = (await (await this.qiniuUpload(key, "POST")).json()) as {
      uploadId?: string;
    };
    if (!begin.uploadId) throw new HttpError(502, "七牛云未返回上传任务");
    const suffix = `/${encode(begin.uploadId)}`;
    try {
      const parts: { partNumber: number; etag: string }[] = [];
      for (
        let offset = 0, partNumber = 1;
        offset < size;
        offset += 8 * 1024 * 1024, partNumber++
      ) {
        const part = (await (
          await this.qiniuUpload(
            key,
            "PUT",
            `${suffix}/${partNumber}`,
            read(offset, Math.min(8 * 1024 * 1024, size - offset)),
            "application/octet-stream",
          )
        ).json()) as { etag?: string };
        if (!part.etag) throw new HttpError(502, "七牛云未返回分片 ETag");
        parts.push({ partNumber, etag: part.etag });
      }
      await (
        await this.qiniuUpload(
          key,
          "POST",
          suffix,
          JSON.stringify({ parts, mimeType: mime }),
          "application/json",
        )
      ).body?.cancel();
    } catch (error) {
      try {
        await (await this.qiniuUpload(key, "DELETE", suffix)).body?.cancel();
      } catch {
        console.error("[shuxin] multipart abort failed");
      }
      throw error;
    }
  }
  private downloadUrl(key: string, signed = true) {
    if (this.store.provider !== "qiniu") return this.objectUrl(key);
    const url = new URL(`/${encodedPath(key)}`, this.store.downloadDomain);
    if (signed) {
      url.searchParams.set("e", String(Math.floor(Date.now() / 1000) + 300));
      const token = `${this.store.accessKey}:${base64url(hmac(this.store.secretKey, url.href, "sha1"))}`;
      url.searchParams.set("token", token);
    }
    return url;
  }
  async get(key: string, start: number, end: number) {
    const range = `bytes=${start}-${end}`;
    const response =
      this.store.provider === "qiniu"
        ? await request(this.downloadUrl(key), { headers: { Range: range } })
        : await this.signed(key, "GET", {}, undefined, { Range: range });
    if (
      response.status !== 206 ||
      response.headers.get("content-range")?.split("/")[0] !==
        `bytes ${start}-${end}`
    ) {
      await response.body?.cancel();
      throw new HttpError(502, "对象存储未正确响应文件范围请求");
    }
    return response;
  }
  async delete(key: string) {
    if (this.store.provider !== "qiniu") {
      await (await this.signed(key, "DELETE")).body?.cancel();
      return;
    }
    const url = new URL(
      `/delete/${base64url(`${this.store.bucket}:${key}`)}`,
      this.store.managementEndpoint || "https://rs.qiniuapi.com",
    );
    const token = `${this.store.accessKey}:${base64url(hmac(this.store.secretKey, `${url.pathname}\n`, "sha1"))}`;
    await (
      await request(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `QBox ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
        true,
      )
    ).body?.cancel();
  }
  async test() {
    const key = this.key(`connection-check-${randomUUID()}.txt`),
      data = Buffer.from("ShuXin storage connection check");
    let uploaded = false;
    try {
      await this.put(
        key,
        data.length,
        (start, length) => data.subarray(start, start + length),
        "text/plain",
      );
      uploaded = true;
      const read = await this.get(key, 0, data.length - 1);
      if (!Buffer.from(await read.arrayBuffer()).equals(data))
        throw new HttpError(502, "对象存储读写结果不一致");
      const publicRead = await fetch(this.downloadUrl(key, false), {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: { Range: "bytes=0-0" },
      });
      await publicRead.body?.cancel();
      if (![401, 403, 404].includes(publicRead.status))
        throw new HttpError(
          400,
          "存储桶或下载域名允许匿名访问，请关闭公开访问并设置为私有后重试",
        );
    } finally {
      if (uploaded) await this.delete(key);
    }
  }
}
