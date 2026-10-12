import { FFmpeg } from "@ffmpeg/ffmpeg";
export async function convertWma(
  file: File,
  notify: (message: string) => void,
) {
  notify("正在加载 WMA 转换组件…");
  const engine = new FFmpeg();
  let wasmURL = "";
  try {
    const res = await fetch("/audio-codec/manifest.json");
    if (!res.ok) throw new Error("加载失败");
    const manifest = (await res.json()) as { files: string[] };
    if (
      !Array.isArray(manifest.files) ||
      manifest.files.some((f) => !/^core-\d+\.bin$/.test(f))
    )
      throw new Error("组件无效");
    const chunks = await Promise.all(
      manifest.files.map(async (name) => {
        const r = await fetch(`/audio-codec/${name}`, {
          signal: AbortSignal.timeout(60000),
        });
        if (!r.ok) throw new Error("加载失败");
        return r.arrayBuffer();
      }),
    );
    wasmURL = URL.createObjectURL(
      new Blob(chunks, { type: "application/wasm" }),
    );
    await engine.load(
      {
        classWorkerURL: new URL(
          "/audio-codec/ffmpeg/worker.js",
          location.origin,
        ).href,
        coreURL: new URL("/audio-codec/ffmpeg-core.js", location.origin).href,
        wasmURL,
      },
      { signal: AbortSignal.timeout(60000) },
    );
    notify("正在将 WMA 转换为 MP3…");
    await engine.writeFile(
      "input.wma",
      new Uint8Array(await file.arrayBuffer()),
    );
    const result = await engine.exec(
      [
        "-i",
        "input.wma",
        "-vn",
        "-codec:a",
        "libmp3lame",
        "-q:a",
        "2",
        "output.mp3",
      ],
      120000,
    );
    if (result !== 0) throw new Error("转换失败");
    const output = await engine.readFile("output.mp3");
    if (typeof output === "string") throw new Error("转换失败");
    return new File(
      [new Uint8Array(output).buffer],
      file.name.replace(/\.[^.]+$/, "") + ".mp3",
      { type: "audio/mpeg" },
    );
  } catch (e) {
    throw new Error("WMA 转换未完成，请换用 MP3 / M4A 文件，或缩小文件后重试", {
      cause: e,
    });
  } finally {
    engine.terminate();
    if (wasmURL) URL.revokeObjectURL(wasmURL);
  }
}
