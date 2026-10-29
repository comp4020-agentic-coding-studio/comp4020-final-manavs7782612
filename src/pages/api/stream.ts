import type { APIRoute } from "astro";
import { json, noIdentity } from "../../lib/api";
import {
  ensureHeartbeat,
  MAX_STREAMS,
  MAX_STREAMS_PER_SESSION,
  sendInitial,
  STREAM_BUFFER,
  streamCount,
  streamsFor,
  subscribe,
  unsubscribe,
  type Client,
} from "../../lib/broadcast";
import { readSession } from "../../lib/identity";

export const prerender = false;

// One same-origin server-sent events stream per tab. The consumer role
// needs no identity (the dock view is public); dispatcher and driver need a
// session matching the role they're asking for.
export const GET: APIRoute = ({ request, cookies, url }) => {
  const role = url.searchParams.get("role");
  if (role !== "dispatcher" && role !== "driver" && role !== "consumer") {
    return json(400, { reason: "bad-role" });
  }

  const session = role === "consumer" ? null : readSession(cookies);
  if (role !== "consumer" && (!session || session.role !== role)) return noIdentity();

  if (streamCount() >= MAX_STREAMS || streamsFor(session) >= MAX_STREAMS_PER_SESSION) {
    return json(503, { reason: "too-many-streams" });
  }

  ensureHeartbeat();

  let client: Client;
  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        client = { controller, session, role };
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
