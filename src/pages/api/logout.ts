import type { APIRoute } from "astro";
import { logout } from "../../lib/identity";
import { json, parseBody } from "../../lib/api";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await parseBody(request, []);
  if (!body.ok) return body.res;
  logout(cookies);
  return json(200, {});
};
