import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { isAirport } from "../../../lib/airports";
import { json, noIdentity, parseBody, reply } from "../../../lib/api";
import { join } from "../../../lib/db";
import { readUserId } from "../../../lib/identity";

export const prerender = false;

// Behind Fly's proxy the client address arrives in fly-client-ip. It's hashed
// before it's stored, and only used to cap how many planes one network can
// hold: a cookie costs nothing to mint, so a per-cookie limit alone can't.
function networkId(request: Request): string | null {
  const ip = request.headers.get("fly-client-ip");
  return ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const uid = readUserId(cookies);
  if (!uid) return noIdentity();

  const body = await parseBody(request, ["airport"]);
  if (!body.ok) return body.res;
  const airport = body.value.airport;
  if (!isAirport(airport)) return json(400, { reason: "bad-airport" });

  const res = join(uid, airport, networkId(request));
  return reply(res);
};
