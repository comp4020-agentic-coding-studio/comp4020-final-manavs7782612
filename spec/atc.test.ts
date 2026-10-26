import { createHash } from "node:crypto";
import { afterEach, expect, inject, it } from "vitest";

// Checks Canberra Sector (README.md "What good means", CLAUDE.md rules,
// decisions/0003-server-authoritative-steering.md) against the RUNNING app.
// Two jars are two browsers: nothing here can reach into the server, so what
// passes is what a marker with two Chrome profiles would see. Tests only
// assert on their own planes, never global counts, and every plane they make
// leaves in afterEach.
//
// Contract these tests pin down: pages mint the `uid` cookie, API routes and
// the stream answer 401 without one; bodies are strict JSON (unknown keys are
// a 400); `GET /api/stream?role=pilot|tower` sends `snapshot` events; x and y
// are kilometres; steering bursts are capped at 10 per cookie.
const baseUrl = inject("baseUrl");

interface PlaneView {
  id: number;
  callsign: string;
  status: string;
  airport: string | null;
  x: number;
  y: number;
  heading: number;
  speed: number;
}

interface Snapshot {
  version: number;
  serverNow: number;
  me: (PlaneView & { advisory: string | null }) | null;
  planes: PlaneView[];
  conflicts: [number, number][];
  runways: Record<string, number | null>;
  events?: { actor: string; role: string; kind: string }[];
}

const jars: Jar[] = [];
const streams: Stream[] = [];

class Jar {
  cookie: string | undefined;

  static async create(page: "/" | "/tower" = "/"): Promise<Jar> {
    const jar = new Jar();
    const res = await jar.fetch(page);
    expect(res.status).toBe(200);
    expect(jar.cookie, `${page} didn't mint an identity cookie`).toBeTruthy();
    jars.push(jar);
    return jar;
  }

  get uid(): string {
    return decodeURIComponent(this.cookie!.split("=")[1]);
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    const res = await fetch(new URL(path, baseUrl), { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return res;
  }

  async post(path: string, body: unknown): Promise<Response> {
    return this.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

class Stream {
  latest: Snapshot | undefined;
  private listeners = new Set<() => void>();
  private abort = new AbortController();

  static async open(jar: Jar, role: "pilot" | "tower"): Promise<Stream> {
    const stream = new Stream();
    const res = await jar.fetch(`/api/stream?role=${role}`, { signal: stream.abort.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    streams.push(stream);
    void stream.pump(res.body!);
    return stream;
  }

  private async pump(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6))
            .join("\n");
          if (!data) continue;
          this.latest = JSON.parse(data) as Snapshot;
          for (const listener of this.listeners) listener();
        }
      }
    } catch {
      // closed by close()
    }
  }

  waitFor(label: string, test: (s: Snapshot) => boolean, ms = 3000): Promise<Snapshot> {
    return new Promise((resolve, reject) => {
      const check = (): void => {
        if (this.latest && test(this.latest)) {
          done();
          resolve(this.latest);
        }
      };
      const done = (): void => {
        clearTimeout(timer);
        this.listeners.delete(check);
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`timed out after ${ms} ms waiting for: ${label}`));
      }, ms);
      this.listeners.add(check);
      check();
    });
  }

  close(): void {
    this.abort.abort();
  }
}

afterEach(async () => {
  for (const stream of streams.splice(0)) stream.close();
  for (const jar of jars.splice(0)) {
    await jar.post("/api/pilot/leave", {}).catch(() => {});
  }
});

async function join(jar: Jar, airport: string): Promise<number> {
  const res = await jar.post("/api/pilot/join", { airport });
  expect(res.status).toBe(200);
  const { plane } = (await res.json()) as { plane: PlaneView };
  return plane.id;
}

async function takeOff(pilot: Jar, tower: Jar, airport: string): Promise<number> {
  const id = await join(pilot, airport);
  expect((await pilot.post("/api/pilot/request-takeoff", {})).status).toBe(200);
  expect((await tower.post("/api/tower/clear-takeoff", { id })).status).toBe(200);
  return id;
}

const plane = (s: Snapshot, id: number): PlaneView | undefined => s.planes.find((p) => p.id === id);
const sameSet = (pair: number[], a: number, b: number): boolean =>
  [...pair].sort().join() === [a, b].sort().join();
