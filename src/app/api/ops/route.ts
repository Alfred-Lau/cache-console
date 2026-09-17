import type { NextRequest } from "next/server";
import { listRecentOps } from "@/app/_lib/ops";
import { requireAdminApi } from "@/app/_lib/guards";
import { json, parseLimit } from "@/app/_lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), 50, 200);
  return json({ items: listRecentOps(limit) });
}
