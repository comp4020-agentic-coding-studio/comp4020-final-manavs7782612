import type { APIRoute } from "astro";
import { isPlaneId, json, noIdentity, parseBody, reply } from "../../../lib/api";
import { clearLanding } from "../../../lib/db";
import { readUserId } from "../../../lib/identity";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const uid = readUserId(cookies);
  if (!uid) return noIdentity();

  const body = await parseBody(request, ["id"]);
  if (!body.ok) return body.res;
  const id = body.value.id;
  if (!isPlaneId(id)) return json(400, { reason: "bad-id" });

  return reply(clearLanding(uid, id));
};
