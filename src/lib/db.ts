import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  AIRPORT_INFO,
  AIRPORTS,
  SPEEDS,
  START_SPEED_STEP,
  TURN_STEP,
  type Airport,
  type Phrase,
} from "./airports";
import { computeConflicts, type Status } from "./geometry";
import { publicId } from "./identity";
import { logEvent } from "./log";

export const MAX_PLANES = 24;
export const MAX_PLANES_PER_IP = 8;
export const EVENTS_KEEP = 2000;

// fly.toml mounts the volume at /data; the Dockerfile sets DB_PATH there.
// Locally this falls back to a gitignored file instead.
const DB_PATH = process.env.DB_PATH ?? "./data/atc.db";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS planes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL UNIQUE,
    ip_hash TEXT,
    status TEXT NOT NULL CHECK (status IN ('PARKED','REQ_TAKEOFF','AIRBORNE','REQ_LAND','CLEARED_LAND')),
    airport TEXT CHECK (airport IN ('BEL','WOD','GUN','MAJ')),
    target_airport TEXT CHECK (target_airport IN ('BEL','WOD','GUN','MAJ')),
    x REAL NOT NULL,
    y REAL NOT NULL,
    heading INTEGER NOT NULL CHECK (heading BETWEEN 0 AND 359),
    speed_step INTEGER NOT NULL CHECK (speed_step BETWEEN 0 AND 2),
    advisory TEXT,
    held INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    CHECK ((status IN ('PARKED','REQ_TAKEOFF')) = (airport IS NOT NULL)),
    CHECK ((status IN ('REQ_LAND','CLEARED_LAND')) = (target_airport IS NOT NULL))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_lander_per_runway
    ON planes(target_airport) WHERE status = 'CLEARED_LAND';
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    role TEXT NOT NULL,
    plane_id INTEGER,
    kind TEXT NOT NULL,
    detail TEXT,
    at TEXT NOT NULL
  );
`;

interface Shared {
  db: DatabaseSync;
  inTx: boolean;
  pending: Record<string, unknown>[];
}

// One handle for the whole process, kept on globalThis so a dev reload can't
// open a second one (two handles would make BEGIN IMMEDIATE genuinely contend).
const g = globalThis as unknown as { __atc?: Shared };

function open(): Shared {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 2000;");
  db.exec(SCHEMA);
  return { db, inTx: false, pending: [] };
}

const shared = (g.__atc ??= open());
export const db = shared.db;

// The only way anything writes. BEGIN IMMEDIATE, roll back on any throw, no
// await inside (so nothing else can run mid-transaction), and refuse to nest.
// Events are written to stdout only after COMMIT, so the log never describes
// something that was rolled back.
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

const insertEvent = db.prepare(
  "INSERT INTO events (actor, role, plane_id, kind, detail, at) VALUES (?, ?, ?, ?, ?, ?)",
);

export type Role = "pilot" | "tower" | "system";

// Call inside tx(). Persists the event and queues its stdout line.
export function addEvent(
  actor: string,
  role: Role,
  planeId: number | null,
  kind: string,
  detail: string | null = null,
): void {
  const at = new Date().toISOString();
  insertEvent.run(actor, role, planeId, kind, detail, at);
  shared.pending.push({ at, actor, role, plane: planeId, kind, detail });
}

export interface PlaneRow {
  id: number;
  owner: string;
  status: Status;
  airport: Airport | null;
  target_airport: Airport | null;
  x: number;
  y: number;
  heading: number;
  speed_step: number;
  advisory: string | null;
  held: number;
}

// What leaves the server: never the owner cookie, only a callsign.
export interface PlaneView {
  id: number;
  callsign: string;
  status: Status;
  airport: Airport | null;
  target: Airport | null;
  x: number;
  y: number;
  heading: number;
  speed: number;
  advisory: string | null;
  held: boolean;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

export function toView(r: PlaneRow): PlaneView {
  return {
    id: r.id,
    callsign: `CBR${r.id}`,
    status: r.status,
    airport: r.airport,
    target: r.target_airport,
    x: round(r.x),
    y: round(r.y),
    heading: r.heading,
    speed: SPEEDS[r.speed_step],
    advisory: r.advisory,
    held: r.held === 1,
  };
}

const COLS =
  "id, owner, status, airport, target_airport, x, y, heading, speed_step, advisory, held";
const byOwnerStmt = db.prepare(`SELECT ${COLS} FROM planes WHERE owner = ?`);
const byIdStmt = db.prepare(`SELECT ${COLS} FROM planes WHERE id = ?`);
const allStmt = db.prepare(`SELECT ${COLS} FROM planes ORDER BY id`);
const countStmt = db.prepare("SELECT COUNT(*) AS n FROM planes");

const getByOwner = (owner: string): PlaneRow | undefined =>
  byOwnerStmt.get(owner) as unknown as PlaneRow | undefined;
const getById = (id: number): PlaneRow | undefined =>
  byIdStmt.get(id) as unknown as PlaneRow | undefined;

export type Fail = { ok: false; status: 403 | 404 | 409 | 503; reason: string };
export type Done = { ok: true; plane: PlaneView };
export type Result<T = Done> = T | Fail;

const fail = (status: Fail["status"], reason: string): Fail => ({ ok: false, status, reason });

// Pilot endpoints find the plane from the cookie, never from the request. When
// a guarded UPDATE changes nothing, this only works out what to tell the pilot.
function ownFailure(owner: string): Fail {
  return getByOwner(owner) ? fail(409, "wrong-state") : fail(404, "no-plane");
}

// Tower endpoints name a plane by id. The `owner != me` rule is inside each
// UPDATE's WHERE clause; this read only explains a refusal after the fact.
function towerFailure(id: number, me: string, expected: Status[], busyReason?: string): Fail {
  const row = getById(id);
  if (!row) return fail(404, "no-such-plane");
  if (row.owner === me) return fail(403, "own-plane");
  if (!expected.includes(row.status)) return fail(409, "wrong-state");
  return fail(409, busyReason ?? "wrong-state");
}

const insertPlane = db.prepare(`
  INSERT INTO planes (owner, ip_hash, status, airport, x, y, heading, speed_step, updated_at)
  SELECT ?, ?, 'PARKED', ?, ?, ?, ?, ?, ?
  WHERE (SELECT COUNT(*) FROM planes) < ?
    AND (? IS NULL OR (SELECT COUNT(*) FROM planes WHERE ip_hash = ?) < ?)
  ON CONFLICT(owner) DO NOTHING
