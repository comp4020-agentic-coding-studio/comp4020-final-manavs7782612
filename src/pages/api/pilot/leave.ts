import type { APIRoute } from "astro";
import { json, noIdentity, parseBody, refuse } from "../../../lib/api";
import { broadcast } from "../../../lib/broadcast";
import { leave } from "../../../lib/db";
import { readUserId } from "../../../lib/identity";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const uid = readUserId(cookies);
  if (!uid) return noIdentity();

  const body = await parseBody(request, []);
  if (!body.ok) return body.res;

  const res = leave(uid);
  if (!res.ok) return refuse(res);
  broadcast();
  return json(200, {});
};
