import { broadcast } from "./broadcast";
import type { Done, Fail } from "./db";
import { metrics } from "./metrics";

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const noIdentity = (): Response => json(401, { reason: "no-identity" });

// A refused action: counted for the tower's metrics, and told why.
export function refuse(res: { status: number; reason: string }): Response {
  metrics.denials[res.reason] = (metrics.denials[res.reason] ?? 0) + 1;
  return json(res.status, { reason: res.reason });
}

// A committed change goes out to every open stream straight away, rather than
// waiting for the next tick, so other screens see it in tens of milliseconds.
export function reply(res: Done | Fail): Response {
  if (!res.ok) return refuse(res);
  broadcast();
  return json(200, { plane: res.plane });
}

export type Parsed = { ok: true; value: Record<string, unknown> } | { ok: false; res: Response };

// Strict by design: JSON only, an object, and no key the endpoint doesn't
// name. A client that sends a position, or someone else's plane id where
// none is expected, is refused rather than quietly ignored.
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

export const isPlaneId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
export const isStep = (v: unknown): v is -1 | 1 => v === -1 || v === 1;
