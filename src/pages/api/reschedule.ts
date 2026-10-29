import type { APIRoute } from "astro";
import { isId, json, noIdentity, parseBody, reply } from "../../lib/api";
import { rescheduleSlot } from "../../lib/db";
import { readSession } from "../../lib/identity";

export const prerender = false;

const isIsoDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = readSession(cookies);
  if (!session) return noIdentity();
  if (session.role !== "dispatcher") return json(403, { reason: "not-a-dispatcher" });

  const body = await parseBody(request, ["slotId", "startAt", "durationMin"]);
  if (!body.ok) return body.res;
  const { slotId, startAt, durationMin } = body.value;
  if (!isId(slotId)) return json(400, { reason: "bad-slot-id" });
  if (!isIsoDate(startAt)) return json(400, { reason: "bad-start-at" });
  if (!isId(durationMin)) return json(400, { reason: "bad-duration" });

  return reply(rescheduleSlot(session.personId, slotId, startAt, durationMin));
};
