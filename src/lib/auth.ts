import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEV_AUTH_SECRET = "dev-auth-secret";
const DEV_ADMIN_PASSWORD = "dev-admin";
const DEV_API_KEY = "dev-cache-api-key";

let warnedAuthSecret = false;
let warnedAdminPassword = false;
let warnedApiKey = false;

export type HeaderGetter = {
  get(name: string): string | null;
};

export type ApiKeyRequest = {
  headers: HeaderGetter;
};

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function resolveSecret(
  envValue: string | undefined,
  prodFailClosed: boolean,
  warned: boolean,
  markWarned: () => void,
  warnMessage: string,
  devValue: string,
): { secret: string | null; warned: boolean } {
  if (envValue && envValue.length > 0) return { secret: envValue, warned };
  if (prodFailClosed && isProd()) return { secret: null, warned };
  if (!warned) {
    markWarned();
    console.warn(warnMessage);
  }
  return { secret: devValue, warned: true };
}

function authSecret(): string | null {
  const result = resolveSecret(
    process.env.AUTH_SECRET,
    true,
    warnedAuthSecret,
    () => {
      warnedAuthSecret = true;
    },
    "[cache-console] AUTH_SECRET is unset; using a fixed development secret",
    DEV_AUTH_SECRET,
  );
  warnedAuthSecret = result.warned;
  return result.secret;
}

function adminPassword(): string | null {
  const result = resolveSecret(
    process.env.ADMIN_PASSWORD,
    true,
    warnedAdminPassword,
    () => {
      warnedAdminPassword = true;
    },
    "[cache-console] ADMIN_PASSWORD is unset; using a fixed development password",
    DEV_ADMIN_PASSWORD,
  );
  warnedAdminPassword = result.warned;
  return result.secret;
}

function apiKey(): string | null {
  const result = resolveSecret(
    process.env.CACHE_API_KEY,
    true,
    warnedApiKey,
    () => {
      warnedApiKey = true;
    },
    "[cache-console] CACHE_API_KEY is unset; using a fixed development API key",
    DEV_API_KEY,
  );
  warnedApiKey = result.warned;
  return result.secret;
}

export function adminPasswordOk(input: string): boolean {
  const expected = adminPassword();
  if (expected == null) return false;
  return timingSafeStringEqual(input, expected);
}

export function signSession(): string {
  const secret = authSecret();
  const iat = Date.now();
  if (secret == null) return `${iat}.invalid`;
  const sig = createHmac("sha256", secret).update(String(iat)).digest("hex");
  return `${iat}.${sig}`;
}

export function verifySession(cookieValue: string): boolean {
  const secret = authSecret();
  if (secret == null) return false;
  if (!cookieValue) return false;
  const dot = cookieValue.indexOf(".");
  if (dot <= 0) return false;
  const iatStr = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const iat = Number(iatStr);
  if (!Number.isFinite(iat) || !Number.isInteger(iat)) return false;
  if (iat > Date.now() + 60_000) return false;
  if (Date.now() - iat > SESSION_TTL_MS) return false;
  const expected = createHmac("sha256", secret).update(iatStr).digest("hex");
  return timingSafeStringEqual(sig, expected);
}

export function apiKeyOk(request: ApiKeyRequest): boolean {
  const expected = apiKey();
  if (expected == null) return false;
  const headers = request.headers;
  const authorization = headers.get("authorization") ?? headers.get("Authorization");
  let provided: string | null = null;
  if (authorization && authorization.slice(0, 7).toLowerCase() === "bearer ") {
    provided = authorization.slice(7).trim();
  } else {
    provided = headers.get("x-api-key") ?? headers.get("X-API-Key");
  }
  if (!provided) return false;
  return timingSafeStringEqual(provided, expected);
}
