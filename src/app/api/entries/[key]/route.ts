import { deleteEntry, getEntry, setEntry } from "@/lib/cache";
import { requireAdminApi } from "@/app/_lib/guards";
import {
  asRecord,
  asStringArray,
  badRequest,
  json,
  notFound,
  readJsonBody,
} from "@/app/_lib/http";
import { parsePathKey } from "@/app/_lib/keys";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const parsed = parsePathKey((await ctx.params).key);
  if (!parsed.ok) return badRequest("invalid_key");

  const result = getEntry(parsed.key, { countMiss: false, source: "console" });
  if (!result.found || !result.entry) return notFound();
  return json(result.entry);
}

export async function PATCH(request: Request, ctx: Ctx) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const parsed = parsePathKey((await ctx.params).key);
  if (!parsed.ok) return badRequest("invalid_key");

  const current = getEntry(parsed.key, { countMiss: false, source: "console" });
  if (!current.found || !current.entry) return notFound();

  const bodyParsed = await readJsonBody(request);
  if (!bodyParsed.ok) return bodyParsed.response;
  const body = asRecord(bodyParsed.value);
  if (!body) return badRequest("invalid_body");

  let value = current.entry.value;
  if ("value" in body) {
    if (typeof body.value !== "string") return badRequest("invalid_value");
    value = body.value;
  }

  let ttlSeconds: number | null = current.entry.ttl_seconds;
  if ("ttlSeconds" in body) {
    if (body.ttlSeconds == null) ttlSeconds = null;
    else if (typeof body.ttlSeconds === "number" && Number.isFinite(body.ttlSeconds)) {
      ttlSeconds = body.ttlSeconds;
    } else {
      return badRequest("invalid_ttl");
    }
  }

  let tags = current.entry.tags;
  if ("tags" in body) {
    const parsedTags = asStringArray(body.tags);
    if (!parsedTags) return badRequest("invalid_tags");
    tags = parsedTags;
  }

  const entry = setEntry({
    key: parsed.key,
    value,
    ttlSeconds,
    tags,
    source: "console",
  });
  return json({ ok: true, key: entry.key, expiresAt: entry.expires_at });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const parsed = parsePathKey((await ctx.params).key);
  if (!parsed.ok) return badRequest("invalid_key");
  const deleted = deleteEntry(parsed.key, { source: "console" });
  return json({ ok: true, deleted });
}
