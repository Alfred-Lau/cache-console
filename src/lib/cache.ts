import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { getDb } from "./db";

export const DEFAULT_NAMESPACE = "default";
export const VALUE_PREVIEW_CHARS = 120;

export type OpAction =
  | "set"
  | "get"
  | "hit"
  | "miss"
  | "del"
  | "expire"
  | "invalidate"
  | "purge"
  | "clear";

export type Entry = {
  key: string;
  namespace: string;
  value: string;
  size_bytes: number;
  tags: string[];
  ttl_seconds: number | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  hits: number;
  misses: number;
};

export type EntryMeta = {
  key: string;
  namespace: string;
  preview: string;
  size_bytes: number;
  tags: string[];
  ttl_seconds: number | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  hits: number;
  misses: number;
};

export type GetEntryResult = {
  found: boolean;
  value?: string;
  expired: boolean;
  entry?: Entry;
};

export type ListEntriesInput = {
  q?: string;
  tag?: string;
  status?: "all" | "active" | "expired";
  namespace?: string;
  sort?: "updated" | "created" | "hits" | "size" | "key";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type StatsResult = {
  total: number;
  active: number;
  expired: number;
  totalBytes: number;
  hits: number;
  misses: number;
  hitRate: number;
  topKeys: { key: string; hits: number }[];
  series: { day: string; sets: number; gets: number }[];
};

type SqlRow = Record<string, SQLOutputValue>;

function nowMs(): number {
  return Date.now();
}

function ns(namespace?: string): string {
  return namespace && namespace.length > 0 ? namespace : DEFAULT_NAMESPACE;
}

function asNumber(value: SQLOutputValue | undefined, fallback = 0): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length > 0) return Number(value);
  return fallback;
}

function asNullableNumber(value: SQLOutputValue | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length > 0) return Number(value);
  return null;
}

function asString(value: SQLOutputValue | undefined, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

function parseTags(raw: SQLOutputValue | undefined): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item));
  } catch {
    return [];
  }
}

function previewOf(value: string): string {
  return value.length <= VALUE_PREVIEW_CHARS ? value : value.slice(0, VALUE_PREVIEW_CHARS);
}

function rowToEntry(row: SqlRow): Entry {
  return {
    key: asString(row.key),
    namespace: asString(row.namespace, DEFAULT_NAMESPACE),
    value: asString(row.value),
    size_bytes: asNumber(row.size_bytes),
    tags: parseTags(row.tags),
    ttl_seconds: asNullableNumber(row.ttl_seconds),
    created_at: asNumber(row.created_at),
    updated_at: asNumber(row.updated_at),
    expires_at: asNullableNumber(row.expires_at),
    hits: asNumber(row.hits),
    misses: asNumber(row.misses),
  };
}

function rowToMeta(row: SqlRow): EntryMeta {
  const value = asString(row.value);
  const preview = typeof row.preview === "string" ? row.preview : previewOf(value);
  return {
    key: asString(row.key),
    namespace: asString(row.namespace, DEFAULT_NAMESPACE),
    preview,
    size_bytes: asNumber(row.size_bytes),
    tags: parseTags(row.tags),
    ttl_seconds: asNullableNumber(row.ttl_seconds),
    created_at: asNumber(row.created_at),
    updated_at: asNumber(row.updated_at),
    expires_at: asNullableNumber(row.expires_at),
    hits: asNumber(row.hits),
    misses: asNumber(row.misses),
  };
}

