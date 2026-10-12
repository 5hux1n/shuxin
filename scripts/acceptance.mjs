import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import Database from "better-sqlite3";
import { unzipSync, strFromU8 } from "fflate";
const worker = process.argv.includes("--worker");
const port = worker ? 4324 : 4323;
const origin = `http://localhost:${port}`;
const folder = mkdtempSync(path.join(tmpdir(), "shuxin-acceptance-"));
const secret = randomBytes(32).toString("hex");
const env = {
  ...process.env,
  SITE_URL: origin,
  SESSION_SECRET: secret,
  DATA_DIR: folder,
  HOST: "127.0.0.1",
  PORT: String(port),
};
const server = worker
  ? spawn(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "dev",
        "--local-upstream",
        `localhost:${port}`,
        "--config",
        "dist-worker/server/wrangler.json",
        "--port",
        String(port),
        "--persist-to",
        path.join(folder, "worker"),
        "--var",
        `SITE_URL:${origin}`,
        "--var",
        `SESSION_SECRET:${secret}`,
      ],
      { env },
    )
  : spawn(process.execPath, ["dist/server/entry.mjs"], { env });
let output = "";
server.stdout.on("data", (c) => (output += c));
server.stderr.on("data", (c) => (output += c));
let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}
class Client {
  jar = new Map();
  csrf = "";
  async get(url) {
    const res = await fetch(origin + url, {
      headers: { Cookie: this.cookie() },
      redirect: "manual",
    });
    this.capture(res);
    const text = await res.text();
    this.csrf =
      text.match(/name="csrf-token" content="([^"]+)"/)?.[1] || this.csrf;
    return { res, text };
  }
  cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  capture(res) {
    for (const raw of res.headers.getSetCookie()) {
      const [entry] = raw.split(";");
      const index = entry.indexOf("=");
      const k = entry.slice(0, index),
        v = entry.slice(index + 1);
      if (v) this.jar.set(k, v);
      else this.jar.delete(k);
    }
  }
  async request(url, data, method = "POST", options = {}) {
    const headers = {
      Cookie: this.cookie(),
      Origin: options.origin ?? origin,
      "X-CSRF-Token": options.csrf ?? this.csrf,
      "Content-Type": options.mime ?? "application/json",
      ...(options.headers ?? {}),
    };
    const res = await fetch(origin + url, {
      method,
      headers,
      body: Buffer.isBuffer(data)
        ? data
        : data === undefined
          ? undefined
          : JSON.stringify(data),
      redirect: "manual",
    });
    this.capture(res);
    const type = res.headers.get("content-type") ?? "";
    return {
      res,
      data: type.includes("json")
        ? await res.json()
        : Buffer.from(await res.arrayBuffer()),
    };
  }
}
async function run() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin);
      if (r.status === 200) break;
    } catch {
      // The server may still be starting. Retry within the bounded startup loop.
    }
    if (server.exitCode !== null)
      throw new Error("Server failed: " + output.slice(-3000));
    if (i === 99)
      throw new Error("Server startup timed out: " + output.slice(-3000));
    await new Promise((r) => setTimeout(r, 200));
  }
  const anon = new Client(),
    admin = new Client();
  await anon.get("/");
  await admin.get("/admin/setup");
  check(
    (await anon.request("/api/posts", {})).res.status === 401,
    "anonymous write blocked",
  );
  check(
    (await anon.request("/api/storage", { action: "select", id: "" })).res
      .status === 401,
    "anonymous storage settings blocked",
  );
  const credentials = {
    username: "review_owner",
    displayName: "验收站长",
    password: "a",
  };
  check(
    (
      await admin.request("/api/auth/setup", credentials, "POST", {
        csrf: "invalid",
      })
    ).res.status === 403,
    "CSRF blocked",
  );
  check(
    (
      await admin.request("/api/auth/setup", credentials, "POST", {
        origin: "https://evil.example",
      })
    ).res.status === 403,
    "foreign Origin blocked",
  );
  check(
    (await admin.request("/api/auth/setup", { ...credentials, password: "" }))
      .res.status === 400,
    "empty setup password rejected",
  );
  check(
    (await admin.request("/api/auth/setup", credentials)).res.status === 200,
    "setup works without an initialization key",
  );
  check(
    (await admin.request("/api/auth/setup", credentials)).res.status === 409,
    "second setup blocked",
  );
  const accountSystemPage = await admin.get("/admin/system");
  check(
    accountSystemPage.res.status === 200 && accountSystemPage.text.includes('id="login-name-form"'),
    "system settings page available",
  );
  check(
    (await anon.get("/admin/system")).res.status === 302,
    "system settings require login",
  );
  check(
    (
      await admin.request(
        "/api/storage",
        { action: "select", id: "" },
        "POST",
        { csrf: "invalid" },
      )
    ).res.status === 403,
    "storage CSRF blocked",
  );
  const storageSelected = await admin.request("/api/storage", {
    action: "select",
    id: "",
  });
  check(
    storageSelected.res.status === 200 &&
      storageSelected.data.storage.active === "",
    "builtin storage can be selected",
  );
  check(
    (
      await admin.request("/api/storage", {
        action: "select",
        id: "a0bbf1d4-5424-4a39-a566-bc05ed72a421",
      })
    ).res.status === 503,
    "unknown storage profile rejected",
  );
  check(
    (
      await admin.request("/api/storage", {
        action: "test",
        name: "invalid",
        provider: "oss",
        endpoint: "http://127.0.0.1",
        region: "cn-hangzhou",
        bucket: "test-bucket",
        accessKey: "fixture",
        secretKey: "fixture",
      })
    ).res.status === 400,
    "unsafe storage endpoint blocked",
  );
  const systemPage = await admin.get("/admin/storage");
  check(
    systemPage.text.includes("七牛云 Kodo") &&
      systemPage.text.includes("腾讯云 COS") &&
      systemPage.text.includes("阿里云 OSS"),
    "provider settings rendered",
  );
  check(
    (await anon.get("/admin/storage")).res.status === 302,
    "storage settings protected",
  );
  check(
    !(await admin.get("/admin/system")).text.includes('id="storage-form"'),
    "storage separated from system settings",
  );
  for (const url of [
    "http://example.com/a.jpg",
    "https://127.0.0.1/a.jpg",
    "https://localhost/a.jpg",
    "https://user:password@example.com/a.jpg",
    "javascript:alert(1)",
  ]) {
    check(
      (
        await admin.request("/api/settings", {
          backgroundMode: "image",
          backgroundUrl: url,
        })
      ).res.status === 400,
      "unsafe background URL rejected",
    );
  }
  check(
    (
      await admin.request("/api/settings", {
        backgroundMode: "api",
        backgroundUrl: "",
      })
    ).res.status === 400,
    "API background needs URL",
  );
  check(
    (
      await admin.request("/api/settings", {
        backgroundApiField: "data[0].url",
      })
    ).res.status === 400,
    "JSON field validates dot syntax",
  );
  const bg = await admin.request("/api/settings", {
    backgroundMode: "api",
    backgroundUrl: "https://example.com/wallpaper",
    backgroundApiType: "json",
    backgroundApiField: "images.0.url",
    backgroundOpacity: 35,
  });
  check(
    bg.res.status === 200 && bg.data.background.backgroundOpacity === "35",
    "JSON background settings saved",
  );
  const bgHome = await anon.get("/");
  check(
    bgHome.text.includes('data-background-field="images.0.url"') &&
      bgHome.res.headers
        .get("Content-Security-Policy")
        .includes("connect-src 'self' https://example.com"),
    "JSON background rendering and CSP use selected API",
  );
  check(
    (
      await admin.request("/api/settings", {
        backgroundMode: "bing",
        backgroundUrl: "",
      })
    ).res.status === 200,
    "Bing preset saved",
  );
  check(
    (await anon.get("/")).text.includes(
      'data-background-source="/api/background/bing"',
    ),
    "Bing preset rendered",
  );
  await admin.request("/api/settings", {
    backgroundMode: "upload",
    backgroundUrl: "",
    backgroundOpacity: 20,
  });
  check(
    (
      await anon.request("/api/music/import", {
        source: "https://example.com/a.mp3",
      })
    ).res.status === 401,
    "unified music import protected",
  );
  const singleAudio = await admin.request("/api/music/import", {
    source: "https://example.com/a.mp3",
  });
  check(
    singleAudio.res.status === 200 && singleAudio.data.kind === "audio",
    "unified music recognizes direct audio",
  );
  const audioList = await admin.request("/api/music/import", {
    source: "https://example.com/a.mp3\nhttps://example.com/b.flac",
  });
  check(
    audioList.res.status === 200 &&
      audioList.data.kind === "playlist" &&
      audioList.data.playlist.tracks.length === 2,
    "unified music recognizes audio list",
  );
  const jsonList = await admin.request("/api/music/import", {
    source: JSON.stringify({
      tracks: [{ title: "歌曲", url: "https://example.com/a.mp3" }],
    }),
  });
  check(
    jsonList.res.status === 200 && jsonList.data.kind === "playlist",
    "unified music recognizes JSON playlist",
  );
  check(
    (await admin.request("/api/music/import", { source: "invalid" })).res
      .status === 400,
    "unified music reports invalid source",
  );
  const cookie = admin.jar.get("shuxin_session");
  check(Boolean(cookie) && cookie.length === 64, "random session token");
  const sessionReader = new Client();
  sessionReader.jar.set("shuxin_session", cookie);
  check(
    (await sessionReader.get("/admin")).res.status === 200,
    "session persists",
  );
  check(
    (
      await admin.request("/api/posts", {
        body: "",
        status: "published",
        visibility: "public",
        pinned: false,
        images: [],
      })
    ).res.status === 400,
    "empty post rejected",
  );
  const categoryName = "分类-" + randomBytes(6).toString("hex");
  check((await anon.request("/api/categories", { name: categoryName })).res.status === 401, "category mutations require owner");
  check((await admin.request("/api/categories", { name: categoryName }, "POST", { csrf: "invalid" })).res.status === 403, "category mutations require CSRF");
  const category = await admin.request("/api/categories", { name: categoryName });
  check(category.res.status === 201, "category created");
  const categoryId = category.data.category.id;
  check((await admin.request("/api/categories", { name: categoryName })).res.status === 409, "duplicate category rejected");
  const titledInput = { title: "title-" + randomBytes(6).toString("hex"), categoryId, body: "分类正文", status: "published", visibility: "public", pinned: true, images: [] };
  const titled = await admin.request("/api/posts", titledInput);
  check(titled.res.status === 201 && titled.data.post.title === titledInput.title && titled.data.post.categoryId === categoryId, "title and category saved");
  const titledPage = await anon.get(`/p/${titled.data.post.id}`);
  check(titledPage.text.includes(titledInput.title) && titledPage.text.includes(categoryName), "title and category rendered");
  check((await anon.get(`/search?q=${titledInput.title}`)).text.includes(titled.data.post.id), "title searchable without matching body");
  const renamedCategory = categoryName + "改";
  check((await admin.request(`/api/categories/${categoryId}`, { name: renamedCategory }, "PATCH")).res.status === 200, "category renamed");
  check((await anon.get(`/p/${titled.data.post.id}`)).text.includes(renamedCategory), "category rename reflected on existing post");
  const categoryExport = await admin.request("/api/export", undefined);
  const categoryArchive = unzipSync(categoryExport.data);
  const categoryContent = JSON.parse(strFromU8(categoryArchive["content.json"]));
  check(categoryContent.categories.some((item) => item.id === categoryId && item.name === renamedCategory), "backup includes categories");
  check(categoryContent.posts.some((item) => item.id === titled.data.post.id && item.title === titledInput.title), "backup includes post title");
  const categoryRestorePath = path.join(folder, "category-restore.sqlite");
  if (categoryArchive["shuxin.sqlite"]) writeFileSync(categoryRestorePath, categoryArchive["shuxin.sqlite"]);
  const categoryRestored = new Database(categoryRestorePath);
  if (categoryArchive["database.sql"]) categoryRestored.exec(strFromU8(categoryArchive["database.sql"]));
  check(categoryRestored.prepare("SELECT p.title,c.name FROM posts p JOIN categories c ON p.category_id=c.id WHERE p.id=?").get(titled.data.post.id)?.name === renamedCategory, "backup restores category association");
  categoryRestored.close();
  check((await admin.request(`/api/categories/${categoryId}`, undefined, "DELETE")).res.status === 200, "category deleted");
  const retainedPage = await anon.get(`/p/${titled.data.post.id}`);
  check(retainedPage.res.status === 200 && retainedPage.text.includes(titledInput.title) && !retainedPage.text.includes(renamedCategory), "category deletion retains post and clears badge");
  check((await admin.request("/api/posts", titledInput)).res.status === 400, "deleted category rejected when saving post");
  check((await admin.request(`/api/posts/${titled.data.post.id}`, { ...titledInput, title: "", categoryId: null, updatedAt: titled.data.post.updatedAt }, "PATCH")).res.status === 200, "title and category can be cleared");
  check((await admin.request(`/api/posts/${titled.data.post.id}`, undefined, "DELETE")).res.status === 200, "category fixture cleanup");
  const marker = "review-" + randomBytes(8).toString("hex");
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#769678" },
  })
    .png()
    .toBuffer();
  check(
    (
      await admin.request(
        "/api/media",
        Buffer.from('<svg onload="alert(1)"></svg>'),
        "POST",
        { mime: "image/png" },
      )
    ).res.status === 400,
    "SVG spoof rejected",
  );
  check(
    (
      await admin.request("/api/media", Buffer.from("not a jpeg"), "POST", {
        mime: "image/jpeg",
      })
    ).res.status === 400,
    "corrupt image rejected",
  );
  const portrait = await sharp({
    create: { width: 8, height: 4, channels: 3, background: "#769678" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const oriented = await admin.request("/api/media", portrait, "POST", {
    mime: "image/jpeg",
  });
  check(
    oriented.res.status === 201 &&
      oriented.data.width === 4 &&
      oriented.data.height === 8,
    "JPEG EXIF orientation normalized",
  );
  const gif = await admin.request(
    "/api/media",
    readFileSync("scripts/fixtures/animated.gif"),
    "POST",
    { mime: "image/gif" },
  );
  check(gif.res.status === 201, "animated GIF upload");
  const gifRead = await fetch(origin + gif.data.url, {
    headers: { Cookie: admin.cookie() },
  });
  const gifBytes = Buffer.from(await gifRead.arrayBuffer());
  check(
    gifRead.headers.get("content-type") === "image/gif",
    "GIF served as animation",
  );
  check(
    (
      await sharp(gifBytes)
        .metadata()
        .catch(() => ({ pages: 0 }))
    ).pages === 2,
    "GIF keeps both frames",
  );
  check(
    gifBytes[gifBytes.length - 1] === 0x3b,
    "GIF storage contains no trailing buffer bytes",
  );
  const cover = await admin.request("/api/media", png, "POST", {
    mime: "image/png",
  });
  check(
    (
      await admin.request(
        `/api/media/live?image=${cover.data.id}`,
        Buffer.from("invalid video"),
        "POST",
        { mime: "video/mp4" },
      )
    ).res.status === 400,
    "invalid Live Photo video rejected",
  );
  const live = await admin.request(
    `/api/media/live?image=${cover.data.id}`,
    readFileSync("scripts/fixtures/live.mp4"),
    "POST",
    { mime: "video/mp4" },
  );
  check(live.res.status === 201, "Live Photo video upload");
  check(
    (await anon.get(live.data.url)).res.status === 404,
    "unattached Live Photo video protected",
  );
  const liveInput = {
    body: "Live Photo fixture",
    status: "published",
    visibility: "public",
    pinned: false,
    images: [{ id: cover.data.id, alt: "动态照片" }],
  };
  const livePost = await admin.request("/api/posts", liveInput);
  check(livePost.res.status === 201, "Live Photo publication");
  check(
    (await anon.get(`/p/${livePost.data.post.id}`)).text.includes(
      `<source src="${live.data.url}"`,
    ),
    "Live Photo player rendered",
  );
  check(
    (await anon.get(live.data.url)).res.status === 200,
    "public Live Photo video readable",
  );
  const videoBytes = await fetch(origin + live.data.url);
  check(
    (await videoBytes.arrayBuffer()).byteLength ===
      readFileSync("scripts/fixtures/live.mp4").length,
    "Live Photo storage preserves exact clip length",
  );
  const range = await fetch(origin + live.data.url, {
    headers: { Range: "bytes=0-15" },
  });
  check(
    range.status === 206 && (await range.arrayBuffer()).byteLength === 16,
    "video byte range",
  );
  check(
    (
      await fetch(origin + live.data.url, {
        headers: { Range: "bytes=99999999-" },
      })
    ).status === 416,
    "invalid range rejected",
  );
  const liveBackup = unzipSync((await admin.request("/api/export")).data);
  check(
    Boolean(liveBackup[`media/${live.data.id}.mp4`]) &&
      Boolean(liveBackup[`media/${gif.data.id}.gif`]),
    "backup includes animation and Live Photo clip",
  );
  const livePrivate = await admin.request(
    `/api/posts/${livePost.data.post.id}`,
    {
      ...liveInput,
      visibility: "private",
      updatedAt: livePost.data.post.updatedAt,
    },
    "PATCH",
  );
  check(livePrivate.res.status === 200, "Live Photo visibility edit");
  check(
    (await anon.get(live.data.url)).res.status === 404 &&
      (await admin.get(live.data.url)).res.status === 200,
    "private Live Photo video permission",
  );
  check(
    (await anon.get(cover.data.url)).res.status === 404,
    "private Live Photo cover permission",
  );
  check(
    (
      await admin.request(
        `/api/posts/${livePost.data.post.id}`,
        undefined,
        "DELETE",
      )
    ).res.status === 200,
    "Live Photo delete",
  );
  check(
    (await admin.get(live.data.url)).res.status === 200 &&
      (await admin.get(cover.data.url)).res.status === 200 &&
      (await anon.get(live.data.url)).res.status === 404 &&
      (await anon.get(cover.data.url)).res.status === 404,
    "deleted Live Photo post retains private library media",
  );
  check((await anon.request("/api/library", { action: "delete", ids: [cover.data.id] })).res.status === 401, "library deletion requires owner");
  check((await admin.request("/api/library", { action: "delete", ids: [cover.data.id] }, "POST", { csrf: "invalid" })).res.status === 403, "library deletion requires CSRF");
  check((await admin.request("/api/library", { action: "delete", ids: [cover.data.id] })).res.status === 200, "owner explicitly deletes Live Photo from library");
  check((await admin.get(live.data.url)).res.status === 404 && (await admin.get(cover.data.url)).res.status === 404, "explicit library deletion removes Live Photo pair");
  check(
    (await anon.request("/api/media/uploads", { kind: "audio", size: 100 })).res
      .status === 401,
    "chunk upload needs owner",
  );
  check(
    (
      await admin.request("/api/media/uploads", {
        kind: "audio",
        size: 3 * 1024 * 1024 * 1024,
      })
    ).res.status === 413,
    "configured media size checked",
  );
  const wav = Buffer.alloc(12 * 1024 * 1024 + 44);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24);
  wav.writeUInt32LE(88200, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  async function chunkUpload(bytes, kind, filename) {
    const started = await admin.request("/api/media/uploads", {
      kind,
      size: bytes.length,
    });
    check(started.res.status === 201, "chunk upload starts");
    const id = started.data.id;
    check(
      (await admin.request(`/api/media/uploads/${id}`, undefined)).res
        .status === 409,
      "incomplete file cannot finalize",
    );
    check(
      (
        await admin.request(
          `/api/media/uploads/${id}`,
          bytes.subarray(0, 1),
          "PUT",
          { headers: { "X-Upload-Offset": "1" } },
        )
      ).res.status === 409,
      "wrong offset rejected",
    );
    for (
      let offset = 0;
      offset < bytes.length;
      offset += started.data.chunkSize
    ) {
      const sent = await admin.request(
        `/api/media/uploads/${id}`,
        bytes.subarray(offset, offset + started.data.chunkSize),
        "PUT",
        {
          mime: "application/octet-stream",
          headers: { "X-Upload-Offset": String(offset) },
        },
      );
      check(sent.res.status === 200, "chunk accepted");
    }
    return admin.request(
      `/api/media/uploads/${id}`,
      undefined,
      "POST",
      filename
        ? { headers: { "X-File-Name": encodeURIComponent(filename) } }
        : {},
    );
  }
  const audio = await chunkUpload(wav, "audio");
  check(audio.res.status === 201, "12 MB WAV upload completes");
  const video = await chunkUpload(
    readFileSync("scripts/fixtures/live.mp4"),
    "video",
  );
  check(video.res.status === 201, "standalone video upload completes");
  const payload = {
    body: "",
    status: "published",
    visibility: "private",
    pinned: false,
    images: [],
    audio: [{ id: audio.data.id, title: "录音" }],
    videos: [{ id: video.data.id, title: "视频" }],
  };
  const mediaPost = await admin.request("/api/posts", payload);
  check(mediaPost.res.status === 201, "media only post works");
  check(
    (await anon.get(audio.data.url)).res.status === 404 &&
      (await anon.get(video.data.url)).res.status === 404,
    "private audio and video protected",
  );
  const playback = await fetch(origin + audio.data.url, {
    headers: { Cookie: admin.cookie(), Range: "bytes=3999990-4000010" },
  });
  check(
    playback.status === 206 && (await playback.arrayBuffer()).byteLength === 21,
    "stream range crosses upload boundary",
  );
  const kept = await admin.request(
    `/api/posts/${mediaPost.data.post.id}`,
    {
      body: "修改正文",
      status: "published",
      visibility: "public",
      pinned: false,
      images: [],
      updatedAt: mediaPost.data.post.updatedAt,
    },
    "PATCH",
  );
  check(kept.res.status === 200, "old client editing retains audio and video");
  const rendered = await anon.get(`/p/${mediaPost.data.post.id}`);
  check(
    rendered.text.includes("<audio") && rendered.text.includes("<video"),
    "audio and video players rendered",
  );
  check(
    (await anon.get(audio.data.url)).res.status === 200,
    "published audio readable",
  );
  check(
    (
      await admin.request(
        `/api/posts/${mediaPost.data.post.id}`,
        undefined,
        "DELETE",
      )
    ).res.status === 200,
    "media post deletes",
  );
  check(
    (await admin.get(audio.data.url)).res.status === 200 &&
      (await admin.get(video.data.url)).res.status === 200 &&
      (await anon.get(audio.data.url)).res.status === 404 &&
      (await anon.get(video.data.url)).res.status === 404,
    "deleted media post retains private library media",
  );
  const fileBytes = Buffer.from(
    "<!doctype html><script>alert('attachment')</script>书信附件",
  );
  const file = await chunkUpload(fileBytes, "file", "书信下载.html");
  check(
    file.res.status === 201 && file.data.filename === "书信下载.html",
    "generic file upload and unicode filename",
  );
  check(
    (await anon.get(file.data.url)).res.status === 404,
    "unattached download protected",
  );
  const filePost = await admin.request("/api/posts", {
    body: "",
    status: "draft",
    visibility: "public",
    pinned: false,
    images: [],
    files: [{ id: file.data.id, title: file.data.filename }],
  });
  check(filePost.res.status === 201, "file-only draft saves");
  check(
    (await anon.get(file.data.url)).res.status === 404,
    "draft download protected",
  );
  const filePublished = await admin.request(
    `/api/posts/${filePost.data.post.id}`,
    {
      body: "附件",
      status: "published",
      visibility: "public",
      pinned: false,
      images: [],
      updatedAt: filePost.data.post.updatedAt,
    },
    "PATCH",
  );
  check(filePublished.res.status === 200, "old client editing retains files");
  const downloaded = await fetch(origin + file.data.url);
  check(
    downloaded.status === 200 &&
      downloaded.headers.get("content-type") === "application/octet-stream" &&
      downloaded.headers.get("content-disposition").startsWith("attachment;") &&
      downloaded.headers.get("x-content-type-options") === "nosniff",
    "active content downloaded as inert attachment",
  );
  check(
    Buffer.from(await downloaded.arrayBuffer()).equals(fileBytes),
    "download bytes unchanged",
  );
  const filePage = await anon.get(`/p/${filePost.data.post.id}`);
  check(
    filePage.text.includes("download-card") &&
      filePage.text.includes("书信下载.html"),
    "file card rendered",
  );
  const stolen = await admin.request("/api/posts", {
    body: "reuse",
    status: "published",
    visibility: "public",
    pinned: false,
    images: [],
    files: [{ id: file.data.id, title: "reuse" }],
  });
  check(stolen.res.status === 400, "file cannot attach to multiple posts");
  const filePrivate = await admin.request(
    `/api/posts/${filePost.data.post.id}`,
    {
      body: "附件",
      status: "published",
      visibility: "private",
      pinned: false,
      images: [],
      files: [{ id: file.data.id, title: "私人附件.html" }],
      updatedAt: filePublished.data.post.updatedAt,
    },
    "PATCH",
  );
  check(
    filePrivate.res.status === 200 &&
      (await anon.get(file.data.url)).res.status === 404,
    "private file permission",
  );
  check(
    (await admin.get(file.data.url)).res.status === 200,
    "owner reads private file",
  );
  const fileExport = await admin.request("/api/export");
  check(fileExport.res.status === 200, "file export succeeds");
  const fileZip = unzipSync(fileExport.data);
  check(
    Buffer.from(fileZip[`media/${file.data.id}.bin`]).equals(fileBytes),
    "backup includes generic attachment bytes",
  );
  await admin.request(
    `/api/posts/${filePost.data.post.id}`,
    undefined,
    "DELETE",
  );
  check(
    (await admin.get(file.data.url)).res.status === 200 && (await anon.get(file.data.url)).res.status === 404,
    "post deletion retains file privately in library",
  );
  const downloadPreview = await admin.request("/api/preview", {
    body:
      "```download\n" +
      JSON.stringify({
        title: "<script>download</script>",
        url: "https://pan.baidu.com/s/example",
        code: "abcd",
      }) +
      "\n```",
  });
  check(
    downloadPreview.data.html.includes("cloud-baidu-appstore.png") &&
      downloadPreview.data.html.includes("download-action") &&
      downloadPreview.data.html.includes("abcd") &&
      !downloadPreview.data.html.includes("<script>"),
    "cloud card icon and escaping",
  );
  const unsafeDownload = await admin.request("/api/preview", {
    body:
      "```download\n" +
      JSON.stringify({ title: "bad", url: "javascript:alert(1)" }) +
      "\n```",
  });
  check(
    !unsafeDownload.data.html.includes('class="download-card"'),
    "unsafe download URL rejected",
  );
  const fallbackDownload = await admin.request("/api/preview", {
    body:
      "[资源](https://pan.baidu.com/s/example)\n\n```download\n" +
      JSON.stringify({ title: "文件", url: "https://example.com/download" }) +
      "\n```",
  });
  check(
    fallbackDownload.data.html.includes("cloud-download.svg") &&
      fallbackDownload.data.html.includes("cloud-baidu-appstore.png"),
    "unknown link placeholder and automatic cloud card",
  );
  const invalid = await chunkUpload(Buffer.from("fake media content"), "audio");
  check(invalid.res.status === 400, "invalid media rejected");
  const pending = await admin.request("/api/media/uploads", {
    kind: "video",
    size: 100,
  });
  check(
    (
      await admin.request(
        `/api/media/uploads/${pending.data.id}`,
        undefined,
        "DELETE",
      )
    ).res.status === 200,
    "cancel upload works",
  );
  const markup = await admin.request("/api/preview", {
    body: "[录音](https://example.com/voice.flac)\n\n[音乐](https://163cn.tv/bij8AT2I)\n\n<audio src=javascript:alert(1) autoplay onerror=alert(1)></audio>",
  });
  check(
    markup.data.html.includes("audio-player") &&
      markup.data.html.includes("music-player"),
    "direct audio and platform share players",
  );
  check(
    /<p[^>]*class="audio-error"[^>]*hidden/.test(markup.data.html),
    "external audio error hint hidden before playback",
  );
  check(
    !markup.data.html.includes("autoplay") &&
      !markup.data.html.includes("javascript:") &&
      !markup.data.html.includes("onerror"),
    "media markdown sanitized",
  );
  const background = await admin.request("/api/media", png, "POST", {
    mime: "image/png",
  });
  check(
    (
      await admin.request("/api/settings", {
        backgroundId: background.data.id,
        backgroundOpacity: 35,
      })
    ).res.status === 200,
    "background image saves independently",
  );
  check(
    (await anon.get(background.data.url)).res.status === 200,
    "configured background public",
  );
  check(
    (await anon.get("/")).text.includes("site-background"),
    "background layer rendered",
  );
  check(
    (await admin.request("/api/settings", { backgroundOpacity: 101 })).res
      .status === 400,
    "background opacity range enforced",
  );
  check(
    (await admin.request("/api/auth/account", { avatarId: background.data.id }))
      .res.status === 400,
    "background cannot become avatar",
  );
  const bgAsPost = await admin.request("/api/posts", {
    body: "invalid",
    status: "draft",
    visibility: "private",
    pinned: false,
    images: [{ id: background.data.id, alt: "" }],
  });
  check(bgAsPost.res.status === 400, "background cannot be assigned to post");
  check(
    (await admin.request("/api/settings", { backgroundId: null })).res
      .status === 200,
    "background remove saves independently",
  );
  const linkedImage = await admin.request("/api/media", png, "POST", {
    mime: "image/png",
  });
  const imagePost = await admin.request("/api/posts", {
    body: "图片链接",
    status: "published",
    visibility: "public",
    pinned: false,
    images: [
      {
        id: linkedImage.data.id,
        alt: "示例",
        linkUrl: "https://example.com/path",
      },
    ],
  });
  check(imagePost.res.status === 201, "linked image post saves");
  const imagePage = await anon.get(`/p/${imagePost.data.post.id}`);
  check(
    imagePage.text.includes('href="https://example.com/path"') &&
      imagePage.text.includes('target="_blank"'),
    "linked image renders external link",
  );
  check(
    (
      await admin.request(
        `/api/posts/${imagePost.data.post.id}`,
        {
          body: "图片链接",
          status: "published",
          visibility: "public",
          pinned: false,
          images: [
            {
              id: linkedImage.data.id,
              alt: "",
              linkUrl: "javascript:alert(1)",
            },
          ],
          updatedAt: imagePost.data.post.updatedAt,
        },
        "PATCH",
      )
    ).res.status === 400,
    "unsafe image link rejected",
  );
  await admin.request(
    `/api/posts/${imagePost.data.post.id}`,
    undefined,
    "DELETE",
  );
  const editor = (await admin.get("/admin/new")).text;
  check(
    editor.includes("Markdown 编辑工具栏") && editor.includes("data-md"),
    "editor toolbar present",
  );
  check(
    (await admin.get("/admin/user")).text.includes("用户设置"),
    "user settings page available",
  );
  check(
    (await admin.get("/admin/system")).text.includes('id="export-button"'),
    "system settings includes export",
  );
  check(
    markup.data.html.includes("music-card") &&
      markup.data.html.includes("music-placeholder.webp"),
    "music card has fallback cover",
  );
  check(
    !markup.data.html.includes("打开音频链接") &&
      !markup.data.html.includes("打开音乐平台"),
    "secondary media links removed",
  );
  const tasks = await admin.request("/api/preview", {
    body: "- [x] 已完成\n- [ ] 待办\n<input type=password onfocus=alert(1)>",
  });
  check(
    tasks.data.html.includes('type="checkbox"') &&
      tasks.data.html.includes("disabled"),
    "task lists use read only checkboxes",
  );
  check(
    !tasks.data.html.includes('type="password"') &&
      !tasks.data.html.includes("onfocus"),
    "raw inputs cannot create credential fields",
  );
  check(
    markup.data.html.includes("audio-card"),
    "direct audio links render as cover cards",
  );
  const codePreview = await admin.request("/api/preview", {
    body: "```javascript\nconst message = '<script>';\n\nconsole.log(message);\n```\n\n![好耶](/stickers/cat-happy.svg)\n![外部](https://evil.example/x.svg)",
  });
  check(
    codePreview.data.html.includes("data-code-copy") &&
      codePreview.data.html.includes("data-code-wrap") &&
      codePreview.data.html.includes('data-line="3"'),
    "code blocks include copy wrap and line numbers",
  );
  check(
    codePreview.data.html.includes("hljs-keyword") &&
      !codePreview.data.html.includes("<script>"),
    "code highlight preserves escaped content",
  );
  check(
    codePreview.data.html.includes("inline-sticker") &&
      !codePreview.data.html.includes("evil.example"),
    "only bundled stickers render",
  );
  check(
    (await anon.get("/stickers/cat-happy.svg")).res.status === 200,
    "bundled stickers publicly available",
  );
  check(
    (await anon.get("/audio-codec/manifest.json")).res.status === 200,
    "WMA conversion assets available",
  );
  const list = await admin.request("/api/music/playlist", {
    source:
      "#EXTM3U\n#EXTINF:-1,First\nhttps://example.com/first.mp3\n#EXTINF:-1,Second\nhttps://example.com/second.flac",
  });
  check(
    list.res.status === 200 &&
      list.data.tracks.length === 2 &&
      list.data.tracks[0].title === "First",
    "M3U playlist imported",
  );
  const listPreview = await admin.request("/api/preview", {
    body: "```playlist\n" + JSON.stringify(list.data) + "\n```",
  });
  check(
    listPreview.data.html.includes("playlist-player") &&
      listPreview.data.html.includes("data-playlist-repeat") &&
      listPreview.data.html.includes("data-track-url"),
    "playlist renders playable queue controls",
  );
  check(
    (
      await admin.request("/api/music/playlist", {
        source: JSON.stringify({ tracks: [{ url: "javascript:alert(1)" }] }),
      })
    ).res.status === 400,
    "unsafe playlist link rejected",
  );
  check(
    (
      await anon.request("/api/music/playlist", {
        source: "https://example.com/a.mp3",
      })
    ).res.status === 401,
    "playlist imports require owner",
  );
  check(
    editor.includes("表情包") &&
      editor.includes("解析并添加") &&
      editor.includes("music-source"),
    "editor has sticker and playlist controls",
  );
  const localList = await admin.request("/api/preview", {
    body:
      "```playlist\n" +
      JSON.stringify({
        tracks: [
          { title: "录音", url: "/media/12345678-1234-1234-1234-123456789abc" },
        ],
      }) +
      "\n```",
  });
  check(
    localList.data.html.includes("playlist-player"),
    "stored media can participate in playlists without bypassing media access rules",
  );
  const entries = [];
  for (const [status, visibility] of [
    ["published", "public"],
    ["published", "unlisted"],
    ["published", "private"],
    ["draft", "public"],
  ]) {
    const upload = await admin.request("/api/media", png, "POST", {
      mime: "image/png",
    });
    check(upload.res.status === 201, "valid image upload");
    const image = upload.data;
    check(
      (await anon.get(image.url)).res.status === 404,
      "unattached media private",
    );
    const created = await admin.request("/api/posts", {
      body: `${marker} ${status} ${visibility}\n\n**粗体**\n\n<script>alert(1)</script>\n\n[x](javascript:alert%281%29)`,
      status,
      visibility,
      pinned: false,
      images: [{ id: image.id, alt: "绿色图片" }],
    });
    check(created.res.status === 201, "post create");
    const post = created.data.post;
    entries.push({ post, image });
    const publicRead = status === "published" && visibility !== "private";
    check(
      (await anon.get(`/p/${post.id}`)).res.status === (publicRead ? 200 : 404),
      "post read permission",
    );
    check(
      (await anon.get(image.url)).res.status === (publicRead ? 200 : 404),
      "image permission",
    );
    check(
      (await admin.get(`/p/${post.id}`)).res.status === 200,
      "owner reads draft/private",
    );
  }
  const home = await anon.get("/");
  check(home.text.includes(entries[0].post.id), "public homepage");
  for (const e of entries.slice(1))
    check(!home.text.includes(e.post.id), "nonpublic excluded from timeline");
  const search = await anon.get("/search?q=" + marker);
  check(
    search.res.status === 200 && search.text.includes(entries[0].post.id),
    "public search",
  );
  for (const e of entries.slice(1))
    check(!search.text.includes(e.post.id), "nonpublic excluded from search");
  check(
    !search.text.includes("<script>alert(1)</script>") &&
      !search.text.includes('href="javascript:'),
    "Markdown sanitized",
  );
  const sitemap = await anon.get("/sitemap.xml");
  check(sitemap.text.includes(entries[0].post.id), "public sitemap");
  for (const e of entries.slice(1))
    check(!sitemap.text.includes(e.post.id), "nonpublic excluded from sitemap");
  const unlisted = await anon.get(`/p/${entries[1].post.id}`);
  check(unlisted.text.includes("noindex, nofollow"), "unlisted noindex");
  check(
    !unlisted.text.includes(`property="og:description" content="${marker}`),
    "unlisted OG protected",
  );
  check(
    home.res.headers.get("cache-control") === "no-store",
    "pages not shared cached",
  );
  check(
    home.res.headers
      .get("content-security-policy")
      .includes("object-src 'none'"),
    "CSP header",
  );
  const first = entries[0];
  const nextBody = {
    body: marker + " updated",
    status: "published",
    visibility: "private",
    pinned: true,
    images: [{ id: first.image.id, alt: "修改替代文本" }],
    updatedAt: first.post.updatedAt,
  };
  const edited = await admin.request(
    "/api/posts/" + first.post.id,
    nextBody,
    "PATCH",
  );
  check(edited.res.status === 200, "edit works");
  check(
    (await anon.get(first.image.url)).res.status === 404,
    "visibility revokes image",
  );
  check(
    (await admin.request("/api/posts/" + first.post.id, nextBody, "PATCH")).res
      .status === 409,
    "stale update rejected",
  );
  check(
    (
      await admin.request("/api/posts", {
        body: "steal",
        status: "published",
        visibility: "public",
        pinned: false,
        images: [{ id: first.image.id, alt: "" }],
      })
    ).res.status === 400,
    "media cannot be reassigned",
  );
  const pin = await admin.request(`/api/posts/${first.post.id}/pin`, {
    pinned: false,
  });
  check(pin.res.status === 200, "pin toggle");
  const avatar = await admin.request("/api/media", png, "POST", {
    mime: "image/png",
  });
  const settings = {
    displayName: "验收昵称",
    bio: "验收简介",
    title: "验收书信",
    description: "验收描述",
    theme: "dark",
    avatarId: avatar.data.id,
  };
  check(
    (await admin.request("/api/settings", settings)).res.status === 200,
    "settings saved",
  );
  check(
    (
      await admin.request("/api/auth/account", {
        username: credentials.username,
        displayName: "验收昵称",
        bio: "验收简介",
        avatarId: avatar.data.id,
      })
    ).res.status === 200,
    "avatar saved in system settings",
  );
  check((await anon.get(avatar.data.url)).res.status === 200, "avatar public");
  check(
    (
      await admin.request("/api/auth/account", {
        username: credentials.username,
        displayName: "验收昵称",
        avatarId: first.image.id,
      })
    ).res.status === 400,
    "post image cannot become avatar",
  );
  check(
    (
      await admin.request("/api/posts", {
        body: "avatar steal",
        status: "draft",
        visibility: "private",
        pinned: false,
        images: [{ id: avatar.data.id, alt: "" }],
      })
    ).res.status === 400,
    "avatar cannot become post attachment",
  );
  const logo = await admin.request("/api/media", png, "POST", {
    mime: "image/png",
  });
  check(
    (await anon.get(logo.data.url)).res.status === 404,
    "unconfigured logo stays private",
  );
  check(
    (
      await admin.request("/api/settings", {
        ...settings,
        logoId: first.image.id,
      })
    ).res.status === 400,
    "post image cannot become public logo",
  );
  check(
    (
      await admin.request("/api/settings", {
        ...settings,
        logoId: avatar.data.id,
      })
    ).res.status === 400,
    "avatar cannot become logo",
  );
  check(
    (
      await admin.request("/api/settings", {
        ...settings,
        logoId: logo.data.id,
      })
    ).res.status === 200,
    "logo saved",
  );
  const branded = await anon.get("/");
  check(
    branded.text.includes("验收书信") &&
      branded.text.includes('class="brand-title text-logo">ShuXin</span>'),
    "site title independent of logo text",
  );
  check(
    branded.text.includes(`class="brand-logo" src="/media/${logo.data.id}"`),
    "header uses configured logo",
  );
  check(
    branded.text.includes("Powered by ShuXin"),
    "footer links project attribution",
  );
  check(
    (await anon.get(logo.data.url)).res.status === 200,
    "configured logo public",
  );
  for (const mask of [1, 2, 3, 4, 5, 6, 7]) {
    const title = mask & 1 ? "网站标题" : "";
    const description = mask & 2 ? "网站副标题" : "";
    const logoText = mask & 4 ? "文字标志" : "";
    check(
      (await admin.request("/api/settings", { title, description, logoText }))
        .res.status === 200,
      "branding combination saved " + mask,
    );
    const page = await anon.get("/");
    const expected = [logoText, title, description].filter(Boolean).join(" · ");
    check(
      page.text.includes("<title>" + expected + "</title>"),
      "browser title combination " + mask,
    );
    if (logoText)
      check(
        page.text.includes('class="brand-title text-logo">文字标志</span>') &&
          page.text.includes('class="brand-logo"'),
        "image and text logos coexist",
      );
  }
  await admin.request("/api/settings", {
    title: "",
    description: "",
    logoText: "",
  });
  check(
    (await anon.get("/")).text.includes("<title>验收昵称 · 验收简介</title>"),
    "browser title falls back to owner profile",
  );
  check(
    (await admin.request("/api/settings", { logoId: null })).res.status === 400,
    "last logo cannot be removed",
  );
  check(
    (await anon.get(logo.data.url)).res.status === 200,
    "rejected removal preserves logo media",
  );
  await admin.request("/api/settings", { ...settings, logoText: "ShuXin" });
  check(
    (
      await admin.request("/api/posts", {
        body: "logo steal",
        status: "draft",
        visibility: "private",
        pinned: false,
        images: [{ id: logo.data.id, alt: "" }],
      })
    ).res.status === 400,
    "logo cannot become post attachment",
  );
  check(
    (
      await admin.request("/api/auth/account", {
        username: credentials.username,
        displayName: "验收昵称",
        avatarId: logo.data.id,
      })
    ).res.status === 400,
    "logo cannot become avatar",
  );
  check(
    (
      await admin.request(
        `/api/media/live?image=${logo.data.id}`,
        readFileSync(new URL("./fixtures/live.mp4", import.meta.url)),
        "POST",
        { mime: "video/mp4" },
      )
    ).res.status === 400,
    "logo cannot become Live Photo",
  );
  check(
    (await admin.request("/api/settings", settings)).res.status === 200 &&
      (await anon.get(logo.data.url)).res.status === 200,
    "omitted logo field preserves existing logo",
  );
  check(
    (await admin.request("/api/settings", { ...settings, logoId: null })).res
      .status === 200,
    "reset logo saved",
  );
  check(
    (await anon.get(logo.data.url)).res.status === 404,
    "old logo removed after reset",
  );
  check(
    (await anon.get("/")).text.includes(
      'class="brand-title text-logo">ShuXin</span>',
    ),
    "removing image preserves text logo",
  );
  for (let i = 0; i < 23; i++)
    check(
      (
        await admin.request("/api/posts", {
          body: `page-${i}`,
          status: "published",
          visibility: "public",
          pinned: i === 5,
          images: [],
        })
      ).res.status === 201,
      "pagination seed",
    );
  const ids = [];
  let page = "/";
  for (let i = 0; i < 5 && page; i++) {
    const { text, res } = await anon.get(page);
    check(res.status === 200, "timeline page succeeds");
    ids.push(...Array.from(text.matchAll(/id="post-([^"]+)"/g), (m) => m[1]));
    page =
      text
        .match(/data-load-more href="([^"]+)"/)?.[1]
        ?.replaceAll("&amp;", "&") ?? null;
  }
  check(
    ids.length === 23 && new Set(ids).size === 23,
    "cursor pagination no duplicates or omissions",
  );
  check(
    (await anon.get("/?cursor=invalid")).res.status === 400,
    "invalid cursor rejected",
  );
  const literal = await admin.request("/api/posts", {
    body: marker + " literal %_\\",
    status: "published",
    visibility: "public",
    pinned: false,
    images: [],
  });
  check(literal.res.status === 201, "literal search fixture");
  check(
    (await anon.get("/search?q=" + encodeURIComponent("%_\\"))).text.includes(
      literal.data.post.id,
    ),
    "search treats wildcard literally",
  );
  const backup = await admin.request("/api/export");
  check(backup.res.status === 200, "backup download");
  const zip = unzipSync(backup.data);
  const content = JSON.parse(strFromU8(zip["content.json"]));
  check(
    content.posts.some((p) => p.id === entries[3].post.id),
    "backup includes drafts",
  );
  check(
    Boolean(zip["media/" + first.image.id + ".webp"]),
    "backup includes media",
  );
  const restoredFile = path.join(folder, "restored.sqlite");
  let restored;
  if (zip["shuxin.sqlite"]) {
    writeFileSync(restoredFile, zip["shuxin.sqlite"]);
    restored = new Database(restoredFile);
  } else {
    restored = new Database(restoredFile);
    restored.exec(strFromU8(zip["database.sql"]));
  }
  check(
    restored.prepare("SELECT count(*) AS n FROM posts").get().n ===
      content.posts.length,
    "backup restores SQLite",
  );
  check(
    restored.prepare("SELECT count(*) AS n FROM sessions").get().n === 0,
    "backup excludes active sessions",
  );
  check(
    restored.prepare("SELECT count(*) AS n FROM schema_migrations").get().n ===
      6,
    "backup preserves migration history",
  );
  const encodedPassword = restored
    .prepare("SELECT password_hash FROM owner")
    .get().password_hash;
  const [algorithm, salt, digest] = encodedPassword.split(":");
  check(
    algorithm === "pbkdf2" &&
      pbkdf2Sync(
        credentials.password,
        Buffer.from(salt, "hex"),
        600000,
        32,
        "sha256",
      ).toString("hex") === digest,
    "password hash matches standard 600000-round PBKDF2",
  );
  restored.close();
  const deleted = await admin.request(
    "/api/posts/" + first.post.id,
    undefined,
    "DELETE",
  );
  check(deleted.res.status === 200, "delete works");
  check(
    (await admin.get(first.image.url)).res.status === 200 && (await anon.get(first.image.url)).res.status === 404,
    "deleted attachment remains private in library",
  );
  const session2 = new Client();
  await session2.get("/admin/login");
  check(
    (
      await session2.request("/api/auth/login", {
        username: credentials.username,
        password: "wrong",
      })
    ).res.status === 401,
    "wrong password rejected",
  );
  check(
    (await session2.request("/api/auth/login", credentials)).res.status === 200,
    "login works",
  );
  const account = { username: credentials.username, displayName: "系统昵称" };
  check(
    (await anon.request("/api/auth/account", account)).res.status === 401,
    "anonymous account edit blocked",
  );
  check(
    (
      await admin.request("/api/auth/account", account, "POST", {
        csrf: "invalid",
      })
    ).res.status === 403,
    "account CSRF protected",
  );
  check(
    (
      await admin.request("/api/auth/account", {
        ...account,
        username: "bad name",
      })
    ).res.status === 400,
    "invalid login name rejected",
  );
  check(
    (await admin.request("/api/auth/account", account)).res.status === 200,
    "nickname edit without password",
  );
  check(
    (await anon.get("/")).text.includes("系统昵称"),
    "nickname appears on public profile",
  );
  check(
    (await session2.get("/admin")).res.status === 200,
    "nickname retains sessions",
  );
  const newName = "renamed_owner";
  check(
    (
      await admin.request("/api/auth/account", {
        ...account,
        username: newName,
        current: "wrong",
      })
    ).res.status === 403,
    "login name requires correct current password",
  );
  check(
    (
      await admin.request("/api/auth/account", {
        ...account,
        username: newName,
        current: credentials.password,
      })
    ).res.status === 200,
    "login name change succeeds",
  );
  check(
    (await session2.get("/admin")).res.status === 302,
    "login name change invalidates sessions",
  );
  await session2.get("/admin/login");
  check(
    (await session2.request("/api/auth/login", credentials)).res.status === 401,
    "old login name rejected",
  );
  credentials.username = newName;
  check(
    (await session2.request("/api/auth/login", credentials)).res.status === 200,
    "new login name accepted",
  );
  await admin.get("/admin/login");
  check(
    (await admin.request("/api/auth/login", credentials)).res.status === 200,
    "owner relogs with new name",
  );
  check(
    (
      await admin.request("/api/auth/password", {
        current: credentials.password,
        password: "",
      })
    ).res.status === 400,
    "empty changed password rejected",
  );
  check(
    (
      await admin.request("/api/auth/password", {
        current: credentials.password,
        password: "b",
      })
    ).res.status === 200,
    "password changes",
  );
  check(
    (await session2.get("/admin")).res.status === 302,
    "password invalidates all sessions",
  );
  await session2.get("/admin/login");
  check(
    (
      await session2.request("/api/auth/login", {
        username: credentials.username,
        password: credentials.password,
      })
    ).res.status === 401,
    "old password rejected",
  );
  check(
    (
      await session2.request("/api/auth/login", {
        username: credentials.username,
        password: "b",
      })
    ).res.status === 200,
    "new password accepted",
  );
  check(
    (await session2.request("/api/auth/logout")).res.status === 200,
    "logout works",
  );
  check(
    (await session2.get("/admin")).res.status === 302,
    "logout session invalid",
  );
  for (let i = 0; i < 8; i++)
    check(
      (
        await session2.request("/api/auth/login", {
          username: "limit-user",
          password: "wrong",
        })
      ).res.status === 401,
      "login failed rate fixture",
    );
  check(
    (
      await session2.request("/api/auth/login", {
        username: "limit-user",
        password: "wrong",
      })
    ).res.status === 429,
    "login rate limit",
  );
  check((await anon.get("/feed.xml")).res.status === 404, "RSS removed");
  check(
    !/Uncaught|\[ERROR\]|✘/.test(output),
    "server has no unhandled runtime errors",
  );
  console.log(
    JSON.stringify({
      runtime: worker ? "cloudflare-workerd" : "node",
      checks,
      result: "passed",
    }),
  );
}
try {
  await run();
} catch (error) {
  console.error(error.stack);
  console.error(
    output
      .slice(-3500)
      .replaceAll(secret, "[test-secret]"),
  );
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  rmSync(folder, { recursive: true, force: true });
}
