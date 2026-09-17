import { clearEntries } from "@/lib/cache";
import { requireAdminApi } from "@/app/_lib/guards";
import { asRecord, badRequest, json, readJsonBody } from "@/app/_lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.value);
  if (!body || body.confirm !== "DELETE") return badRequest("confirm_required");

  const prefix = typeof body.prefix === "string" ? body.prefix : undefined;
  const deleted = clearEntries({ prefix, source: "console" });
  return json({ ok: true, deleted });
}