function withTxn<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const result = fn(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      if (db.isOpen) db.exec("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

function recordEvent(
  db: DatabaseSync,
  action: OpAction,
  opts: {
    key?: string | null;
    namespace?: string | null;
    source?: string;
    at?: number;
  } = {},
): void {
  db.prepare(
    `INSERT INTO op_events (at, action, key, namespace, source) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    opts.at ?? nowMs(),
    action,
    opts.key ?? null,
    opts.namespace ?? null,
    opts.source ?? "console",
  );
}

function ttlParts(ttlSeconds: number | null | undefined, at: number): {
  ttlSeconds: number | null;
  expiresAt: number | null;
} {
  if (ttlSeconds == null || ttlSeconds <= 0) {
    return { ttlSeconds: null, expiresAt: null };
  }
  return { ttlSeconds, expiresAt: at + ttlSeconds * 1000 };
}

function escapeLike(input: string): string {
  return input.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function localDay(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function last7LocalDays(at: number): string[] {
  const days: string[] = [];
  const base = new Date(at);
  const midnight = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(midnight);
    d.setDate(midnight.getDate() - i);
    days.push(localDay(d.getTime()));
  }
  return days;
}

export function setEntry(input: {
  key: string;
  value: string;
  ttlSeconds?: number | null;
  tags?: string[];
  namespace?: string;
  source?: string;
}): Entry {
  const namespace = ns(input.namespace);
  const at = nowMs();
  const { ttlSeconds, expiresAt } = ttlParts(input.ttlSeconds, at);
  const tags = JSON.stringify(input.tags ?? []);
  const sizeBytes = Buffer.byteLength(input.value, "utf8");

  return withTxn((db) => {
    db.prepare(
      `
      INSERT INTO entries (
        key, namespace, value, size_bytes, tags, ttl_seconds,
        created_at, updated_at, expires_at, hits, misses
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      ON CONFLICT(key, namespace) DO UPDATE SET
        value = excluded.value,
        size_bytes = excluded.size_bytes,
        tags = excluded.tags,
        ttl_seconds = excluded.ttl_seconds,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
      `,
    ).run(
      input.key,
      namespace,
      input.value,
      sizeBytes,
      tags,
      ttlSeconds,
      at,
      at,
      expiresAt,
    );
    recordEvent(db, "set", { key: input.key, namespace, source: input.source, at });
    const row = db
      .prepare(`SELECT * FROM entries WHERE key = ? AND namespace = ?`)
      .get(input.key, namespace);
    if (!row) throw new Error("setEntry failed to read back the row");
    return rowToEntry(row);
  });
}

export function getEntry(
  key: string,
  opts: { namespace?: string; countMiss?: boolean; source?: string } = {},
): GetEntryResult {
  const namespace = ns(opts.namespace);
  const count = opts.countMiss !== false;
  const at = nowMs();

  return withTxn((db) => {
    if (count) {
      const hit = db
        .prepare(
          `
          UPDATE entries
          SET hits = hits + 1
          WHERE key = ? AND namespace = ?
            AND (expires_at IS NULL OR expires_at > ?)
          RETURNING *
          `,
        )
        .get(key, namespace, at);
      if (hit) {
        recordEvent(db, "hit", { key, namespace, source: opts.source, at });
        const entry = rowToEntry(hit);
        return { found: true, value: entry.value, expired: false, entry };
      }
    } else {
      const live = db
        .prepare(
          `
          SELECT * FROM entries
          WHERE key = ? AND namespace = ?
            AND (expires_at IS NULL OR expires_at > ?)
          `,
        )
        .get(key, namespace, at);
      if (live) {
        const entry = rowToEntry(live);
        return { found: true, value: entry.value, expired: false, entry };
      }
    }

    const expired = db
      .prepare(
        `
        DELETE FROM entries
        WHERE key = ? AND namespace = ?
          AND expires_at IS NOT NULL AND expires_at <= ?
        RETURNING *
        `,
      )
      .get(key, namespace, at);
    if (expired) {
      recordEvent(db, "expire", { key, namespace, source: opts.source, at });
      if (count) {
        recordEvent(db, "miss", { key, namespace, source: opts.source, at });
      }
      return { found: false, expired: true };
    }

    if (count) {
      recordEvent(db, "miss", { key, namespace, source: opts.source, at });
    }
    return { found: false, expired: false };
  });
}

export function deleteEntry(
  key: string,
  opts: { namespace?: string; source?: string } = {},
): boolean {
  const namespace = ns(opts.namespace);
  return withTxn((db) => {
    const result = db
      .prepare(`DELETE FROM entries WHERE key = ? AND namespace = ?`)
      .run(key, namespace);
    const deleted = asNumber(result.changes) > 0;
    if (deleted) {
      recordEvent(db, "del", { key, namespace, source: opts.source });
    }
    return deleted;
  });
}

const SORT_COLUMNS = {
  updated: "updated_at",
  created: "created_at",
  hits: "hits",
  size: "size_bytes",
  key: "key",
} as const;

export function listEntries(input: ListEntriesInput = {}): {
  items: EntryMeta[];
  total: number;
} {
  const namespace = ns(input.namespace);
  const status = input.status ?? "all";
  const sort = input.sort && input.sort in SORT_COLUMNS ? input.sort : "updated";
  const order = input.order === "asc" ? "ASC" : "DESC";
  const limit = Number.isFinite(input.limit) ? Math.max(0, Math.floor(input.limit ?? 50)) : 50;
  const offset = Number.isFinite(input.offset) ? Math.max(0, Math.floor(input.offset ?? 0)) : 0;
  const at = nowMs();
  const sortColumn = SORT_COLUMNS[sort];

  const where: string[] = ["namespace = ?"];
  const params: Array<string | number> = [namespace];

  if (status === "active") {
    where.push("(expires_at IS NULL OR expires_at > ?)");
    params.push(at);
  } else if (status === "expired") {
    where.push("(expires_at IS NOT NULL AND expires_at <= ?)");
    params.push(at);
  }

  if (input.q && input.q.length > 0) {
    const like = `%${escapeLike(input.q.toLowerCase())}%`;
    where.push("(LOWER(key) LIKE ? ESCAPE '\\' OR LOWER(value) LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }

  if (input.tag && input.tag.length > 0) {
    where.push(
      "EXISTS (SELECT 1 FROM json_each(entries.tags) WHERE json_each.value = ?)",
    );
    params.push(input.tag);
  }

  const whereSql = where.join(" AND ");
  const db = getDb();
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM entries WHERE ${whereSql}`)
    .get(...params);
  const total = asNumber(totalRow?.total);
  const items = db
    .prepare(
      `
      SELECT
        key, namespace, substr(value, 1, ${VALUE_PREVIEW_CHARS}) AS preview,
        size_bytes, tags, ttl_seconds, created_at, updated_at, expires_at, hits, misses
      FROM entries
      WHERE ${whereSql}
      ORDER BY ${sortColumn} ${order}, key ASC
      LIMIT ? OFFSET ?
      `,
    )
    .all(...params, limit, offset)
    .map((row) => rowToMeta(row));

  return { items, total };
}

export function invalidateByTags(
  tags: string[],
  opts: { namespace?: string; source?: string } = {},
): number {
  const unique = [...new Set(tags.filter((tag) => tag.length > 0))];
  if (unique.length === 0) return 0;
  const namespace = ns(opts.namespace);
  const placeholders = unique.map(() => "?").join(", ");
  return withTxn((db) => {
    const result = db
      .prepare(
        `
        DELETE FROM entries
        WHERE namespace = ?
          AND EXISTS (
            SELECT 1 FROM json_each(entries.tags)
            WHERE json_each.value IN (${placeholders})
          )
        `,
      )
      .run(namespace, ...unique);
    const deleted = asNumber(result.changes);
    if (deleted > 0) {
      recordEvent(db, "invalidate", { key: null, namespace, source: opts.source });
    }
    return deleted;
  });
}

export function purgeExpired(
  opts: { namespace?: string; source?: string } = {},
): number {
  const namespace = ns(opts.namespace);
  const at = nowMs();
  return withTxn((db) => {
    const result = db
      .prepare(
        `
        DELETE FROM entries
        WHERE namespace = ?
          AND expires_at IS NOT NULL AND expires_at <= ?
        `,
      )
      .run(namespace, at);
    const deleted = asNumber(result.changes);
    if (deleted > 0) {
      recordEvent(db, "purge", { key: null, namespace, source: opts.source, at });
    }
    return deleted;
  });
}

export function clearEntries(
  opts: { prefix?: string; namespace?: string; source?: string } = {},
): number {
  const namespace = ns(opts.namespace);
  return withTxn((db) => {
    let result;
    if (opts.prefix != null && opts.prefix.length > 0) {
      result = db
        .prepare(
          `DELETE FROM entries WHERE namespace = ? AND key LIKE ? ESCAPE '\\'`,
        )
        .run(namespace, `${escapeLike(opts.prefix)}%`);
    } else {
      result = db.prepare(`DELETE FROM entries WHERE namespace = ?`).run(namespace);
    }
    const deleted = asNumber(result.changes);
    if (deleted > 0) {
      recordEvent(db, "clear", { key: opts.prefix ?? null, namespace, source: opts.source });
    }
    return deleted;
  });
}

export function stats(opts: { namespace?: string } = {}): StatsResult {
  const namespace = ns(opts.namespace);
  const at = nowMs();
  const db = getDb();

  const counts = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN expires_at IS NULL OR expires_at > ? THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= ? THEN 1 ELSE 0 END) AS expired,
        COALESCE(SUM(size_bytes), 0) AS totalBytes
      FROM entries
      WHERE namespace = ?
      `,
    )
    .get(at, at, namespace);

  const access = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN action = 'hit' THEN 1 ELSE 0 END) AS hits,
        SUM(CASE WHEN action = 'miss' THEN 1 ELSE 0 END) AS misses
      FROM op_events
      WHERE namespace = ?
      `,
    )
    .get(namespace);

  const hits = asNumber(access?.hits);
  const misses = asNumber(access?.misses);
  const denom = hits + misses;

  const topKeys = db
    .prepare(
      `
      SELECT key, hits
      FROM entries
      WHERE namespace = ?
      ORDER BY hits DESC, key ASC
      LIMIT 10
      `,
    )
    .all(namespace)
    .map((row) => ({ key: asString(row.key), hits: asNumber(row.hits) }));

  const days = last7LocalDays(at);
  const start = (() => {
    const d = new Date(at);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 6);
    return d.getTime();
  })();

  const seriesRows = db
    .prepare(
      `
      SELECT
        strftime('%Y-%m-%d', at / 1000.0, 'unixepoch', 'localtime') AS day,
        SUM(CASE WHEN action = 'set' THEN 1 ELSE 0 END) AS sets,
        SUM(CASE WHEN action IN ('hit', 'miss', 'get') THEN 1 ELSE 0 END) AS gets
      FROM op_events
      WHERE namespace = ? AND at >= ?
      GROUP BY day
      `,
    )
    .all(namespace, start);

  const byDay = new Map<string, { sets: number; gets: number }>();
  for (const row of seriesRows) {
    byDay.set(asString(row.day), {
      sets: asNumber(row.sets),
      gets: asNumber(row.gets),
    });
  }

  return {
    total: asNumber(counts?.total),
    active: asNumber(counts?.active),
    expired: asNumber(counts?.expired),
    totalBytes: asNumber(counts?.totalBytes),
    hits,
    misses,
    hitRate: denom === 0 ? 0 : hits / denom,
    topKeys,
    series: days.map((day) => ({
      day,
      sets: byDay.get(day)?.sets ?? 0,
      gets: byDay.get(day)?.gets ?? 0,
    })),
  };
}
