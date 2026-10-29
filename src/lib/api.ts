import { broadcast } from "./broadcast";
import type { Done, Fail } from "./db";

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const noIdentity = (): Response => json(401, { reason: "no-identity" });

// A refused action, with the reason told back to the caller.
export function refuse(res: { status: number; reason: string }): Response {
  return json(res.status, { reason: res.reason });
}

// A committed change goes out to every open stream straight away.
export function reply(res: Done | Fail): Response {
  if (!res.ok) return refuse(res);
  broadcast();
  return json(200, { slot: res.slot });
}

export type Parsed = { ok: true; value: Record<string, unknown> } | { ok: false; res: Response };

// Strict by design: JSON only, an object, and no key the endpoint doesn't
// name. An unrecognised field is a 400, not something quietly ignored.
export async function parseBody(request: Request, keys: readonly string[]): Promise<Parsed> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("application/json")) {
    return { ok: false, res: json(415, { reason: "expected-json" }) };
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, res: json(400, { reason: "invalid-json" }) };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, res: json(400, { reason: "expected-object" }) };
  }
  for (const key of Object.keys(raw)) {
    if (!keys.includes(key)) return { ok: false, res: json(400, { reason: `unexpected-field:${key}` }) };
  }
  return { ok: true, value: raw as Record<string, unknown> };
}

export const isId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
