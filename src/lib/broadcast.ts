import type { Session } from "./identity";
import { listDocks, listDrivers, listSlots, readEvents, type DriverRow, type EventView, type SlotRow } from "./db";

export type StreamRole = "dispatcher" | "driver" | "consumer";

export interface Client {
  controller: ReadableStreamDefaultController<Uint8Array>;
  session: Session | null; // null only for role === "consumer"
  role: StreamRole;
}

export const MAX_STREAMS = 60;
export const MAX_STREAMS_PER_SESSION = 3;
// a client that lets this many chunks pile up has stopped reading: drop it
export const STREAM_BUFFER = 16;

// One in-memory set of open SSE streams, on globalThis so a dev reload can't
// create a second one. Enough because fly.toml pins this app to a single
// machine; a second machine would need a shared broadcaster.
const g = globalThis as unknown as { __slotlockClients?: Set<Client>; __slotlockVersion?: number };
const clients = (g.__slotlockClients ??= new Set<Client>());
const encoder = new TextEncoder();

export const streamCount = (): number => clients.size;

export function streamsFor(session: Session | null): number {
  if (!session) return 0;
  let n = 0;
  for (const c of clients) if (c.session?.personId === session.personId && c.session.role === session.role) n++;
  return n;
}

export function subscribe(client: Client): void {
  clients.add(client);
}

export function unsubscribe(client: Client): void {
  clients.delete(client);
}

function drop(client: Client): void {
  unsubscribe(client);
  try {
    client.controller.close();
  } catch {
    // already closed
  }
}

interface Board {
  docks: { id: number; name: string }[];
  slots: SlotRow[];
  drivers: DriverRow[];
}

function readBoard(): Board {
  return { docks: listDocks(), slots: listSlots(), drivers: listDrivers() };
}

// Fill status only, no names: what the public dock view is allowed to see.
function dockSummary(board: Board): { dockId: number; name: string; openCount: number; lockedCount: number; completedCount: number }[] {
  return board.docks.map((dock) => {
    const here = board.slots.filter((s) => s.dock_id === dock.id);
    return {
      dockId: dock.id,
      name: dock.name,
      openCount: here.filter((s) => s.status === "open").length,
      lockedCount: here.filter((s) => s.status === "locked").length,
      completedCount: here.filter((s) => s.status === "completed").length,
    };
  });
}

function driverSlotsFor(board: Board, driverId: number): SlotRow[] {
  return board.slots.filter((s) => s.driver_id === driverId);
}

function openSlotsCompliantFor(board: Board, driverId: number): SlotRow[] {
  const driver = board.drivers.find((d) => d.id === driverId);
  if (!driver) return [];
  return board.slots.filter(
    (s) => s.status === "open" && (s.duration_min + s.transit_buffer_min) / 60 <= driver.hours_remaining,
  );
}

function snapshotFor(client: Client, board: Board, version: number, events: EventView[]): Record<string, unknown> {
  const base = { version, serverNow: Date.now() };

  if (client.role === "dispatcher") {
    return { ...base, docks: board.docks, slots: board.slots, drivers: board.drivers, events };
  }
  if (client.role === "driver") {
    const driverId = client.session!.personId;
    return {
      ...base,
      mySlots: driverSlotsFor(board, driverId),
      openCompliant: openSlotsCompliantFor(board, driverId),
    };
  }
  // consumer: public, anonymous, fill status only
  return { ...base, docks: dockSummary(board) };
}

function send(client: Client, board: Board, version: number, events: EventView[]): void {
  const size = client.controller.desiredSize;
  if (size !== null && size <= 0) {
    drop(client);
    return;
  }
  try {
    const data = JSON.stringify(snapshotFor(client, board, version, events));
    client.controller.enqueue(encoder.encode(`event: snapshot\ndata: ${data}\n\n`));
  } catch {
    drop(client);
  }
}

// The one fan-out path for shared state. Called after a commit, never before.
export function broadcast(): void {
  if (clients.size === 0) return;
  const board = readBoard();
  const version = (g.__slotlockVersion = (g.__slotlockVersion ?? 0) + 1);
  const events = [...clients].some((c) => c.role === "dispatcher") ? readEvents(50) : [];
  for (const client of [...clients]) send(client, board, version, events);
}

// A full snapshot for one client the moment it connects, so a reconnect
// after a Fly wake gets fresh state immediately.
export function sendInitial(client: Client): void {
  const version = (g.__slotlockVersion = (g.__slotlockVersion ?? 0) + 1);
  send(client, readBoard(), version, client.role === "dispatcher" ? readEvents(50) : []);
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

let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
export function ensureHeartbeat(): void {
  const h = g as unknown as { __slotlockHeartbeat?: ReturnType<typeof setInterval> };
  if (h.__slotlockHeartbeat) return;
  heartbeatInterval = setInterval(heartbeat, 25_000);
  heartbeatInterval.unref();
  h.__slotlockHeartbeat = heartbeatInterval;
}
