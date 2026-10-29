import type { AstroCookies } from "astro";
import { randomBytes } from "node:crypto";
import { DISPATCHERS, DRIVERS, findPerson, type Role } from "./roster";

const COOKIE = "session";

export interface Session {
  personId: number;
  name: string;
  role: Role;
}

// Sessions are process memory, not persisted state: logging back in after a
// restart is a login, not a data-loss event, unlike a slot's lock or the
// audit log. Kept on globalThis so a dev reload can't create a second map
// and orphan live cookies.
const g = globalThis as unknown as { __slotlockSessions?: Map<string, Session> };
const sessions = (g.__slotlockSessions ??= new Map<string, Session>());

// Explicit action only: no page render mints a session. Dispatchers and
// drivers are attributable identities, so "visit the page" isn't enough —
// they have to say who they are.
export function login(name: string, pin: string, role: Role): string | null {
  const person = findPerson(name, pin, role);
  if (!person) return null;
  const token = randomBytes(24).toString("base64url");
  sessions.set(token, { personId: person.id, name: person.name, role });
  return token;
}

export function logout(cookies: AstroCookies): void {
  const token = cookies.get(COOKIE)?.value;
  if (token) sessions.delete(token);
  cookies.delete(COOKIE, { path: "/" });
}

export function setSessionCookie(cookies: AstroCookies, token: string, secure: boolean): void {
  cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 60 * 60 * 12,
  });
}

// What every API route and the stream use: the cookie or nothing. The
// consumer dock view never calls this — it needs no identity at all.
export function readSession(cookies: AstroCookies): Session | null {
  const token = cookies.get(COOKIE)?.value;
  if (!token) return null;
  return sessions.get(token) ?? null;
}

export const isRole = (v: unknown): v is Role => v === "dispatcher" || v === "driver";

export const rosterFor = (role: Role): readonly { id: number; name: string }[] =>
  role === "dispatcher" ? DISPATCHERS : DRIVERS;