const km = (a: PlaneView, b: PlaneView): number => Math.hypot(a.x - b.x, a.y - b.y);
const publicId = (uid: string): string => createHash("sha256").update(uid).digest("hex").slice(0, 8);

it("refuses API calls and the stream without an identity cookie, and never mints one there", async () => {
  const json = { "content-type": "application/json" };
  const calls = await Promise.all([
    fetch(new URL("/api/pilot/join", baseUrl), {
      method: "POST",
      headers: json,
      body: JSON.stringify({ airport: "BEL" }),
    }),
    fetch(new URL("/api/tower/deny", baseUrl), {
      method: "POST",
      headers: json,
      body: JSON.stringify({ id: 1 }),
    }),
    fetch(new URL("/api/stream?role=tower", baseUrl)),
  ]);
  for (const res of calls) {
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    await res.body?.cancel();
  }
});

it("page renders mint a distinct identity cookie per visitor", async () => {
  const a = await Jar.create("/");
  const b = await Jar.create("/");
  const t = await Jar.create("/tower");
  expect(new Set([a.cookie, b.cookie, t.cookie]).size).toBe(3);
});

it("rejects malformed, non-JSON and over-broad bodies before touching state", async () => {
  const jar = await Jar.create();

  const notJson = await jar.fetch("/api/pilot/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  });
  expect(notJson.status).toBe(400);

  // Astro's own origin check refuses form-type bodies (text/plain among them)
  // with a 403 before our route runs; any other non-JSON type reaches our 415.
  const formType = await jar.fetch("/api/pilot/join", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ airport: "BEL" }),
  });
  expect(formType.status).toBe(403);

  const otherType = await jar.fetch("/api/pilot/join", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: JSON.stringify({ airport: "BEL" }),
  });
  expect(otherType.status).toBe(415);

  expect((await jar.post("/api/pilot/join", {})).status).toBe(400);
  expect((await jar.post("/api/pilot/join", { airport: "XYZ" })).status).toBe(400);
  expect((await jar.post("/api/pilot/join", { airport: "BEL'; DROP TABLE planes;--" })).status).toBe(400);

  // a client may only ever say how to steer, never where the plane is
  expect((await jar.post("/api/pilot/steer", {})).status).toBe(400);
  expect((await jar.post("/api/pilot/steer", { turn: 90 })).status).toBe(400);
  expect((await jar.post("/api/pilot/steer", { turn: 1, x: 5 })).status).toBe(400);
  expect((await jar.post("/api/pilot/steer", { turn: 1, y: 5 })).status).toBe(400);
  expect((await jar.post("/api/pilot/request-takeoff", { x: 1 })).status).toBe(400);
  expect((await jar.post("/api/tower/advise", { id: 1, phrase: "drop everything" })).status).toBe(400);
});

it("joining twice returns the same plane, and a cookie only ever has one", async () => {
  const tower = await Jar.create("/tower");
  const pilot = await Jar.create();
  const towerStream = await Stream.open(tower, "tower");

  const first = await join(pilot, "BEL");
  const second = await join(pilot, "MAJ");
  expect(second).toBe(first);

  const snap = await towerStream.waitFor("the plane to appear", (s) => !!plane(s, first));
  expect(snap.planes.filter((p) => p.id === first)).toHaveLength(1);
  expect(plane(snap, first)?.airport).toBe("BEL");
});

it("public ids are a hash of the cookie, never a prefix of the secret", async () => {
  const tower = await Jar.create("/tower");
  const pilot = await Jar.create();
  const towerStream = await Stream.open(tower, "tower");

  await join(pilot, "WOD");
  const snap = await towerStream.waitFor(
    "the join event",
    (s) => !!s.events?.some((e) => e.kind === "join" && e.actor === publicId(pilot.uid)),
  );
  for (const jar of [pilot, tower]) {
    expect(snap.events?.some((e) => e.actor === jar.uid.slice(0, 8))).toBe(false);
  }
});

