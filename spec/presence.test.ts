import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

// Checks the one documented multi-user decision
// (decisions/0002-presence-identity-cookie.md): the server tells visitors
// apart by the identity cookie it issues, a request can only ever change the
// presence of that identity, and the shared count reflects everyone's.
const baseUrl = inject("baseUrl");

// A minimal per-"browser" cookie jar, so two jars in one test behave like two
// separate Chrome profiles hitting the same server.
class Jar {
  private cookie: string | undefined;

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    const res = await fetch(new URL(path, baseUrl), { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return res;
  }

  async post(present: boolean): Promise<Response> {
    return this.fetch("/api/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ present }),
    });
  }
}

async function currentCount(): Promise<number> {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  const countText = new JSDOM(html).window.document.querySelector("#count")?.textContent;
  const count = Number(countText);
  expect(count, `couldn't read a number out of #count ("${countText}")`).not.toBeNaN();
  return count;
}

it("rejects a present value that isn't a boolean", async () => {
  const res = await new Jar().post("yes" as unknown as boolean);
  expect(res.status).toBe(400);
});

it("rejects a body that isn't JSON", async () => {
  const res = await fetch(new URL("/api/presence", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  });
  expect(res.status).toBe(400);
});

it("issues a distinct identity cookie per visitor on first request", async () => {
  const a = await fetch(new URL("/", baseUrl));
  const b = await fetch(new URL("/", baseUrl));
  const cookieA = a.headers.get("set-cookie");
  const cookieB = b.headers.get("set-cookie");
  expect(cookieA).toBeTruthy();
  expect(cookieB).toBeTruthy();
  expect(cookieA).not.toEqual(cookieB);
});

it("two identities can set their own presence independently, and the count reflects both", async () => {
  const before = await currentCount();
  const alice = new Jar();
  const bob = new Jar();

  const aRes = await alice.post(true);
  expect(aRes.status).toBe(200);
  expect(await currentCount()).toBe(before + 1);

  const bRes = await bob.post(true);
  expect(bRes.status).toBe(200);
  expect(await currentCount()).toBe(before + 2);

  // one identity leaving never touches the other's presence
  await alice.post(false);
  expect(await currentCount()).toBe(before + 1);

  await bob.post(false);
  expect(await currentCount()).toBe(before);
});

it("a visitor can only ever change their own presence, never another's", async () => {
  const alice = new Jar();
  const bob = new Jar();

  await alice.post(true);
  const before = await currentCount();

  // bob marking himself present can only ever add to the count, never
  // subtract alice's --- there is no field in the request bob sends that
  // could name alice's identity instead of his own.
  await bob.post(true);
  expect(await currentCount()).toBe(before + 1);

  await bob.post(false);
  await alice.post(false);
});
