import type { NextRequest } from "next/server";
import {
  DEFAULT_NAMESPACE,
  VALUE_PREVIEW_CHARS,
  getEntry,
  listEntries,
} from "@/lib/cache";
import { getDb } from "@/lib/db";
import { requireApiKey } from "@/app/_lib/guards";
import { json, parseLimit } from "@/app/_lib/http";

export const runtime = "nodejs";

function escapeLike(input: string): string {
  return input.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const prefix = request.nextUrl.searchParams.get("prefix") ?? "";
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), 100, 500);

  if (!prefix) {
    const listed = listEntries({
      status: "active",
      sort: "key",
      order: "asc",
      limit,
    });
    return json({
      items: listed.items.map((item) => ({
        key: item.key,
        preview: item.preview,
        tags: item.tags,
        expiresAt: item.expires_at,
        hits: item.hits,
        sizeBytes: item.size_bytes,
      })),
    });
  }

  const at = Date.now();
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        key, substr(value, 1, ${VALUE_PREVIEW_CHARS}) AS preview,
        size_bytes, tags, expires_at, hits
      FROM entries
      WHERE namespace = ?
        AND (expires_at IS NULL OR expires_at > ?)
        AND key LIKE ? ESCAPE '\\'
      ORDER BY key ASC
      LIMIT ?
      `,
    )
    .all(DEFAULT_NAMESPACE, at, `${escapeLike(prefix)}%`, limit);

  return json({
    items: rows.map((row) => ({
      key: String(row.key ?? ""),
      preview: String(row.preview ?? ""),
      tags: parseTags(row.tags),
      expiresAt: row.expires_at == null ? null : Number(row.expires_at),
      hits: Number(row.hits ?? 0),
      sizeBytes: Number(row.size_bytes ?? 0),
    })),
  });
}
