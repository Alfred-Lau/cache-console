import { stats } from "@/lib/cache";
import { requireAdminApi } from "@/app/_lib/guards";
import { json } from "@/app/_lib/http";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  return json(stats());
}
