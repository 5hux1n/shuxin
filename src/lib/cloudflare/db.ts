import { workerRuntime } from "../runtime";
import type { db as nodeDb } from "../db";
// Same synchronous Drizzle queries, backed by Durable Object SQLite.
export const db = new Proxy({} as typeof nodeDb, {
  get: (_target, key) => {
    const database = workerRuntime().database as typeof nodeDb;
    const value = Reflect.get(database, key);
    return typeof value === "function" ? value.bind(database) : value;
  },
});
export const sqlite = {
  prepare(query: string) {
    return {
      all(...params: unknown[]) {
        return workerRuntime()
          .storage.sql.exec(query, ...params)
          .toArray();
      },
      get(...params: unknown[]) {
        return workerRuntime()
          .storage.sql.exec(query, ...params)
          .toArray()[0];
      },
      run(...params: unknown[]) {
        const sql = workerRuntime().storage.sql;
        sql.exec(query, ...params).toArray();
        return {
          changes: Number(sql.exec("SELECT changes() AS count").one().count),
        };
      },
    };
  },
  transaction<T>(fn: () => T) {
    const execute = () => workerRuntime().storage.transactionSync(fn);
    return Object.assign(execute, { immediate: execute });
  },
};
