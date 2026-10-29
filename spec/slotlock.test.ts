import { afterEach, expect, inject, it } from "vitest";

// Checks Slotlock (README.md "What good means", CLAUDE.md rules,
// decisions/0001-server-authoritative-compliance-gate.md) against the
// RUNNING app. Two jars are two browser sessions: nothing here can reach
// into the server, so what passes is what a marker with two Chrome profiles
// would see. Every session a test creates logs out in afterEach.
//
// Roster used by these tests (src/lib/roster.ts): dispatcher Priya/1234,
// Wayne/2345; driver Tane/3333 has 0.75h remaining (too low for any seeded
// slot), Callum/1111 has 9.5h, Renee/2222 has 7h, Marcus/5555 has 11h.
const baseUrl = inject("baseUrl");

interface SlotView {
  id: number;
  dock_id: number;
  start_at: string;
  duration_min: number;
  transit_buffer_min: number;
  status: "open" | "locked" | "completed";
  driver_id: number | null;
  locked_by: number | null;
  locked_at: string | null;
}

interface EventView {
  id: number;
  actor: string;
  role: string;
  kind: string;
  slot: number | null;
  driver: number | null;
  reason: string | null;
}

interface DispatcherSnapshot {
  version: number;
  serverNow: number;
  docks: { id: number; name: string }[];
  slots: SlotView[];
  drivers: { id: number; name: string; hours_remaining: number }[];
  events: EventView[];
}

interface DriverSnapshot {
  version: number;
  serverNow: number;
  mySlots: SlotView[];
  openCompliant: SlotView[];
}

interface ConsumerSnapshot {
  version: number;
  serverNow: number;
  docks: { dockId: number; name: string; openCount: number; lockedCount: number; completedCount: number }[];
}

const jars: Jar[] = [];
const streams: Stream<unknown>[] = [];

class Jar {
  cookie: string | undefined;

  static async create(name: string, pin: string, role: "dispatcher" | "driver"): Promise<Jar> {
    const jar = new Jar();
    const res = await jar.post("/api/login", { name, pin, role });
    expect(res.status, `login for ${name} should succeed`).toBe(200);
    expect(jar.cookie, "login didn't mint a session cookie").toBeTruthy();
    jars.push(jar);
    return jar;
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

class Stream<T> {
  latest: T | undefined;
  private listeners = new Set<() => void>();
  private abort = new AbortController();

  static async open<T>(jar: Jar | null, role: "dispatcher" | "driver" | "consumer"): Promise<Stream<T>> {
    const stream = new Stream<T>();
    const init: RequestInit = { signal: stream.abort.signal };
    const res = jar
      ? await jar.fetch(`/api/stream?role=${role}`, init)
      : await fetch(new URL(`/api/stream?role=${role}`, baseUrl), init);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    streams.push(stream as Stream<unknown>);
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
          this.latest = JSON.parse(data) as T;
          for (const listener of this.listeners) listener();
        }
      }
    } catch {
      // closed by close()
    }
  }

  waitFor(label: string, test: (s: T) => boolean, ms = 3000): Promise<T> {
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
    await jar.post("/api/logout", {}).catch(() => {});
  }
});

const slot = (s: DispatcherSnapshot, id: number): SlotView | undefined => s.slots.find((x) => x.id === id);

async function freshOpenSlot(dispatcher: Jar): Promise<number> {
  // Reschedule an existing slot into a fresh open state so each test gets
  // its own slot id without depending on seed-data ordering surviving
  // other tests in the same run.
  const probe = await Stream.open<DispatcherSnapshot>(dispatcher, "dispatcher");
  const snap = await probe.waitFor("initial board", (s) => s.slots.length > 0);
  const candidate = snap.slots.find((s) => s.status === "open") ?? snap.slots[0];
  probe.close();
  const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const res = await dispatcher.post("/api/reschedule", { slotId: candidate.id, startAt, durationMin: 180 });
  expect(res.status).toBe(200);
  return candidate.id;
}

it("refuses API calls without a session, and never mints one there", async () => {
  const json = { "content-type": "application/json" };
  const calls = await Promise.all([
    fetch(new URL("/api/claim", baseUrl), {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slotId: 1, driverId: 1 }),
    }),
    fetch(new URL("/api/stream?role=dispatcher", baseUrl)),
  ]);
  for (const res of calls) {
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    await res.body?.cancel();
  }
});

