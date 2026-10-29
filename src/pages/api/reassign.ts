import type { APIRoute } from "astro";
import { isId, json, noIdentity, parseBody, reply } from "../../lib/api";
import { reassignSlot } from "../../lib/db";
import { readSession } from "../../lib/identity";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = readSession(cookies);
  if (!session) return noIdentity();
  if (session.role !== "dispatcher") return json(403, { reason: "not-a-dispatcher" });

  const body = await parseBody(request, ["slotId", "driverId"]);
  if (!body.ok) return body.res;
  const { slotId, driverId } = body.value;
  if (!isId(slotId)) return json(400, { reason: "bad-slot-id" });
  if (!isId(driverId)) return json(400, { reason: "bad-driver-id" });

  return reply(reassignSlot(session.personId, slotId, driverId));
};
