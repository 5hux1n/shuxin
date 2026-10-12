import path from "node:path";
import { workerContext } from "./runtime";
const env = (key: string): string | undefined => {
  const worker = workerContext.getStore();
  if (worker) return (worker.env as unknown as Record<string, string>)[key];
  return (
    process.env[key] ?? (import.meta.env.DEV ? import.meta.env[key] : undefined)
  );
};
function readConfig() {
  const site = new URL(env("SITE_URL") || "http://localhost:4321");
  if (
    !["http:", "https:"].includes(site.protocol) ||
    site.username ||
    site.password
  )
    throw new Error("Invalid SITE_URL");
  return {
    origin: site.origin,
    secret: env("SESSION_SECRET") || "",
    dataDir: path.resolve(env("DATA_DIR") || "./data"),
    secure: env("COOKIE_SECURE") === "true" || site.protocol === "https:",
    sessionSeconds: 60 * 60 * 24 * 14,
    maxUpload: 10 * 1024 * 1024,
    maxMedia:
      Math.max(1, Math.min(2048, Number(env("MAX_MEDIA_MB")) || 512)) *
      1024 *
      1024,
    maxPixels: workerContext.getStore() ? 8_000_000 : 32_000_000,
    maxImages: 12,
  };
}
export const config = new Proxy({} as ReturnType<typeof readConfig>, {
  get: (_target, key) => Reflect.get(readConfig(), key),
});
export function assertConfiguration() {
  if (config.secret.length < 32 || config.secret.startsWith("replace-"))
    throw new Error("Configure a random SESSION_SECRET (32+ characters)");
}
