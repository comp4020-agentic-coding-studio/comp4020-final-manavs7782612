import type { APIRoute } from "astro";
import { setPresence } from "../../lib/db";
import { broadcastCount } from "../../lib/broadcast";
import { getOrSetUserId, shortId } from "../../lib/identity";
import { logEvent } from "../../lib/log";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("expected JSON body", { status: 400 });
  }

  const present = (body as { present?: unknown } | null)?.present;
  if (typeof present !== "boolean") {
    return new Response('"present" must be a boolean', { status: 400 });
  }

  // The permission decision crit 10 asks for: a request can only ever flip
  // the presence of the identity its own cookie names. userId comes from
  // getOrSetUserId, never from the request body, so there is no field a
  // client could send to act as someone else.
  const userId = getOrSetUserId(cookies, url.protocol === "https:");
  const count = setPresence(userId, present);
  broadcastCount(count);

  logEvent({ userId: shortId(userId), action: present ? "arrived" : "left", count });

  return new Response(JSON.stringify({ present, count }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
