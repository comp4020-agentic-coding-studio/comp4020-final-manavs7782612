import type { APIRoute } from "astro";
import { getCount } from "../../../lib/db";
import { subscribe, unsubscribe } from "../../../lib/broadcast";

export const prerender = false;

// A same-origin server-sent events stream: the room count only ever flows
// server to browser, so there's nothing a client needs to send back over the
// same connection. Every open tab gets the current count the moment it
// connects, then every change after that, live.
export const GET: APIRoute = ({ request }) => {
  const encoder = new TextEncoder();
  let thisController: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      thisController = controller;
      controller.enqueue(encoder.encode(`event: count\ndata: ${getCount()}\n\n`));
      subscribe(controller);
    },
    cancel() {
      unsubscribe(thisController);
    },
  });

  request.signal.addEventListener("abort", () => unsubscribe(thisController));

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
};
