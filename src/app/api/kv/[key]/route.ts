import { deleteEntry, getEntry, setEntry } from "@/lib/cache";
import { requireApiKey } from "@/app/_lib/guards";
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

export async function GET(request: Request, ctx: Ctx) {
  const denied = requireApiKey(request);
  if (denied) return denied;
  const parsed = parsePathKey((await ctx.params).key);
  if (!parsed.ok) return badRequest("invalid_key");

  const result = getEntry(parsed.key, { source: "kv" });
  if (!result.found || !result.entry) return notFound();
  const entry = result.entry;
  return json({
    key: entry.key,
    value: entry.value,
    tags: entry.tags,
    expiresAt: entry.expires_at,
    hits: entry.hits,
  });
}

export async function PUT(request: Request, ctx: Ctx) {
  const denied = requireApiKey(request);
  if (denied) return denied;
  const parsed = parsePathKey((await ctx.params).key);
  if (!parsed.ok) return badRequest("invalid_key");

  const bodyParsed = await readJsonBody(request);
  if (!bodyParsed.ok) return bodyParsed.response;
  const body = asRecord(bodyParsed.value);
  if (!body || typeof body.value !== "string") return badRequest("value_required");

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

  const entry = setEntry({
    key: parsed.key,
    value: body.value,
    ttlSeconds,
    tags,
    source: "kv",
  });
  return json({ ok: true, key: entry.key, expiresAt: entry.expires_at });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const denied = requireApiKey(request);
  if (denied) return denied;
  const parsed = parsePathKey((await ctx.params).key);
  if (!parsed.ok) return badRequest("invalid_key");
  const deleted = deleteEntry(parsed.key, { source: "kv" });
  return json({ ok: true, deleted });
}