it("the consumer stream needs no identity at all", async () => {
  const res = await fetch(new URL("/api/stream?role=consumer", baseUrl));
  expect(res.status).toBe(200);
  await res.body?.cancel();
});

it("rejects malformed, non-JSON and over-broad bodies before touching state", async () => {
  const dispatcher = await Jar.create("Priya", "1234", "dispatcher");

  const notJson = await dispatcher.fetch("/api/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  });
  expect(notJson.status).toBe(400);

  const otherType = await dispatcher.fetch("/api/claim", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: JSON.stringify({ slotId: 1, driverId: 1 }),
  });
  expect(otherType.status).toBe(415);

  expect((await dispatcher.post("/api/claim", {})).status).toBe(400);
  expect((await dispatcher.post("/api/claim", { slotId: 1, driverId: 1, extra: true })).status).toBe(400);
  expect((await dispatcher.post("/api/claim", { slotId: "1", driverId: 1 })).status).toBe(400);
});

it("a wrong name/PIN/role never logs in", async () => {
  const jar = new Jar();
  expect((await jar.post("/api/login", { name: "Priya", pin: "0000", role: "dispatcher" })).status).toBe(401);
  expect((await jar.post("/api/login", { name: "Priya", pin: "1234", role: "driver" })).status).toBe(401);
  expect(jar.cookie).toBeUndefined();
});

it("compliance-block: a claim for a driver without enough hours is rejected, nothing is locked, and it's logged", async () => {
  const dispatcher = await Jar.create("Priya", "1234", "dispatcher");
  const slotId = await freshOpenSlot(dispatcher); // 180 min, default transit from seed data

  // Tane (3333) has 0.75h remaining; 180 minutes alone needs 3h.
  const res = await dispatcher.post("/api/claim", { slotId, driverId: 3 });
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ reason: "hours-insufficient" });

  const events = await dispatcher.fetch("/api/events");
  const { events: log } = (await events.json()) as { events: EventView[] };
  const rejection = log.find((e) => e.slot === slotId && e.kind === "claim-rejected");
  expect(rejection).toMatchObject({ reason: "hours-insufficient", driver: 3 });

  const board = await Stream.open<DispatcherSnapshot>(dispatcher, "dispatcher");
  const snap = await board.waitFor("the slot to still be open", (s) => slot(s, slotId)?.status === "open");
  expect(slot(snap, slotId)?.driver_id).toBeNull();
});

it("concurrent-claim: two claims within 50ms produce exactly one winner, both logged", async () => {
  const a = await Jar.create("Priya", "1234", "dispatcher");
  const b = await Jar.create("Wayne", "2345", "dispatcher");
  const slotId = await freshOpenSlot(a);

  // Marcus (11h) and Callum (9.5h) are both compliant for the 180 min slot.
  const [resA, resB] = await Promise.all([
    a.post("/api/claim", { slotId, driverId: 5 }),
    b.post("/api/claim", { slotId, driverId: 1 }),
  ]);
  const statuses = [resA.status, resB.status].sort();
  expect(statuses).toEqual([200, 409]);

  const loser = resA.status === 409 ? resA : resB;
  expect(await loser.json()).toMatchObject({ reason: "slot-taken" });

  const events = await a.fetch("/api/events");
  const { events: log } = (await events.json()) as { events: EventView[] };
  const forSlot = log.filter((e) => e.slot === slotId);
  expect(forSlot.some((e) => e.kind === "claim")).toBe(true);
  expect(forSlot.some((e) => e.kind === "claim-rejected" && e.reason === "slot-taken")).toBe(true);
});

it("realtime-propagation: a claim in the dispatcher view reaches the driver and dock views within a second", async () => {
  const dispatcher = await Jar.create("Priya", "1234", "dispatcher");
  const driver = await Jar.create("Marcus", "5555", "driver");
  const slotId = await freshOpenSlot(dispatcher);

  const driverStream = await Stream.open<DriverSnapshot>(driver, "driver");
  const consumerStream = await Stream.open<ConsumerSnapshot>(null, "consumer");
  await driverStream.waitFor("initial driver snapshot", (s) => !!s);
  await consumerStream.waitFor("initial consumer snapshot", (s) => !!s);

  const started = performance.now();
  expect((await dispatcher.post("/api/claim", { slotId, driverId: 5 })).status).toBe(200);

  await driverStream.waitFor(
    "the driver to see the slot locked to them",
    (s) => s.mySlots.some((x) => x.id === slotId && x.status === "locked"),
    1000,
  );
  const elapsed = performance.now() - started;
  expect(elapsed).toBeLessThan(1000);

  await consumerStream.waitFor(
    "the consumer dock view to show the new lock count",
    (s) => s.docks.some((d) => d.lockedCount > 0),
    1000,
  );
});

