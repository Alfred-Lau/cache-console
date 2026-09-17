import type { NextRequest } from "next/server";
import { getEntry, listEntries, setEntry, type ListEntriesInput } from "@/lib/cache";
import { requireAdminApi } from "@/app/_lib/guards";
import {
  asRecord,
  asStringArray,
  badRequest,
  json,
  parseLimit,
  parsePage,
  readJsonBody,
} from "@/app/_lib/http";

export const runtime = "nodejs";

const STATUSES = new Set(["all", "active", "expired"]);
const SORTS = new Set(["updated", "created", "hits", "size", "key"]);
const ORDERS = new Set(["asc", "desc"]);

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const statusRaw = sp.get("status") ?? "all";
  const sortRaw = sp.get("sort") ?? "updated";
  const orderRaw = sp.get("order") ?? "desc";
  if (!STATUSES.has(statusRaw) || !SORTS.has(sortRaw) || !ORDERS.has(orderRaw)) {
    return badRequest("invalid_query");
  }

  const page = parsePage(sp.get("page"));
  const pageSize = parseLimit(sp.get("pageSize"), 20, 100);
  const input: ListEntriesInput = {
    q: sp.get("q") ?? undefined,
    tag: sp.get("tag") ?? undefined,
    status: statusRaw as ListEntriesInput["status"],
    sort: sortRaw as ListEntriesInput["sort"],
    order: orderRaw as ListEntriesInput["order"],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
  const { items, total } = listEntries(input);
  return json({ items, total, page, pageSize });
}

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.value);
  if (!body) return badRequest("invalid_body");

  const keyRaw = typeof body.key === "string" ? body.key.trim() : "";
  if (!keyRaw || keyRaw.includes("/")) return badRequest("invalid_key");
  if (typeof body.value !== "string") return badRequest("value_required");

  let ttlSeconds: number | null | undefined;
  if ("ttlSeconds" in body) {
    if (body.ttlSeconds == null) ttlSeconds = null;
    else if (typeof body.ttlSeconds === "number" && Number.isFinite(body.ttlSeconds)) {
      ttlSeconds = body.ttlSeconds;
    } else {
      return badRequest("invalid_ttl");
    }
  }

  let tags: string[] | undefined;
  if ("tags" in body) {
    const parsedTags = asStringArray(body.tags);
    if (!parsedTags) return badRequest("invalid_tags");
    tags = parsedTags;
  }

  const existing = getEntry(keyRaw, { countMiss: false, source: "console" });
  if (existing.found) {
    return json({ error: "conflict" }, 409);
  }

  const entry = setEntry({
    key: keyRaw,
    value: body.value,
    ttlSeconds,
    tags,
    source: "console",
  });
  return json({ ok: true, key: entry.key, expiresAt: entry.expires_at }, 201);
}