`);

export function join(
  owner: string,
  airport: Airport,
  ipHash: string | null,
): Result<Done & { created: boolean }> {
  return tx(() => {
    const info = AIRPORT_INFO[airport];
    const res = insertPlane.run(
      owner,
      ipHash,
      airport,
      info.x,
      info.y,
      info.takeoffHeading,
      START_SPEED_STEP,
      new Date().toISOString(),
      MAX_PLANES,
      ipHash,
      ipHash,
      MAX_PLANES_PER_IP,
    );
    const row = getByOwner(owner);
    if (!row) {
      const total = (countStmt.get() as unknown as { n: number }).n;
      return fail(503, total >= MAX_PLANES ? "sky-full" : "too-many-from-your-network");
    }
    const created = Number(res.changes) === 1;
    if (created) addEvent(publicId(owner), "pilot", row.id, "join", airport);
    return { ok: true, plane: toView(row), created };
  });
}

export function leave(owner: string): Result<{ ok: true }> {
  return tx(() => {
    const row = getByOwner(owner);
    if (!row) return fail(404, "no-plane");
    db.prepare("DELETE FROM planes WHERE owner = ?").run(owner);
    addEvent(publicId(owner), "pilot", row.id, "leave", row.status);
    return { ok: true };
  });
}

const requestTakeoffStmt = db.prepare(
  "UPDATE planes SET status = 'REQ_TAKEOFF', advisory = NULL, updated_at = ? WHERE owner = ? AND status = 'PARKED'",
);

export function requestTakeoff(owner: string): Result {
  return tx(() => {
    const res = requestTakeoffStmt.run(new Date().toISOString(), owner);
    if (Number(res.changes) !== 1) return ownFailure(owner);
    const row = getByOwner(owner)!;
    addEvent(publicId(owner), "pilot", row.id, "request-takeoff", row.airport);
    return { ok: true, plane: toView(row) };
  });
}

const requestLandingStmt = db.prepare(
  "UPDATE planes SET status = 'REQ_LAND', target_airport = ?, advisory = NULL, updated_at = ? WHERE owner = ? AND status = 'AIRBORNE'",
);

export function requestLanding(owner: string, airport: Airport): Result {
  return tx(() => {
    const res = requestLandingStmt.run(airport, new Date().toISOString(), owner);
    if (Number(res.changes) !== 1) return ownFailure(owner);
    const row = getByOwner(owner)!;
    addEvent(publicId(owner), "pilot", row.id, "request-landing", airport);
    return { ok: true, plane: toView(row) };
  });
}

// Steering is a bounded delta: heading moves by one fixed step, speed by one
// of three fixed steps, both clamped inside the statement. It is not logged
// per call (it can fire ten times a second); the tick's events cover the
// consequences.
const steerStmt = db.prepare(`
  UPDATE planes
  SET heading = (heading + ? + 360) % 360,
      speed_step = MIN(2, MAX(0, speed_step + ?)),
      updated_at = ?
  WHERE owner = ? AND status IN ('AIRBORNE','REQ_LAND','CLEARED_LAND')
`);

export function steer(owner: string, turn: -1 | 0 | 1, speed: -1 | 0 | 1): Result {
  return tx(() => {
    const res = steerStmt.run(turn * TURN_STEP, speed, new Date().toISOString(), owner);
    if (Number(res.changes) !== 1) return ownFailure(owner);
    return { ok: true, plane: toView(getByOwner(owner)!) };
  });
}

const clearTakeoffStmt = db.prepare(`
  UPDATE planes
  SET status = 'AIRBORNE', airport = NULL, x = ?, y = ?, heading = ?, speed_step = ?,
      held = 0, advisory = NULL, updated_at = ?
  WHERE id = ? AND owner != ? AND status = 'REQ_TAKEOFF' AND airport = ?
    AND NOT EXISTS (
      SELECT 1 FROM planes r
      WHERE r.status = 'CLEARED_LAND' AND r.target_airport = planes.airport
    )
