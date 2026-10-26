import type { APIRoute } from "astro";
import { isAirport } from "../../../lib/airports";
import { json, noIdentity, parseBody, reply } from "../../../lib/api";
import { requestLanding } from "../../../lib/db";
import { readUserId } from "../../../lib/identity";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const uid = readUserId(cookies);
  if (!uid) return noIdentity();

  const body = await parseBody(request, ["airport"]);
  if (!body.ok) return body.res;
  const airport = body.value.airport;
  if (!isAirport(airport)) return json(400, { reason: "bad-airport" });

  return reply(requestLanding(uid, airport));
};
