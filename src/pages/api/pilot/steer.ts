import type { APIRoute } from "astro";
import { isStep, json, noIdentity, parseBody, refuse, reply } from "../../../lib/api";
import { steer } from "../../../lib/db";
import { readUserId } from "../../../lib/identity";
import { allowSteer } from "../../../lib/limits";

export const prerender = false;

// The only way a pilot moves: a bounded delta. The only keys this accepts are
// turn and speed, each -1 or +1; a position (or anyone else's plane id) is a
// field that doesn't exist here, and sending one is a 400.
export const POST: APIRoute = async ({ request, cookies }) => {
  const uid = readUserId(cookies);
  if (!uid) return noIdentity();
  if (!allowSteer(uid)) return refuse({ status: 429, reason: "slow-down" });

  const body = await parseBody(request, ["turn", "speed"]);
  if (!body.ok) return body.res;
  const { turn, speed } = body.value;
  if (turn === undefined && speed === undefined) return json(400, { reason: "nothing-to-do" });
  if (turn !== undefined && !isStep(turn)) return json(400, { reason: "bad-turn" });
  if (speed !== undefined && !isStep(speed)) return json(400, { reason: "bad-speed" });

  return reply(steer(uid, turn ?? 0, speed ?? 0));
};
