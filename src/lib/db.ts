import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DB_PATH = "data/cache.db";

type GlobalDb = typeof globalThis & {
  __cacheConsoleDb?: DatabaseSync;
  __cacheConsoleDbPath?: string;
};

function resolveDbPath(): string {
  const fromEnv = process.env.CACHE_DB?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_DB_PATH;
}

function migrate(db: DatabaseSync): void {
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      key TEXT NOT NULL,
      namespace TEXT NOT NULL DEFAULT 'default',
      value TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      ttl_seconds INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER,
      hits INTEGER NOT NULL DEFAULT 0,
      misses INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(key, namespace)
    );
    CREATE TABLE IF NOT EXISTS op_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      action TEXT NOT NULL,
      key TEXT,
      namespace TEXT,
      source TEXT NOT NULL DEFAULT 'console'
    );
    CREATE INDEX IF NOT EXISTS idx_entries_expires ON entries(expires_at);
    CREATE INDEX IF NOT EXISTS idx_entries_ns ON entries(namespace);
    CREATE INDEX IF NOT EXISTS idx_ops_at ON op_events(at);
  `);
}

export function getDb(): DatabaseSync {
  const g = globalThis as GlobalDb;
  const path = resolveDbPath();
  if (g.__cacheConsoleDb?.isOpen && g.__cacheConsoleDbPath === path) {
    return g.__cacheConsoleDb;
  }
  if (g.__cacheConsoleDb?.isOpen) {
    g.__cacheConsoleDb.close();
  }
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (dir && dir !== ".") {
      mkdirSync(dir, { recursive: true });
    }
  }
  const db = new DatabaseSync(path, { timeout: 5000 });
  migrate(db);
  g.__cacheConsoleDb = db;
  g.__cacheConsoleDbPath = path;
  return db;
}

export function closeDb(): void {
  const g = globalThis as GlobalDb;
  if (g.__cacheConsoleDb?.isOpen) {
    g.__cacheConsoleDb.close();
  }
  g.__cacheConsoleDb = undefined;
  g.__cacheConsoleDbPath = undefined;
}
