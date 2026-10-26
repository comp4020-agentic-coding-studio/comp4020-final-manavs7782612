import type { APIRoute } from "astro";
import { json, noIdentity } from "../../lib/api";
import {
  MAX_STREAMS,
  MAX_STREAMS_PER_COOKIE,
  STREAM_BUFFER,
  sendInitial,
  streamCount,
  streamsFor,
  subscribe,
  unsubscribe,
  type Client,
} from "../../lib/broadcast";
import { readUserId } from "../../lib/identity";
import { ensureTick } from "../../lib/sim";

export const prerender = false;

// One same-origin server-sent events stream per tab. State only ever flows
// server to browser here; everything a client does is a separate POST. The
// moment a tab connects it gets a full snapshot, so a reconnect after a Fly
// wake (EventSource retries by itself) is correct immediately.
export const GET: APIRoute = ({ request, cookies, url }) => {
  const uid = readUserId(cookies);
  if (!uid) return noIdentity();

  const role = url.searchParams.get("role");
  if (role !== "pilot" && role !== "tower") return json(400, { reason: "bad-role" });

  if (streamCount() >= MAX_STREAMS || streamsFor(uid) >= MAX_STREAMS_PER_COOKIE) {
    return json(503, { reason: "too-many-streams" });
  }

  ensureTick();

  let client: Client;
  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        client = { controller, uid, role };
        subscribe(client);
        sendInitial(client);
      },
      cancel() {
        unsubscribe(client);
      },
    },
    new CountQueuingStrategy({ highWaterMark: STREAM_BUFFER }),
  );

  request.signal.addEventListener("abort", () => unsubscribe(client));

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
};
