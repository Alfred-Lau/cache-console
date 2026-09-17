import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiKeyOk, verifySession } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { unauthorized } from "./http";

export function requireApiKey(request: Request): Response | null {
  if (!apiKeyOk(request)) return unauthorized();
  return null;
}

export async function requireAdminApi(): Promise<Response | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? "";
  if (!verifySession(token)) return unauthorized();
  return null;
}

export async function requirePageSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? "";
  if (!verifySession(token)) redirect("/login");
}
