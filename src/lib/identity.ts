import type { AstroCookies } from "astro";
import { randomUUID } from "node:crypto";

const COOKIE = "uid";

// Crit 10's whole permission story rests on this: the server decides who's
// acting from an httpOnly cookie it issued, never from anything a request
// body claims. A fresh visitor gets one on their very first request — no
// login, no setup, just the URL — and keeps it for as long as the cookie
// lives.
export function getOrSetUserId(cookies: AstroCookies, secure: boolean): string {
  const existing = cookies.get(COOKIE)?.value;
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

// What a log line or the page shows instead of the full UUID — enough to
// tell two visitors apart, not enough to look like a real identity.
export function shortId(userId: string): string {
  return userId.slice(0, 8);
}
