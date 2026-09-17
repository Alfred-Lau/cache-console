import { randomBytes } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? String((error as { code?: unknown }).code)
          : undefined;
      if (
        code === "ERR_MODULE_NOT_FOUND" &&
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !/\.[a-zA-Z0-9]+$/.test(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const dbFile = path.join("data", `test-${randomBytes(8).toString("hex")}.db`);
process.env.CACHE_DB = dbFile;

const { closeDb, getDb } = await import("./db");
const {
  setEntry,
  getEntry,
  deleteEntry,
  listEntries,
  invalidateByTags,
  purgeExpired,
  clearEntries,
  stats,
} = await import("./cache");

function cleanupDbFiles(): void {
  closeDb();
  for (const file of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) {
    if (existsSync(file)) unlinkSync(file);
  }
}

function actionsFor(key: string): string[] {
  return getDb()
    .prepare(`SELECT action FROM op_events WHERE key = ? ORDER BY id ASC`)
    .all(key)
    .map((row) => String(row.action));
}

before(() => {
  getDb();
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM op_events");
  db.exec("DELETE FROM entries");
});

after(() => {
  cleanupDbFiles();
});

describe("ttl and lazy expiry", () => {
  test("expired get deletes the row and records expire", () => {
    setEntry({ key: "ttl-key", value: "v", ttlSeconds: 60 });
    getDb()
      .prepare(`UPDATE entries SET expires_at = ? WHERE key = ?`)
      .run(Date.now() - 1, "ttl-key");

    const first = getEntry("ttl-key");
    assert.equal(first.found, false);
    assert.equal(first.expired, true);
    assert.equal(first.value, undefined);

    const remaining = getDb()
      .prepare(`SELECT COUNT(*) AS n FROM entries WHERE key = ?`)
      .get("ttl-key");
    assert.equal(Number(remaining?.n), 0);
    assert.ok(actionsFor("ttl-key").includes("expire"));

    const second = getEntry("ttl-key");
    assert.equal(second.found, false);
    assert.equal(second.expired, false);
  });

  test("ttlSeconds null/undefined/<=0 never expires", () => {
    setEntry({ key: "forever-undef", value: "a" });
    setEntry({ key: "forever-null", value: "b", ttlSeconds: null });
    setEntry({ key: "forever-zero", value: "c", ttlSeconds: 0 });
    setEntry({ key: "forever-neg", value: "d", ttlSeconds: -5 });

    for (const key of ["forever-undef", "forever-null", "forever-zero", "forever-neg"]) {
      const row = getDb()
        .prepare(`SELECT expires_at, ttl_seconds FROM entries WHERE key = ?`)
        .get(key);
      assert.equal(row?.expires_at, null);
      assert.equal(row?.ttl_seconds, null);
      const got = getEntry(key);
      assert.equal(got.found, true);
      assert.equal(got.expired, false);
    }
  });
});

describe("hit/miss counting", () => {
  test("hit and miss events drive hitRate", () => {
    setEntry({ key: "live", value: "1" });
    const hit = getEntry("live");
    assert.equal(hit.found, true);
    assert.equal(hit.value, "1");
    assert.equal(hit.entry?.hits, 1);

    const miss = getEntry("missing");
    assert.equal(miss.found, false);
    assert.equal(miss.expired, false);

    const s = stats();
    assert.equal(s.hits, 1);
    assert.equal(s.misses, 1);
    assert.equal(s.hitRate, 0.5);
    assert.ok(s.topKeys.some((item) => item.key === "live" && item.hits === 1));
  });

  test("countMiss false skips hit and miss counting", () => {
    setEntry({ key: "preview", value: "p" });
    const previewHit = getEntry("preview", { countMiss: false });
    assert.equal(previewHit.found, true);
    assert.equal(previewHit.entry?.hits, 0);

    const previewMiss = getEntry("nope", { countMiss: false });
    assert.equal(previewMiss.found, false);

    const s = stats();
    assert.equal(s.hits, 0);
    assert.equal(s.misses, 0);
    assert.equal(s.hitRate, 0);
  });
});

describe("tags invalidate", () => {
  test("deletes entries whose tags match any given tag", () => {
    setEntry({ key: "t1", value: "a", tags: ["red", "blue"] });
    setEntry({ key: "t2", value: "b", tags: ["red"] });
    setEntry({ key: "t3", value: "c", tags: ["green"] });

    const deleted = invalidateByTags(["red"]);
    assert.equal(deleted, 2);

    const listed = listEntries();
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0]?.key, "t3");

    const events = getDb()
      .prepare(`SELECT action FROM op_events WHERE action = 'invalidate'`)
      .all();
    assert.equal(events.length, 1);
  });
});

