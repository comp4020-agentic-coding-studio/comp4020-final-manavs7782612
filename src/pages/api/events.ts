import type { APIRoute } from "astro";
import { json, noIdentity } from "../../lib/api";
import { readEvents } from "../../lib/db";
import { readSession } from "../../lib/identity";

export const prerender = false;

// GET only: this file exports no PATCH or DELETE handler, so Astro answers
// those methods with its own 405 before any application code runs. That's
// what makes the audit log structurally append-only, not an app-level check
// that a future change could accidentally remove (CLAUDE.md rule 4).
export const GET: APIRoute = ({ cookies }) => {
  const session = readSession(cookies);
  if (!session) return noIdentity();
  if (session.role !== "dispatcher") return json(403, { reason: "not-a-dispatcher" });

  return json(200, { events: readEvents(50) });
};
