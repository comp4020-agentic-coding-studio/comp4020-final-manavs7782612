import { SPEEDS, VIEW_RADIUS_KM } from "./airports";
import { readEvents, readWorld, type EventView, type PlaneView, type World } from "./db";
import { distance } from "./geometry";
import { metrics } from "./metrics";
import { connect, disconnect } from "./presence";

export type StreamRole = "pilot" | "tower";

export interface Client {
  controller: ReadableStreamDefaultController<Uint8Array>;
  uid: string;
  role: StreamRole;
}

export const MAX_STREAMS = 40;
export const MAX_STREAMS_PER_COOKIE = 3;
// a client that lets this many chunks pile up has stopped reading: drop it
export const STREAM_BUFFER = 16;

// One in-memory set of open SSE streams, on globalThis so a dev reload can't
// create a second one. Enough because fly.toml pins this app to a single
// machine; a second process would need a shared broadcaster.
const g = globalThis as unknown as { __atcClients?: Set<Client>; __atcVersion?: number };
const clients = (g.__atcClients ??= new Set<Client>());
const encoder = new TextEncoder();

export const streamCount = (): number => clients.size;

export function streamsFor(uid: string): number {
  let n = 0;
  for (const c of clients) if (c.uid === uid) n++;
  return n;
}

export function subscribe(client: Client): void {
  clients.add(client);
  connect(client.uid);
}

// Idempotent: cancel(), an abort and a failed enqueue can all land here.
export function unsubscribe(client: Client): void {
  if (!clients.delete(client)) return;
  disconnect(client.uid);
}

function drop(client: Client): void {
  unsubscribe(client);
  try {
    client.controller.close();
  } catch {
    // already closed
  }
}

function towerMetrics(): Record<string, unknown> {
  let pilot = 0;
  let tower = 0;
  for (const c of clients) {
    if (c.role === "tower") tower++;
    else pilot++;
  }
  const hz = metrics.hz > 0 ? metrics.hz : 4;
  return {
    hz: Math.round(metrics.hz * 10) / 10,
    tickMs: Math.round(metrics.tickMs * 100) / 100,
    worstTickMs: Math.round(metrics.worstTickMs * 100) / 100,
    // how far the fastest plane moves between two broadcasts: the "how stale
    // can my picture be" number behind the 4 Hz choice
    stalenessKm: Math.round((SPEEDS[SPEEDS.length - 1] / hz) * 1000) / 1000,
    clients: { pilot, tower },
    denials: metrics.denials,
  };
}

// A pilot only ever gets their own plane and the planes within VIEW_RADIUS_KM
// of it, filtered here on the server. This is a game rule (the tower stream is
// public), not access control; the README says so.
function snapshotFor(
  client: Client,
  world: World,
  version: number,
  events: EventView[],
): Record<string, unknown> {
  const me = world.byOwner.get(client.uid) ?? null;
  const base = { version, serverNow: Date.now(), me, runways: world.runways };

  if (client.role === "tower") {
    return { ...base, planes: world.planes, conflicts: world.conflicts, events, metrics: towerMetrics() };
  }

  const near: PlaneView[] = me
    ? world.planes.filter((p) => p.id === me.id || distance(p, me) <= VIEW_RADIUS_KM)
    : [];
  const visible = new Set(near.map((p) => p.id));
  return {
    ...base,
    planes: near,
    conflicts: world.conflicts.filter(([a, b]) => visible.has(a) && visible.has(b)),
  };
}

function send(client: Client, world: World, version: number, events: EventView[]): void {
  const size = client.controller.desiredSize;
  if (size !== null && size <= 0) {
    drop(client);
    return;
  }
  try {
    const data = JSON.stringify(snapshotFor(client, world, version, events));
    client.controller.enqueue(encoder.encode(`event: snapshot\ndata: ${data}\n\n`));
  } catch {
    drop(client);
  }
}

// The one fan-out path for shared state. Called after a commit, never before.
export function broadcast(): void {
  if (clients.size === 0) return;
  const world = readWorld();
  const version = (g.__atcVersion = (g.__atcVersion ?? 0) + 1);
  const events = [...clients].some((c) => c.role === "tower") ? readEvents(20) : [];
  for (const client of [...clients]) send(client, world, version, events);
}

// A full snapshot for one client the moment it connects, so a reconnect after
// a Fly wake gets fresh state immediately.
export function sendInitial(client: Client): void {
  const version = (g.__atcVersion = (g.__atcVersion ?? 0) + 1);
  send(client, readWorld(), version, client.role === "tower" ? readEvents(20) : []);
}

// SSE comment line: keeps an idle stream from being cut by Fly's proxy.
export function heartbeat(): void {
  const chunk = encoder.encode(": hb\n\n");
  for (const client of [...clients]) {
    try {
      client.controller.enqueue(chunk);
    } catch {
      drop(client);
    }
  }
}
