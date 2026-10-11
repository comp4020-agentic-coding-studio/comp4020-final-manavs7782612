import type { APIRoute } from "astro";
import { applyDelta } from "../../lib/db";
import { broadcastCount } from "../../lib/broadcast";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("expected JSON body", { status: 400 });
  }

  const delta = (body as { delta?: unknown } | null)?.delta;
  if (delta !== 1 && delta !== -1) {
    return new Response('"delta" must be 1 or -1', { status: 400 });
  }

  const count = applyDelta(delta);
  broadcastCount(count);

  return new Response(JSON.stringify({ count }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
