import type { SQLOutputValue } from "node:sqlite";
import { getDb } from "@/lib/db";

export type OpEvent = {
  id: number;
  at: number;
  action: string;
  key: string | null;
  namespace: string | null;
  source: string;
};

function asNumber(value: SQLOutputValue | undefined, fallback = 0): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length > 0) return Number(value);
  return fallback;
}

function asNullableString(value: SQLOutputValue | undefined): string | null {
  if (value == null) return null;
  return String(value);
}

export function listRecentOps(limit: number): OpEvent[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT id, at, action, key, namespace, source
      FROM op_events
      ORDER BY at DESC, id DESC
      LIMIT ?
      `,
    )
    .all(limit)
    .map((row) => ({
      id: asNumber(row.id),
      at: asNumber(row.at),
      action: String(row.action ?? ""),
      key: asNullableString(row.key),
      namespace: asNullableString(row.namespace),
      source: String(row.source ?? "console"),
    }));
}
