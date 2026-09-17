export const SESSION_COOKIE_NAME = "cc_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  secure: boolean;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  };
}
