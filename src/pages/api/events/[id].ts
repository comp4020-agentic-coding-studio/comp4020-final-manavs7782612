import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { json, noIdentity } from "../../../lib/api";
import { readSession } from "../../../lib/identity";

export const prerender = false;

const getStmt = db.prepare("SELECT id, at, actor, role, kind, slot_id, driver_id, reason, detail FROM events WHERE id = ?");

// GET only. No PATCH or DELETE handler exists on this route, for any role —
// that's what "append-only" means in application code, not a role check
// that could be bypassed by an admin flag that doesn't exist here
// (CLAUDE.md rule 4, spec/audit-immutability.md).
export const GET: APIRoute = ({ params, cookies }) => {
  const session = readSession(cookies);
  if (!session) return noIdentity();
  if (session.role !== "dispatcher") return json(403, { reason: "not-a-dispatcher" });

  const id = Number(params.id);
  const row = getStmt.get(id);
  if (!row) return json(404, { reason: "no-such-event" });
  return json(200, { event: row });
};
