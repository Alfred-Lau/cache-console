import { revalidateTag } from "next/cache";
import { requireAdminApi } from "@/app/_lib/guards";
import { asRecord, badRequest, json, readJsonBody } from "@/app/_lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.value);
  const tag = body && typeof body.tag === "string" ? body.tag.trim() : "";
  if (!tag) return badRequest("tag_required");

  // Next.js 16 要求第二参；{ expire: 0 } 等价于已弃用的单参立即失效。
  revalidateTag(tag, { expire: 0 });
  return json({ ok: true, tag, at: Date.now() });
}
