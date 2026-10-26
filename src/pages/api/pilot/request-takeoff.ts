import type { APIRoute } from "astro";
import { noIdentity, parseBody, reply } from "../../../lib/api";
import { requestTakeoff } from "../../../lib/db";
import { readUserId } from "../../../lib/identity";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const uid = readUserId(cookies);
  if (!uid) return noIdentity();

  const body = await parseBody(request, []);
  if (!body.ok) return body.res;

  return reply(requestTakeoff(uid));
};
