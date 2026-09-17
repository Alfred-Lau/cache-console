export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function unauthorized(): Response {
  return json({ error: "unauthorized" }, 401);
}

export function badRequest(error = "bad_request"): Response {
  return json({ error }, 400);
}

export function notFound(error = "not_found"): Response {
  return json({ error }, 404);
}

export async function readJsonBody(request: Request): Promise<
  { ok: true; value: unknown } | { ok: false; response: Response }
> {
  try {
    const text = await request.text();
    if (!text.trim()) return { ok: true, value: {} };
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: badRequest("invalid_json") };
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => typeof item === "string")) return null;
  return value;
}

export function parseLimit(
  raw: string | null,
  fallback: number,
  max: number,
): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

export function parsePage(raw: string | null, fallback = 1): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}
