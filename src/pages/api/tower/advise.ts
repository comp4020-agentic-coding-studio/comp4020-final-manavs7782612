import type { APIRoute } from "astro";
import { isPhrase } from "../../../lib/airports";
import { isPlaneId, json, noIdentity, parseBody, reply } from "../../../lib/api";
import { advise } from "../../../lib/db";
import { readUserId } from "../../../lib/identity";

export const prerender = false;

// The tower can say one of a few fixed phrases to a plane. It can never steer
// it: advice shows on the pilot's strip and is logged, nothing more.
export const POST: APIRoute = async ({ request, cookies }) => {
  const uid = readUserId(cookies);
  if (!uid) return noIdentity();

  const body = await parseBody(request, ["id", "phrase"]);
  if (!body.ok) return body.res;
  const { id, phrase } = body.value;
  if (!isPlaneId(id)) return json(400, { reason: "bad-id" });
  if (!isPhrase(phrase)) return json(400, { reason: "bad-phrase" });

  return reply(advise(uid, id, phrase));
};
