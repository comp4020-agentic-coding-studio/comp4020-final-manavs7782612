import type { AstroCookies } from "astro";
import { createHash, randomUUID } from "node:crypto";

const COOKIE = "uid";
const SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Only page renders (`/` and `/tower`) call this. A fresh visitor gets an
// httpOnly cookie on their very first request: no login, no setup, just the
// URL. API routes and the live stream never mint one (see readUserId), so a
// first visit can't create two identities at once.
export function getOrSetUserId(cookies: AstroCookies, secure: boolean): string {
  const existing = readUserId(cookies);
  if (existing) return existing;

  const id = randomUUID();
  cookies.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

// What every API route and the stream use: the cookie or nothing. A value that
// isn't shaped like one we issued is treated as no identity at all.
export function readUserId(cookies: AstroCookies): string | null {
  const value = cookies.get(COOKIE)?.value;
  return value && SHAPE.test(value) ? value : null;
}

// What a log line or the tower shows instead of the secret cookie. A hash,
// not a prefix: the first characters of the cookie are part of the secret.
export function publicId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 8);
}
