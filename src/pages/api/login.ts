import type { APIRoute } from "astro";
import { isRole, login, setSessionCookie } from "../../lib/identity";
import { json, parseBody } from "../../lib/api";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url }) => {
  const body = await parseBody(request, ["name", "pin", "role"]);
  if (!body.ok) return body.res;
  const { name, pin, role } = body.value;
  if (typeof name !== "string" || !name) return json(400, { reason: "bad-name" });
  if (typeof pin !== "string" || !pin) return json(400, { reason: "bad-pin" });
  if (!isRole(role)) return json(400, { reason: "bad-role" });

  const token = login(name, pin, role);
  if (!token) return json(401, { reason: "bad-credentials" });

  setSessionCookie(cookies, token, url.protocol === "https:");
  return json(200, { name, role });
};
