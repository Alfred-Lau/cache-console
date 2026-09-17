import { invalidateByTags } from "@/lib/cache";
import { requireApiKey } from "@/app/_lib/guards";
import { asRecord, asStringArray, badRequest, json, readJsonBody } from "@/app/_lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.value);
  const tags = body ? asStringArray(body.tags) : null;
  if (!tags) return badRequest("tags_required");

  const deleted = invalidateByTags(tags, { source: "kv" });
  return json({ ok: true, deleted });
}