`);

export function clearTakeoff(me: string, id: number): Result {
  return tx(() => {
    const row = getById(id);
    if (!row || !row.airport) return towerFailure(id, me, ["REQ_TAKEOFF"], "runway-busy");
    const info = AIRPORT_INFO[row.airport];
    const res = clearTakeoffStmt.run(
      info.x,
      info.y,
      info.takeoffHeading,
      START_SPEED_STEP,
      new Date().toISOString(),
      id,
      me,
      row.airport,
    );
    if (Number(res.changes) !== 1) return towerFailure(id, me, ["REQ_TAKEOFF"], "runway-busy");
    addEvent(publicId(me), "tower", id, "clear-takeoff", row.airport);
    return { ok: true, plane: toView(getById(id)!) };
  });
}

const clearLandingStmt = db.prepare(`
  UPDATE planes
  SET status = 'CLEARED_LAND', advisory = NULL, updated_at = ?
  WHERE id = ? AND owner != ? AND status = 'REQ_LAND'
    AND NOT EXISTS (
      SELECT 1 FROM planes r
      WHERE r.status = 'CLEARED_LAND' AND r.target_airport = planes.target_airport
    )
`);

export function clearLanding(me: string, id: number): Result {
  return tx(() => {
    const res = clearLandingStmt.run(new Date().toISOString(), id, me);
    if (Number(res.changes) !== 1) return towerFailure(id, me, ["REQ_LAND"], "runway-busy");
    const row = getById(id)!;
    addEvent(publicId(me), "tower", id, "clear-landing", row.target_airport);
    return { ok: true, plane: toView(row) };
  });
}

const denyStmt = db.prepare(`
  UPDATE planes
  SET status = CASE status WHEN 'REQ_TAKEOFF' THEN 'PARKED' ELSE 'AIRBORNE' END,
      target_airport = NULL, updated_at = ?
  WHERE id = ? AND owner != ? AND status IN ('REQ_TAKEOFF','REQ_LAND')
`);

export function deny(me: string, id: number): Result {
  return tx(() => {
    const before = getById(id);
    const res = denyStmt.run(new Date().toISOString(), id, me);
    if (Number(res.changes) !== 1) return towerFailure(id, me, ["REQ_TAKEOFF", "REQ_LAND"]);
    addEvent(publicId(me), "tower", id, "deny", before?.status ?? null);
    return { ok: true, plane: toView(getById(id)!) };
  });
}

const adviseStmt = db.prepare(`
  UPDATE planes SET advisory = ?, updated_at = ?
  WHERE id = ? AND owner != ? AND status IN ('AIRBORNE','REQ_LAND','CLEARED_LAND')
`);

export function advise(me: string, id: number, phrase: Phrase): Result {
  return tx(() => {
    const res = adviseStmt.run(phrase, new Date().toISOString(), id, me);
    if (Number(res.changes) !== 1) {
      return towerFailure(id, me, ["AIRBORNE", "REQ_LAND", "CLEARED_LAND"]);
    }
    addEvent(publicId(me), "tower", id, "advise", phrase);
    return { ok: true, plane: toView(getById(id)!) };
  });
}

export interface World {
  planes: PlaneView[];
  byOwner: Map<string, PlaneView>;
  runways: Record<Airport, number | null>;
  conflicts: [number, number][];
}

// Everything derived from the plane rows, never stored: which plane holds a
// runway, and which pairs are too close.
export function readWorld(): World {
  const rows = allStmt.all() as unknown as PlaneRow[];
  const runways = Object.fromEntries(AIRPORTS.map((a) => [a, null])) as Record<Airport, number | null>;
  const byOwner = new Map<string, PlaneView>();
  const planes = rows.map((row) => {
    const view = toView(row);
    byOwner.set(row.owner, view);
    if (row.status === "CLEARED_LAND" && row.target_airport) runways[row.target_airport] = row.id;
    return view;
  });
  return { planes, byOwner, runways, conflicts: computeConflicts(planes) };
}

const recentStmt = db.prepare(
  "SELECT id, at, actor, role, plane_id, kind, detail FROM events ORDER BY id DESC LIMIT ?",
);

export interface EventView {
  id: number;
  at: string;
  actor: string;
  role: string;
  plane: number | null;
  kind: string;
  detail: string | null;
}

export function readEvents(limit = 20): EventView[] {
  const rows = recentStmt.all(limit) as unknown as {
    id: number;
    at: string;
    actor: string;
    role: string;
    plane_id: number | null;
    kind: string;
    detail: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor,
    role: r.role,
    plane: r.plane_id,
    kind: r.kind,
    detail: r.detail,
  }));
}

export function pruneEvents(): void {
  tx(() => {
    db.prepare("DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - ?").run(EVENTS_KEEP);
  });
}
