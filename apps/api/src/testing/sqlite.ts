import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { Db, Statement } from "../db.ts";

/** D1-compatible adapter over node:sqlite with all migrations applied, for tests. */
export function testDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const dir = fileURLToPath(new URL("../../migrations", import.meta.url));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(join(dir, file), "utf8"));
  }

  const statement = (sql: string, values: unknown[] = []): Statement => {
    const prepared = () => sqlite.prepare(sql);
    const params = values as never[];
    return {
      bind: (...next) => statement(sql, next),
      first: async <T>() => ((prepared().get(...params) as T | undefined) ?? null) as T | null,
      all: async <T>() => ({ results: prepared().all(...params) as T[] }),
      run: async () => prepared().run(...params),
    };
  };
  return { prepare: (sql) => statement(sql) };
}
