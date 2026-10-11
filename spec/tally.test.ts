import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

// Checks the one documented multi-user decision
// (decisions/0001-apply-deltas-not-counts.md): the server owns the count,
// clients only ever send a direction, and two overlapping presses both land.
const baseUrl = inject("baseUrl");

async function post(delta: unknown): Promise<Response> {
  return fetch(new URL("/api/tally", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ delta }),
  });
}

async function currentCount(): Promise<number> {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  const countText = new JSDOM(html).window.document.querySelector("#count")?.textContent;
  const count = Number(countText);
  expect(count, `couldn't read a number out of #count ("${countText}")`).not.toBeNaN();
  return count;
}

it("rejects a delta that isn't 1 or -1", async () => {
  const res = await post(2);
  expect(res.status).toBe(400);
});

it("rejects a body that isn't JSON", async () => {
  const res = await fetch(new URL("/api/tally", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  });
  expect(res.status).toBe(400);
});

it("applies a delta against the server's count, not one the client sends", async () => {
  const before = await currentCount();
  const res = await post(1);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ count: before + 1 });
});

it("never lets the count go negative", async () => {
  // Drive it down further than any plausible starting count, then confirm
  // one more -1 still reads back as 0, not negative.
  for (let i = 0; i < (await currentCount()) + 5; i++) {
    await post(-1);
  }
  const res = await post(-1);
  expect(await res.json()).toEqual({ count: 0 });
});

it("lands both halves of two overlapping presses, instead of one overwriting the other", async () => {
  const before = await currentCount();
  const [a, b] = await Promise.all([post(1), post(1)]);
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  expect(await currentCount()).toBe(before + 2);
});
