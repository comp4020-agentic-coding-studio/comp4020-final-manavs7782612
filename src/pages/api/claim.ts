import type { APIRoute } from "astro";
import { isId, json, noIdentity, parseBody, reply } from "../../lib/api";
import { claimSlot } from "../../lib/db";
import { readSession } from "../../lib/identity";

export const prerender = false;

// Only a dispatcher claims a slot; the driver named in the body is who it's
// claimed for, never who's making the request (CLAUDE.md rule 7, 8).
export const POST: APIRoute = async ({ request, cookies }) => {
  const session = readSession(cookies);
  if (!session) return noIdentity();
  if (session.role !== "dispatcher") return json(403, { reason: "not-a-dispatcher" });

  const body = await parseBody(request, ["slotId", "driverId"]);
  if (!body.ok) return body.res;
  const { slotId, driverId } = body.value;
  if (!isId(slotId)) return json(400, { reason: "bad-slot-id" });
  if (!isId(driverId)) return json(400, { reason: "bad-driver-id" });

  return reply(claimSlot(session.personId, slotId, driverId));
};