it("the tower can't act on its own plane, and the refusal changes nothing", async () => {
  const other = await Jar.create("/tower");
  const pilot = await Jar.create();
  const otherStream = await Stream.open(other, "tower");

  const id = await join(pilot, "GUN");
  expect((await pilot.post("/api/pilot/request-takeoff", {})).status).toBe(200);

  expect((await pilot.post("/api/tower/clear-takeoff", { id })).status).toBe(403);
  expect((await pilot.post("/api/tower/deny", { id })).status).toBe(403);
  expect((await pilot.post("/api/tower/advise", { id, phrase: "expedite" })).status).toBe(403);
  await otherStream.waitFor("still waiting after the refusals", (s) => plane(s, id)?.status === "REQ_TAKEOFF");

  expect((await other.post("/api/tower/clear-takeoff", { id })).status).toBe(200);
  await otherStream.waitFor("cleared by someone else", (s) => plane(s, id)?.status === "AIRBORNE");
});

it("steering moves only your own plane", async () => {
  const tower = await Jar.create("/tower");
  const a = await Jar.create();
  const b = await Jar.create();
  const towerStream = await Stream.open(tower, "tower");

  const idA = await takeOff(a, tower, "BEL");
  const idB = await takeOff(b, tower, "BEL");
  const before = await towerStream.waitFor(
    "both airborne",
    (s) => plane(s, idA)?.status === "AIRBORNE" && plane(s, idB)?.status === "AIRBORNE",
  );
  const headingA = plane(before, idA)!.heading;
  const headingB = plane(before, idB)!.heading;

  // naming another plane isn't a field the steer endpoint has
  expect((await a.post("/api/pilot/steer", { turn: 1, id: idB })).status).toBe(400);

  const steered = await a.post("/api/pilot/steer", { turn: 1 });
  expect(steered.status).toBe(200);
  const { plane: mine } = (await steered.json()) as { plane: PlaneView };
  expect(mine.id).toBe(idA);
  expect(mine.heading).toBe((headingA + 15) % 360);

  const after = await towerStream.waitFor("A's new heading", (s) => plane(s, idA)?.heading === mine.heading);
  expect(plane(after, idB)?.heading).toBe(headingB);
});

it("steering is bounded: speed stops at its first and last step", async () => {
  const tower = await Jar.create("/tower");
  const pilot = await Jar.create();
  await takeOff(pilot, tower, "WOD");

  const steer = async (speed: -1 | 1): Promise<number> => {
    const res = await pilot.post("/api/pilot/steer", { speed });
    expect(res.status).toBe(200);
    return ((await res.json()) as { plane: PlaneView }).plane.speed;
  };

  for (let i = 0; i < 3; i++) await steer(-1);
  const slowest = await steer(-1);
  expect(slowest).toBeGreaterThan(0);
  expect(await steer(-1)).toBe(slowest);

  for (let i = 0; i < 2; i++) await steer(1);
  const fastest = await steer(1);
  expect(fastest).toBeGreaterThan(slowest);
  expect(await steer(1)).toBe(fastest);
});

it("a burst of steering from one cookie is rate limited", async () => {
  const jar = await Jar.create();
  const results = await Promise.all(
    Array.from({ length: 40 }, () => jar.post("/api/pilot/steer", { turn: 1 })),
  );
  const statuses = results.map((res) => res.status);
  expect(statuses).toContain(429);
  expect(statuses.every((s) => [404, 409, 429].includes(s))).toBe(true);
});

it("a pilot sees planes within 5 km and nothing beyond; the tower sees everything", async () => {
  const tower = await Jar.create("/tower");
  const a = await Jar.create();
  const b = await Jar.create();
  const c = await Jar.create();

  const idB = await join(b, "MAJ");
  const idA = await join(a, "BEL");
  const idC = await join(c, "BEL");

  const pilotStream = await Stream.open(a, "pilot");
  const towerStream = await Stream.open(tower, "tower");

  const mine = await pilotStream.waitFor("A to see C beside it", (s) => !!plane(s, idC));
  expect(mine.me?.id).toBe(idA);
  expect(plane(mine, idB)).toBeUndefined();

  const all = await towerStream.waitFor(
    "the tower to see all three",
    (s) => !!plane(s, idA) && !!plane(s, idB) && !!plane(s, idC),
  );
  expect(km(plane(all, idA)!, plane(all, idB)!)).toBeGreaterThan(5);
});

