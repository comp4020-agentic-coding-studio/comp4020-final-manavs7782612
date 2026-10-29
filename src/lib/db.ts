import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DISPATCHERS, DOCKS, DRIVERS } from "./roster";
import { logEvent } from "./log";

// fly.toml mounts the volume at /data; the Dockerfile sets DB_PATH there.
// Locally this falls back to a gitignored file instead.
const DB_PATH = process.env.DB_PATH ?? "./data/slotlock.db";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    hours_remaining REAL NOT NULL CHECK (hours_remaining >= 0)
  );
  CREATE TABLE IF NOT EXISTS docks (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dock_id INTEGER NOT NULL REFERENCES docks(id),
    start_at TEXT NOT NULL,
    duration_min INTEGER NOT NULL CHECK (duration_min > 0),
    transit_buffer_min INTEGER NOT NULL DEFAULT 0 CHECK (transit_buffer_min >= 0),
    status TEXT NOT NULL CHECK (status IN ('open','locked','completed')),
    driver_id INTEGER REFERENCES drivers(id),
    locked_by INTEGER REFERENCES drivers(id), -- the dispatcher id who holds the claim
    locked_at TEXT,
    CHECK ((status = 'open') = (driver_id IS NULL AND locked_by IS NULL))
  );
  -- Append-only. No application code path ever issues UPDATE or DELETE
  -- against this table; see CLAUDE.md rule 4.
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    role TEXT NOT NULL,
    kind TEXT NOT NULL,
    slot_id INTEGER,
    driver_id INTEGER,
    reason TEXT,
    detail TEXT,
    at TEXT NOT NULL
  );
