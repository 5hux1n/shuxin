import type {
  DurableObjectStorage,
  DurableObjectNamespace,
  Fetcher,
} from "@cloudflare/workers-types";
import { AsyncLocalStorage } from "node:async_hooks";
export interface WorkerEnvironment {
  SITE_URL: string;
  REDIRECT_HOSTS?: string;
  SESSION_SECRET: string;
  SITE: DurableObjectNamespace;
  ASSETS: Fetcher;
}
export interface WorkerRuntime {
  env: WorkerEnvironment;
  storage: DurableObjectStorage;
  database: unknown;
}
export const workerContext = new AsyncLocalStorage<WorkerRuntime>();
export function workerRuntime() {
  const state = workerContext.getStore();
  if (!state) throw new Error("Missing site request context");
  return state;
}
