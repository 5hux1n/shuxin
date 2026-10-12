import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
const destination = new URL("../public/audio-codec/", import.meta.url);
await mkdir(new URL("ffmpeg/", destination), { recursive: true });
for (const file of ["worker.js", "const.js", "errors.js"])
  await copyFile(
    new URL(`../node_modules/@ffmpeg/ffmpeg/dist/esm/${file}`, import.meta.url),
    new URL(`ffmpeg/${file}`, destination),
  );
await copyFile(
  new URL(
    "../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js",
    import.meta.url,
  ),
  new URL("ffmpeg-core.js", destination),
);
const wasm = await readFile(
  new URL(
    "../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm",
    import.meta.url,
  ),
);
const files = [];
for (let i = 0; i < wasm.length; i += 6 * 1024 * 1024) {
  const name = `core-${files.length}.bin`;
  await writeFile(
    new URL(name, destination),
    wasm.subarray(i, i + 6 * 1024 * 1024),
  );
  files.push(name);
}
await writeFile(
  new URL("manifest.json", destination),
  JSON.stringify({ version: "0.12.10", files }),
);
