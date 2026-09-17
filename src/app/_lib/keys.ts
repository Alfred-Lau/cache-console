export function parsePathKey(
  raw: string,
): { ok: true; key: string } | { ok: false } {
  let key: string;
  try {
    key = decodeURIComponent(raw);
  } catch {
    return { ok: false };
  }
  if (!key || key.includes("/")) return { ok: false };
  return { ok: true, key };
}
