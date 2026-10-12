import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac, createHash, randomBytes } from "node:crypto";
import { build } from "esbuild";
import { unzipSync } from "fflate";
import Database from "better-sqlite3";
const folder = mkdtempSync(path.join(tmpdir(), "shuxin-storage-"));
const output = path.resolve("node_modules/.cache/shuxin-storage/entry.mjs");
mkdirSync(path.dirname(output), { recursive: true });
process.env.DATA_DIR = folder;
process.env.SESSION_SECRET = randomBytes(32).toString("hex");
await build({
  stdin: {
    contents: `export * from "./src/lib/storage/config"; export * from "./src/lib/storage/media"; export * from "./src/lib/storage/client"; export { db, sqlite } from "./src/lib/db"; export * as schema from "./src/lib/db/schema"; export { exportBackup } from "./src/lib/backup";`,
    resolveDir: process.cwd(),
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  define: { "import.meta.env.DEV": "false" },
  logLevel: "silent",
});
const module = await import(output + `?v=${Date.now()}`);
const {
  ObjectClient,
  storageInput,
  saveStore,
  prepareStore,
  selectStore,
  storageSettings,
  promoteMedia,
  streamMedia,
  mediaSize,
  removeFile,
  cleanupOrphans,
  db,
  schema,
  exportBackup,
  sqlite,
} = module;
const { eq } = await import("drizzle-orm");
let checks = 0;
function check(value, label) {
  assert.ok(value, label);
  checks++;
}
const secret = "isolated-fixture-secret",
  access = "isolated-fixture-access";
const hmac = (key, value, algo = "sha256") =>
  createHmac(algo, key).update(value).digest();
const hex = (value) => createHash("sha256").update(value).digest("hex");
const b64 = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
const escape = (value) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const objects = new Map(),
  multipart = new Map();
let denyDelete = false,
  publicBucket = false,
  failPart = false;
const realFetch = globalThis.fetch;
function verifySigned(url, method, headers, body) {
  const auth = headers.get("authorization");
  const oss = auth.startsWith("OSS4-");
  const credential = /Credential=([^, ]+)/.exec(auth)[1];
  const [ak, date, region, service, terminal] = credential.split("/");
  check(ak === access, "fixture access key");
  const time = headers.get(oss ? "x-oss-date" : "x-amz-date");
  const signedNames = /(?:SignedHeaders|AdditionalHeaders)=([^,]*)/.exec(
    auth,
  )[1];
  const names = oss
    ? [...headers.keys()]
        .filter(
          (name) =>
            name.startsWith("x-oss-") ||
            ["content-type", "content-md5"].includes(name) ||
            signedNames.split(";").includes(name),
        )
        .sort()
    : signedNames.split(";");
  const canonicalHeaders = names
    .map(
      (name) =>
        `${name}:${name === "host" ? url.host : headers.get(name).trim()}\n`,
    )
    .join("");
  const qs = [...url.searchParams]
    .map(([k, v]) => [escape(k), escape(v)])
    .sort((a, b) => a[0].localeCompare(b[0], "en", { sensitivity: "variant" }))
    .map(([k, v]) => (oss && !v ? k : `${k}=${v}`))
    .join("&");
  const bucket = url.hostname.split(".")[0];
  const uri = oss ? `/${bucket}${url.pathname}` : url.pathname;
  const payloadHash = oss ? "UNSIGNED-PAYLOAD" : hex(body);
  check(
    headers.get(oss ? "x-oss-content-sha256" : "x-amz-content-sha256") ===
      payloadHash,
    "payload hash",
  );
  const canonical = [
    method,
    uri,
    qs,
    canonicalHeaders,
    signedNames,
    payloadHash,
  ].join("\n");
  let signingKey = hmac(`${oss ? "aliyun_v4" : "AWS4"}${secret}`, date);
  for (const part of [region, service, terminal])
    signingKey = hmac(signingKey, part);
  const expected = hmac(
    signingKey,
    [
      oss ? "OSS4-HMAC-SHA256" : "AWS4-HMAC-SHA256",
      time,
      `${date}/${region}/${service}/${terminal}`,
      hex(canonical),
    ].join("\n"),
  ).toString("hex");
  check(
    auth.endsWith(`Signature=${expected}`),
    "canonical signature validated by fixture",
  );
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input),
    method = init.method || "GET",
    headers = new Headers(init.headers),
    body = Buffer.from(init.body ?? "");
  if (url.hostname === "download.storage.example") {
    const raw = new URL(url);
    raw.searchParams.delete("token");
    const token = url.searchParams.get("token");
    if (!token)
      return new Response(publicBucket ? "x" : null, {
        status: publicBucket ? 200 : 403,
      });
    check(
      token === `${access}:${b64(hmac(secret, raw.href, "sha1"))}`,
      "qiniu private download signature",
    );
    return range(
      objects.get("qiniu:" + decodeURIComponent(url.pathname.slice(1))),
      headers,
    );
  }
  if (url.pathname.startsWith("/delete/")) {
    check(
      headers.get("authorization") ===
        `QBox ${access}:${b64(hmac(secret, decodeURIComponent(url.pathname) + "\n", "sha1"))}`,
      "qiniu delete signature",
    );
    if (denyDelete) return new Response(null, { status: 403 });
    const entry = Buffer.from(
      url.pathname.slice(8),
      "base64",
    ).toString();
    objects.delete("qiniu:" + entry.slice(entry.indexOf(":") + 1));
    return new Response(null, { status: 200 });
  }
  if (url.pathname.startsWith("/buckets/")) {
    const match =
      /^\/buckets\/([^/]+)\/objects\/([^/]+)\/uploads(?:\/([^/]+))?(?:\/(\d+))?$/.exec(
        url.pathname,
      );
    assert.ok(match);
    const key = Buffer.from(decodeURIComponent(match[2]), "base64").toString(),
      token = headers.get("authorization").slice(8),
      [ak, sign, encoded] = token.split(":");
    check(
      ak === access && sign === b64(hmac(secret, encoded, "sha1")),
      "qiniu upload token signature",
    );
    const policy = JSON.parse(Buffer.from(encoded, "base64").toString());
    check(
      policy.scope === `${match[1]}:${key}` && policy.insertOnly === 1,
      "qiniu token scope",
    );
    if (!match[3]) {
      multipart.set("qiniu:" + key, []);
      return Response.json({ uploadId: "fixture" });
    }
    if (method === "DELETE") {
      multipart.delete("qiniu:" + key);
      return Response.json({});
    }
    if (match[4]) {
      if (failPart) return new Response(null, { status: 503 });
      multipart.get("qiniu:" + key)[Number(match[4]) - 1] = body;
      return Response.json({ etag: hex(body) });
    }
    const parts = JSON.parse(body).parts,
      bytes = multipart.get("qiniu:" + key);
    check(
      parts.every((p, i) => p.partNumber === i + 1 && p.etag === hex(bytes[i])),
      "qiniu completion parts",
    );
    objects.set("qiniu:" + key, Buffer.concat(bytes));
    multipart.delete("qiniu:" + key);
    return Response.json({ key });
  }
  const key = url.origin + url.pathname;
  if (!headers.has("authorization"))
    return new Response(publicBucket ? "x" : null, {
      status: publicBucket ? 200 : 403,
    });
  verifySigned(url, method, headers, body);
  if (method === "DELETE") {
    if (denyDelete) return new Response(null, { status: 403 });
    if (url.searchParams.has("uploadId")) multipart.delete(key);
    else objects.delete(key);
    return new Response(null, { status: 204 });
  }
  if (url.searchParams.has("uploads")) {
    multipart.set(key, []);
    return new Response("<UploadId>fixture</UploadId>");
  }
  if (method === "PUT" && url.searchParams.has("partNumber")) {
    if (failPart) return new Response(null, { status: 503 });
    multipart.get(key)[Number(url.searchParams.get("partNumber")) - 1] = body;
    return new Response(null, { headers: { etag: '"' + hex(body) + '"' } });
  }
  if (method === "POST") {
    const list = multipart.get(key);
    check(
      list.slice(0, -1).every((p) => p.length >= 5 * 1024 * 1024),
      "nonfinal S3 parts meet minimum",
    );
    objects.set(key, Buffer.concat(list));
    multipart.delete(key);
    return new Response("<CompleteMultipartUploadResult/>");
  }
  if (method === "PUT") {
    objects.set(key, body);
    return new Response(null, { status: 200 });
  }
  return range(objects.get(key), headers);
};
function range(bytes, headers) {
  if (!bytes) return new Response(null, { status: 404 });
  const match = /^bytes=(\d+)-(\d+)$/.exec(headers.get("range"));
  assert.ok(match);
  const start = Number(match[1]),
    end = Number(match[2]);
  return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
    status: 206,
    headers: { "Content-Range": `bytes ${start}-${end}/${bytes.length}` },
  });
}
try {
  const profiles = [];
  for (const provider of ["s3", "r2", "oss", "cos", "qiniu"]) {
    const configuration = storageInput.parse({
      name: provider,
      provider,
      endpoint: "https://storage.example",
      region: provider === "r2" ? "auto" : "cn-hangzhou",
      bucket: "fixture-bucket",
      prefix: "shuxin",
      pathStyle: provider === "s3",
      downloadDomain:
        provider === "qiniu" ? "https://download.storage.example" : "",
      accessKey: access,
      secretKey: secret,
    });
    const client = new ObjectClient(configuration);
    await client.test();
    const bytes = Buffer.alloc(9 * 1024 * 1024, 42),
      key = client.key(provider + ".bin");
    await client.put(
      key,
      bytes.length,
      (start, length) => bytes.subarray(start, start + length),
      "application/octet-stream",
    );
    check(
      Buffer.from(await (await client.get(key, 100, 199)).arrayBuffer()).equals(
        bytes.subarray(100, 200),
      ),
      `${provider} multipart range`,
    );
    await client.delete(key);
    publicBucket = true;
    await assert.rejects(client.test(), /匿名访问/);
    publicBucket = false;
    checks++;
    failPart = true;
    await assert.rejects(
      client.put(
        key,
        bytes.length,
        (start, length) => bytes.subarray(start, start + length),
        "application/octet-stream",
      ),
    );
    failPart = false;
    check(multipart.size === 0, `${provider} aborted failed multipart`);
    profiles.push(saveStore(configuration));
  }
  check(
    !JSON.stringify(storageSettings()).includes(access) &&
      !JSON.stringify(storageSettings()).includes(secret),
    "admin payload excludes credentials",
  );
  check(
    !db
      .select()
      .from(schema.objectStores)
      .all()
      .some((row) => row.configuration.includes(secret)),
    "encrypted credentials in database",
  );
  const profile = storageSettings().profiles[0];
  const retained = prepareStore({ ...profile, accessKey: "", secretKey: "" });
  check(retained.secretKey === secret, "blank credential retains secret");
  assert.throws(
    () => prepareStore({ ...profile, bucket: "other-bucket" }),
    /位置不能修改/,
  );
  checks++;
  const id = "90f85594-a64a-4562-93ec-c0eb35473564",
    key = `${id}.bin`,
    bytes = Buffer.from("persist across storage switching");
  writeFileSync(path.join(folder, "media", key), bytes);
  db.insert(schema.media)
    .values({
      id,
      key,
      mime: "application/octet-stream",
      width: 0,
      height: 0,
      createdAt: Date.now(),
    })
    .run();
  selectStore(profiles[0]);
  await promoteMedia(id);
  selectStore(profiles[4]);
  check(mediaSize(key) === bytes.length, "remote size cached");
  check(
    Buffer.from(
      await new Response(
        await streamMedia(key, 0, bytes.length - 1),
      ).arrayBuffer(),
    ).equals(bytes),
    "old object retains original provider",
  );
  const zip = unzipSync(
    new Uint8Array(await new Response(await exportBackup()).arrayBuffer()),
  );
  check(
    Buffer.from(zip[`media/${key}`]).equals(bytes),
    "backup contains remote bytes",
  );
  const restored = path.join(folder, "restored.sqlite");
  writeFileSync(restored, zip["shuxin.sqlite"]);
  const backupDb = new Database(restored);
  check(
    backupDb.prepare("SELECT count(*) AS n FROM object_stores").get().n === 0 &&
      backupDb.prepare("SELECT count(*) AS n FROM media_objects").get().n === 0,
    "backup normalizes to builtin and excludes credentials",
  );
  backupDb.close();
  db.delete(schema.media).where(eq(schema.media.id, id)).run();
  denyDelete = true;
  check(!(await removeFile(key)), "delete failure queued");
  denyDelete = false;
  check(
    (await cleanupOrphans()).failed === 0 &&
      db.select().from(schema.mediaObjects).all().length === 0,
    "orphan cleanup retries deletion",
  );
  check(
    objects.size === 0 && multipart.size === 0,
    "fixture objects cleaned up",
  );
  console.log(
    `Storage acceptance: ${checks} checks passed (isolated protocol fixtures; no provider account credentials used).`,
  );
} finally {
  globalThis.fetch = realFetch;
  sqlite.close();
  rmSync(folder, { recursive: true, force: true });
}
