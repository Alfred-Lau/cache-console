import { purgeExpired } from "@/lib/cache";
import { requireAdminApi } from "@/app/_lib/guards";
import { json } from "@/app/_lib/http";

export const runtime = "nodejs";

export async function POST() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const purged = purgeExpired({ source: "console" });
  return json({ ok: true, purged });
}