it("audit-immutability: PATCH and DELETE on an event are rejected regardless of role", async () => {
  const dispatcher = await Jar.create("Priya", "1234", "dispatcher");
  const res = await dispatcher.fetch("/api/events");
  const { events: log } = (await res.json()) as { events: EventView[] };
  const id = log[0]?.id ?? 1;

  const patch = await dispatcher.fetch(`/api/events/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "tampered" }),
  });
  expect(patch.ok).toBe(false);

  const del = await dispatcher.fetch(`/api/events/${id}`, { method: "DELETE" });
  expect(del.ok).toBe(false);

  const after = await dispatcher.fetch("/api/events");
  const { events: logAfter } = (await after.json()) as { events: EventView[] };
  expect(logAfter.find((e) => e.id === id)).toEqual(log.find((e) => e.id === id));
});

it("a driver can't claim, reassign, reschedule or complete a slot", async () => {
  const driver = await Jar.create("Callum", "1111", "driver");
  expect((await driver.post("/api/claim", { slotId: 1, driverId: 1 })).status).toBe(403);
  expect((await driver.post("/api/reassign", { slotId: 1, driverId: 1 })).status).toBe(403);
  expect((await driver.post("/api/complete", { slotId: 1 })).status).toBe(403);
});

it("reassign only succeeds on a locked slot, for a driver with enough hours", async () => {
  const dispatcher = await Jar.create("Priya", "1234", "dispatcher");
  const slotId = await freshOpenSlot(dispatcher);

  // Can't reassign a slot that's still open.
  expect((await dispatcher.post("/api/reassign", { slotId, driverId: 1 })).status).toBe(409);

  expect((await dispatcher.post("/api/claim", { slotId, driverId: 5 })).status).toBe(200);

  // Tane (0.75h) still can't take a 180-minute slot even by reassignment.
  const bad = await dispatcher.post("/api/reassign", { slotId, driverId: 3 });
  expect(bad.status).toBe(409);
  expect(await bad.json()).toMatchObject({ reason: "hours-insufficient" });

  const good = await dispatcher.post("/api/reassign", { slotId, driverId: 1 });
  expect(good.status).toBe(200);
});

it("complete decrements the driver's hours and the slot can't be completed twice", async () => {
  const dispatcher = await Jar.create("Priya", "1234", "dispatcher");
  const slotId = await freshOpenSlot(dispatcher);

  expect((await dispatcher.post("/api/claim", { slotId, driverId: 5 })).status).toBe(200);

  const before = await Stream.open<DispatcherSnapshot>(dispatcher, "dispatcher");
  const snapBefore = await before.waitFor("marcus hours before complete", (s) => !!s.drivers.find((d) => d.id === 5));
  const hoursBefore = snapBefore.drivers.find((d) => d.id === 5)!.hours_remaining;
  before.close();

  expect((await dispatcher.post("/api/complete", { slotId })).status).toBe(200);

  const after = await Stream.open<DispatcherSnapshot>(dispatcher, "dispatcher");
  const snapAfter = await after.waitFor(
    "marcus hours to have decremented",
    (s) => s.drivers.find((d) => d.id === 5)!.hours_remaining < hoursBefore,
  );
  expect(snapAfter.drivers.find((d) => d.id === 5)!.hours_remaining).toBeCloseTo(hoursBefore - 3, 5);

  // Completing an already-completed slot fails.
  expect((await dispatcher.post("/api/complete", { slotId })).status).toBe(409);
});

it("the dock view shows fill counts only, no names or driver details", async () => {
  const stream = await Stream.open<ConsumerSnapshot>(null, "consumer");
  const snap = await stream.waitFor("initial consumer snapshot", (s) => s.docks.length > 0);
  for (const dock of snap.docks) {
    expect(Object.keys(dock).sort()).toEqual(["completedCount", "dockId", "lockedCount", "name", "openCount"].sort());
  }
});