describe("listEntries", () => {
  test("filters by q, tag, status, sort, and paginates", () => {
    setEntry({ key: "alpha", value: "Hello World", tags: ["x"] });
    setEntry({ key: "beta", value: "other", tags: ["y"] });
    setEntry({ key: "gamma", value: "hello there", tags: ["x"] });
    getDb()
      .prepare(`UPDATE entries SET expires_at = ? WHERE key = ?`)
      .run(Date.now() - 5, "beta");

    const byQ = listEntries({ q: "HELLO" });
    assert.equal(byQ.total, 2);
    assert.deepEqual(byQ.items.map((item) => item.key).sort(), ["alpha", "gamma"]);
    assert.ok(byQ.items.every((item) => !("value" in item)));

    const byTag = listEntries({ tag: "x" });
    assert.equal(byTag.total, 2);

    const expired = listEntries({ status: "expired" });
    assert.equal(expired.total, 1);
    assert.equal(expired.items[0]?.key, "beta");

    const active = listEntries({ status: "active" });
    assert.equal(active.total, 2);

    const sorted = listEntries({ sort: "key", order: "asc" });
    assert.deepEqual(
      sorted.items.map((item) => item.key),
      ["alpha", "beta", "gamma"],
    );

    const page1 = listEntries({ sort: "key", order: "asc", limit: 2, offset: 0 });
    const page2 = listEntries({ sort: "key", order: "asc", limit: 2, offset: 2 });
    assert.equal(page1.total, 3);
    assert.deepEqual(
      page1.items.map((item) => item.key),
      ["alpha", "beta"],
    );
    assert.deepEqual(
      page2.items.map((item) => item.key),
      ["gamma"],
    );
  });
});

describe("clearEntries prefix", () => {
  test("deletes only keys with the given prefix", () => {
    setEntry({ key: "user:1", value: "a" });
    setEntry({ key: "user:2", value: "b" });
    setEntry({ key: "other", value: "c" });

    const deleted = clearEntries({ prefix: "user:" });
    assert.equal(deleted, 2);
    const listed = listEntries();
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0]?.key, "other");
  });
});

describe("stats series", () => {
  test("returns 7 local days", () => {
    setEntry({ key: "s", value: "1" });
    getEntry("s");
    const s = stats();
    assert.equal(s.series.length, 7);
    const today = s.series[6];
    assert.ok(today);
    assert.match(today.day, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(today.sets, 1);
    assert.equal(today.gets, 1);
    const days = s.series.map((row) => row.day);
    assert.equal(new Set(days).size, 7);
  });
});

describe("size_bytes utf-8", () => {
  test("counts chinese characters as utf-8 bytes", () => {
    const value = "你好";
    const entry = setEntry({ key: "zh", value });
    assert.equal(entry.size_bytes, Buffer.byteLength(value, "utf8"));
    assert.equal(entry.size_bytes, 6);
    const listed = listEntries({ q: "你好" });
    assert.equal(listed.items[0]?.size_bytes, 6);
  });
});

describe("delete and purge", () => {
  test("deleteEntry records del and purgeExpired removes stale rows", () => {
    setEntry({ key: "keep", value: "1" });
    setEntry({ key: "gone", value: "2", ttlSeconds: 30 });
    getDb()
      .prepare(`UPDATE entries SET expires_at = ? WHERE key = ?`)
      .run(Date.now() - 1, "gone");

    assert.equal(deleteEntry("keep"), true);
    assert.ok(actionsFor("keep").includes("del"));

    const purged = purgeExpired();
    assert.equal(purged, 1);
    assert.equal(listEntries().total, 0);
  });
});