`;

interface Shared {
  db: DatabaseSync;
  inTx: boolean;
  pending: Record<string, unknown>[];
}

// One handle for the whole process, kept on globalThis so a dev reload
// can't open a second one (two handles would make BEGIN IMMEDIATE
// genuinely contend).
const g = globalThis as unknown as { __slotlock?: Shared };

function seed(db: DatabaseSync): void {
  const insertDock = db.prepare("INSERT OR IGNORE INTO docks (id, name) VALUES (?, ?)");
  for (const dock of DOCKS) insertDock.run(dock.id, dock.name);

  const insertDriver = db.prepare(
    "INSERT OR IGNORE INTO drivers (id, name, hours_remaining) VALUES (?, ?, ?)",
  );
  for (const driver of DRIVERS) insertDriver.run(driver.id, driver.name, driver.hoursRemaining);

  const countStmt = db.prepare("SELECT COUNT(*) AS n FROM slots");
  const { n } = countStmt.get() as unknown as { n: number };
  if (n > 0) return;

  // A handful of open slots across the next two days, spread across docks,
  // so the board has something to claim on first run.
  const insertSlot = db.prepare(`
    INSERT INTO slots (dock_id, start_at, duration_min, transit_buffer_min, status)
    VALUES (?, ?, ?, ?, 'open')
  `);
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const plan: [number, number, number, number][] = [
    [1, 2, 60, 30],
    [1, 6, 90, 30],
    [2, 3, 120, 45],
    [2, 9, 60, 30],
    [3, 4, 180, 60],
    [3, 8, 60, 15],
  ];
  for (const [dockId, hoursFromNow, durationMin, transitMin] of plan) {
    insertSlot.run(dockId, new Date(now + hoursFromNow * hour).toISOString(), durationMin, transitMin);
  }
}

function open(): Shared {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 2000;");
  db.exec(SCHEMA);
  seed(db);
  return { db, inTx: false, pending: [] };
}

const shared = (g.__slotlock ??= open());
export const db = shared.db;

// The only way anything writes. BEGIN IMMEDIATE, roll back on any throw, no
// await inside (so nothing else can run mid-transaction), and refuse to
// nest. Events are written to stdout only after COMMIT, so the log never
// describes something that was rolled back.
export function tx<T>(fn: () => T): T {
  if (shared.inTx) throw new Error("tx() re-entered");
  shared.inTx = true;
  shared.pending = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    if (result instanceof Promise) throw new Error("tx() callbacks must be synchronous");
    db.exec("COMMIT");
    for (const line of shared.pending) logEvent(line);
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // the connection was already out of the transaction
    }
    throw err;
  } finally {
    shared.pending = [];
    shared.inTx = false;
  }
}

const insertEvent = db.prepare(`
  INSERT INTO events (actor, role, kind, slot_id, driver_id, reason, detail, at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export type ActorRole = "dispatcher" | "driver" | "system";

// Call inside tx(). Persists the event and queues its stdout line. Every
// claim, reassignment, reschedule, completion and rejection goes through
// this, success or failure alike (CLAUDE.md rule 4).
export function addEvent(
  actor: string,
  role: ActorRole,
  kind: string,
  slotId: number | null,
  driverId: number | null,
  reason: string | null = null,
  detail: string | null = null,
): void {
  const at = new Date().toISOString();
  insertEvent.run(actor, role, kind, slotId, driverId, reason, detail, at);
  shared.pending.push({ at, actor, role, kind, slot: slotId, driver: driverId, reason, detail });
}

export type SlotStatus = "open" | "locked" | "completed";

export interface SlotRow {
  id: number;
  dock_id: number;
  start_at: string;
  duration_min: number;
  transit_buffer_min: number;
  status: SlotStatus;
  driver_id: number | null;
  locked_by: number | null;
  locked_at: string | null;
}

export interface DriverRow {
  id: number;
  name: string;
  hours_remaining: number;
}

const SLOT_COLS =
  "id, dock_id, start_at, duration_min, transit_buffer_min, status, driver_id, locked_by, locked_at";
const slotByIdStmt = db.prepare(`SELECT ${SLOT_COLS} FROM slots WHERE id = ?`);
const allSlotsStmt = db.prepare(`SELECT ${SLOT_COLS} FROM slots ORDER BY start_at`);
const driverByIdStmt = db.prepare("SELECT id, name, hours_remaining FROM drivers WHERE id = ?");
const allDriversStmt = db.prepare("SELECT id, name, hours_remaining FROM drivers ORDER BY name");
const allDocksStmt = db.prepare("SELECT id, name FROM docks ORDER BY id");

export const getSlot = (id: number): SlotRow | undefined =>
  slotByIdStmt.get(id) as unknown as SlotRow | undefined;
export const getDriver = (id: number): DriverRow | undefined =>
  driverByIdStmt.get(id) as unknown as DriverRow | undefined;
export const listSlots = (): SlotRow[] => allSlotsStmt.all() as unknown as SlotRow[];
export const listDrivers = (): DriverRow[] => allDriversStmt.all() as unknown as DriverRow[];
export const listDocks = (): { id: number; name: string }[] =>
  allDocksStmt.all() as unknown as { id: number; name: string }[];

export type Fail = { ok: false; status: 403 | 404 | 409; reason: string };
export type Done = { ok: true; slot: SlotRow };
export type Result<T = Done> = T | Fail;

const fail = (status: Fail["status"], reason: string): Fail => ({ ok: false, status, reason });

// A guarded UPDATE changed nothing; this only works out what to tell the
// caller. Never informs a decision the UPDATE already made.
function claimFailure(slotId: number, driverId: number): Fail {
  const slot = getSlot(slotId);
  if (!slot) return fail(404, "no-such-slot");
  if (slot.status !== "open") return fail(409, "slot-taken");
  const driver = getDriver(driverId);
  if (!driver) return fail(404, "no-such-driver");
  const neededHours = (slot.duration_min + slot.transit_buffer_min) / 60;
  if (driver.hours_remaining < neededHours) return fail(409, "hours-insufficient");
  return fail(409, "slot-taken"); // lost a race between the read above and the guarded UPDATE
}

// The one thing this app exists to guarantee: the hours check and the
// contention check are both conditions of this single UPDATE, inside one
// transaction. See decisions/0001-server-authoritative-compliance-gate.md.
const claimStmt = db.prepare(`
  UPDATE slots
  SET status = 'locked', driver_id = ?, locked_by = ?, locked_at = ?
  WHERE id = ?
    AND status = 'open'
    AND (? / 60.0) <= (SELECT hours_remaining FROM drivers WHERE id = ?)
`);

export function claimSlot(dispatcherId: number, slotId: number, driverId: number): Result {
  return tx(() => {
    const slot = getSlot(slotId);
    const neededMin = slot ? slot.duration_min + slot.transit_buffer_min : 0;
    const res = claimStmt.run(
      driverId,
      dispatcherId,
      new Date().toISOString(),
      slotId,
      neededMin,
      driverId,
    );
    if (Number(res.changes) !== 1) {
      const failure = claimFailure(slotId, driverId);
      addEvent(`dispatcher:${dispatcherId}`, "dispatcher", "claim-rejected", slotId, driverId, failure.reason);
      return failure;
    }
    addEvent(`dispatcher:${dispatcherId}`, "dispatcher", "claim", slotId, driverId);
    return { ok: true, slot: getSlot(slotId)! };
  });
}

// Compliant drivers for a slot, soonest-available-looking first (by hours
// remaining, most first — a proxy for "freshest" in this simplified model).
// This is a recommendation only; the dispatcher picks (CLAUDE.md rule 5).
export function compliantDrivers(slotId: number): DriverRow[] {
  const slot = getSlot(slotId);
  if (!slot) return [];
  const neededHours = (slot.duration_min + slot.transit_buffer_min) / 60;
  return listDrivers()
    .filter((d) => d.hours_remaining >= neededHours)
    .sort((a, b) => b.hours_remaining - a.hours_remaining);
}

const reassignStmt = db.prepare(`
  UPDATE slots
  SET driver_id = ?, locked_by = ?, locked_at = ?
  WHERE id = ?
    AND status = 'locked'
    AND (? / 60.0) <= (SELECT hours_remaining FROM drivers WHERE id = ?)
`);

export function reassignSlot(dispatcherId: number, slotId: number, newDriverId: number): Result {
  return tx(() => {
    const slot = getSlot(slotId);
    const neededMin = slot ? slot.duration_min + slot.transit_buffer_min : 0;
    const res = reassignStmt.run(
      newDriverId,
      dispatcherId,
      new Date().toISOString(),
      slotId,
      neededMin,
      newDriverId,
    );
    if (Number(res.changes) !== 1) {
      const current = getSlot(slotId);
      const reason = !current ? "no-such-slot" : current.status !== "locked" ? "wrong-state" : "hours-insufficient";
      addEvent(`dispatcher:${dispatcherId}`, "dispatcher", "reassign-rejected", slotId, newDriverId, reason);
      return fail(current ? 409 : 404, reason);
    }
    addEvent(`dispatcher:${dispatcherId}`, "dispatcher", "reassign", slotId, newDriverId);
    return { ok: true, slot: getSlot(slotId)! };
  });
}

const completeStmt = db.prepare(`
  UPDATE slots SET status = 'completed' WHERE id = ? AND status = 'locked'
`);
const decrementHoursStmt = db.prepare(`
  UPDATE drivers SET hours_remaining = hours_remaining - ? WHERE id = ?
`);

export function completeSlot(dispatcherId: number, slotId: number): Result {
  return tx(() => {
    const before = getSlot(slotId);
    const res = completeStmt.run(slotId);
    if (Number(res.changes) !== 1) {
      const reason = !before ? "no-such-slot" : "wrong-state";
      addEvent(`dispatcher:${dispatcherId}`, "dispatcher", "complete-rejected", slotId, before?.driver_id ?? null, reason);
      return fail(before ? 409 : 404, reason);
    }
    decrementHoursStmt.run(before!.duration_min / 60, before!.driver_id);
    addEvent(`dispatcher:${dispatcherId}`, "dispatcher", "complete", slotId, before!.driver_id);
    return { ok: true, slot: getSlot(slotId)! };
  });
}

// A business-timing judgment, not a compliance one: open the slot back up
// with no driver. Any status can be rescheduled (CLAUDE.md rule 6).
const rescheduleStmt = db.prepare(`
  UPDATE slots
  SET status = 'open', driver_id = NULL, locked_by = NULL, locked_at = NULL,
      start_at = ?, duration_min = ?
  WHERE id = ?
`);

export function rescheduleSlot(
  dispatcherId: number,
  slotId: number,
  startAt: string,
  durationMin: number,
): Result {
  return tx(() => {
    const before = getSlot(slotId);
    const res = rescheduleStmt.run(startAt, durationMin, slotId);
    if (Number(res.changes) !== 1) {
      addEvent(`dispatcher:${dispatcherId}`, "dispatcher", "reschedule-rejected", slotId, before?.driver_id ?? null, "no-such-slot");
      return fail(404, "no-such-slot");
    }
    addEvent(`dispatcher:${dispatcherId}`, "dispatcher", "reschedule", slotId, before?.driver_id ?? null);
    return { ok: true, slot: getSlot(slotId)! };
  });
}

const recentEventsStmt = db.prepare(
  "SELECT id, at, actor, role, kind, slot_id, driver_id, reason, detail FROM events ORDER BY id DESC LIMIT ?",
);

export interface EventView {
  id: number;
  at: string;
  actor: string;
  role: string;
  kind: string;
  slot: number | null;
  driver: number | null;
  reason: string | null;
  detail: string | null;
}

export function readEvents(limit = 50): EventView[] {
  const rows = recentEventsStmt.all(limit) as unknown as {
    id: number;
    at: string;
    actor: string;
    role: string;
    kind: string;
    slot_id: number | null;
    driver_id: number | null;
    reason: string | null;
    detail: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor,
    role: r.role,
    kind: r.kind,
    slot: r.slot_id,
    driver: r.driver_id,
    reason: r.reason,
    detail: r.detail,
  }));
}
