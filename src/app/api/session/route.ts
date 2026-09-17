import { cookies } from "next/headers";
import { adminPasswordOk, signSession } from "@/lib/auth";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/session-cookie";
import {
  asRecord,
  json,
  readJsonBody,
  unauthorized,
} from "@/app/_lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.value);
  const password = body && typeof body.password === "string" ? body.password : "";
  if (!adminPasswordOk(password)) return unauthorized();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, signSession(), sessionCookieOptions());
  return json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  return json({ ok: true });
}