it("two planes airborne together raise a conflict that reaches both pilots and the tower", async () => {
  const tower = await Jar.create("/tower");
  const a = await Jar.create();
  const c = await Jar.create();
  const streamA = await Stream.open(a, "pilot");
  const streamC = await Stream.open(c, "pilot");
  const towerStream = await Stream.open(tower, "tower");

  const idA = await takeOff(a, tower, "BEL");
  const idC = await takeOff(c, tower, "BEL");

  for (const [who, stream] of [["A", streamA], ["C", streamC], ["the tower", towerStream]] as const) {
    await stream.waitFor(`${who} to see the conflict`, (s) =>
      s.conflicts.some((pair) => sameSet(pair, idA, idC)),
    );
  }
});

it("a runway serves one plane at a time: two racing landing clearances, exactly one wins", async () => {
  const towerOne = await Jar.create("/tower");
  const towerTwo = await Jar.create("/tower");
  const a = await Jar.create();
  const b = await Jar.create();
  const towerStream = await Stream.open(towerOne, "tower");

  const idA = await takeOff(a, towerOne, "BEL");
  const idB = await takeOff(b, towerOne, "BEL");
  expect((await a.post("/api/pilot/request-landing", { airport: "MAJ" })).status).toBe(200);
  expect((await b.post("/api/pilot/request-landing", { airport: "MAJ" })).status).toBe(200);

  const [clearA, clearB] = await Promise.all([
    towerOne.post("/api/tower/clear-landing", { id: idA }),
    towerTwo.post("/api/tower/clear-landing", { id: idB }),
  ]);
  expect([clearA.status, clearB.status].sort()).toEqual([200, 409]);

  const [winner, loser] = clearA.status === 200 ? [idA, clearB] : [idB, clearA];
  expect(await loser.json()).toMatchObject({ reason: "runway-busy" });
  await towerStream.waitFor("the runway to show its holder", (s) => s.runways.MAJ === winner);
});

it("a busy runway shows live to a pilot who hasn't asked yet, and blocks takeoff until it frees", async () => {
  const tower = await Jar.create("/tower");
  const lander = await Jar.create();
  const waiting = await Jar.create();

  const landerId = await takeOff(lander, tower, "BEL");
  expect((await lander.post("/api/pilot/request-landing", { airport: "MAJ" })).status).toBe(200);
  const waitingId = await join(waiting, "MAJ");
  const waitingStream = await Stream.open(waiting, "pilot");
  await waitingStream.waitFor("the runway to start free", (s) => s.runways.MAJ === null);

  expect((await tower.post("/api/tower/clear-landing", { id: landerId })).status).toBe(200);
  await waitingStream.waitFor("MAJ to show busy", (s) => s.runways.MAJ === landerId, 1000);

  expect((await waiting.post("/api/pilot/request-takeoff", {})).status).toBe(200);
  const blocked = await tower.post("/api/tower/clear-takeoff", { id: waitingId });
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toMatchObject({ reason: "runway-busy" });

  expect((await lander.post("/api/pilot/leave", {})).status).toBe(200);
  await waitingStream.waitFor("MAJ to show free again", (s) => s.runways.MAJ === null, 1000);
  expect((await tower.post("/api/tower/clear-takeoff", { id: waitingId })).status).toBe(200);
});

it("a steer reaches another screen in under a second", async () => {
  const tower = await Jar.create("/tower");
  const pilot = await Jar.create();
  const towerStream = await Stream.open(tower, "tower");

  const id = await takeOff(pilot, tower, "GUN");
  const before = await towerStream.waitFor("airborne", (s) => plane(s, id)?.status === "AIRBORNE");
  const expected = (plane(before, id)!.heading + 15) % 360;

  const started = performance.now();
  expect((await pilot.post("/api/pilot/steer", { turn: 1 })).status).toBe(200);
  await towerStream.waitFor("the new heading", (s) => plane(s, id)?.heading === expected, 1000);
  console.log(`steer-to-seen: ${Math.round(performance.now() - started)} ms`);
});

it("the sky has a cap: joins are refused once it's full", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 30; i++) {
    const jar = await Jar.create();
    statuses.push((await jar.post("/api/pilot/join", { airport: "BEL" })).status);
  }
  expect(statuses).toContain(503);
  expect(statuses.every((s) => s === 200 || s === 503)).toBe(true);
});
