import { AIRPORT_INFO, LAND_KM, SPEEDS, START_SPEED_STEP, type Airport } from "./airports";
import { broadcast, heartbeat, streamCount } from "./broadcast";
import { addEvent, db, pruneEvents, tx, type PlaneRow } from "./db";
import { advance, computeConflicts, distance } from "./geometry";
import { metrics } from "./metrics";
import { isHeld, sweep } from "./presence";
import { sweepLimiter } from "./limits";

const TICK_MS = 250;
const MAX_DT = 0.5;
const SWEEP_EVERY = 240; // ticks: about once a minute
const HEARTBEAT_EVERY = 100; // ticks: about every 25 s

interface Sim {
  intervalId?: ReturnType<typeof setInterval>;
  lastTick: number;
  ticks: number;
  conflicts: Set<string>;
}

// Kept on globalThis, and any older loop cleared at load, so a dev reload
// can't leave two ticks moving the same planes.
const g = globalThis as unknown as { __atcSim?: Sim };
if (g.__atcSim?.intervalId) clearInterval(g.__atcSim.intervalId);
const sim: Sim = (g.__atcSim = { lastTick: performance.now(), ticks: 0, conflicts: new Set() });

const flyingStmt = db.prepare(
  `SELECT id, owner, status, airport, target_airport, x, y, heading, speed_step, advisory, held
   FROM planes WHERE status IN ('AIRBORNE','REQ_LAND','CLEARED_LAND') ORDER BY id`,
);
const moveStmt = db.prepare("UPDATE planes SET x = ?, y = ?, held = ?, updated_at = ? WHERE id = ?");
const parkStmt = db.prepare(`
  UPDATE planes
  SET status = 'PARKED', airport = ?, target_airport = NULL, x = ?, y = ?, heading = ?,
      speed_step = ?, held = 0, advisory = NULL, updated_at = ?
  WHERE id = ? AND status = 'CLEARED_LAND'
`);

const pairKey = ([a, b]: [number, number]): string => `${a}/${b}`;

// The one place planes move. Elapsed time is measured with performance.now()
// (process uptime), so a Fly wake never looks like a long flight, and capped
// so a stalled event loop can't teleport anything. With nobody connected the
// sky pauses, which is also what stops it burning the Fly budget.
function tick(): void {
  const started = performance.now();
  const elapsed = (started - sim.lastTick) / 1000;
  sim.lastTick = started;
  if (streamCount() === 0) return;

  sim.ticks++;
  const dt = Math.min(MAX_DT, elapsed);
  if (elapsed > 0 && elapsed < 1) {
    metrics.hz = metrics.hz === 0 ? 1 / elapsed : metrics.hz * 0.9 + (1 / elapsed) * 0.1;
  }

  try {
    const rows = flyingStmt.all() as unknown as PlaneRow[];
    if (rows.length > 0) {
      const now = Date.now();
      const stamp = new Date(now).toISOString();
      tx(() => {
        const positions: { id: number; x: number; y: number; status: string }[] = [];
        for (const row of rows) {
          const held = isHeld(row.owner, now);
          if (held !== (row.held === 1)) {
            addEvent("system", "system", row.id, held ? "hold" : "resume", null);
          }

          let { x, y } = row;
          if (!held) ({ x, y } = advance(row, row.heading, SPEEDS[row.speed_step], dt));

          if (row.status === "CLEARED_LAND" && row.target_airport) {
            const target = row.target_airport as Airport;
            const info = AIRPORT_INFO[target];
            if (distance({ x, y }, info) < LAND_KM) {
              parkStmt.run(target, info.x, info.y, info.takeoffHeading, START_SPEED_STEP, stamp, row.id);
              addEvent("system", "system", row.id, "landed", target);
              continue;
            }
          }

          positions.push({ id: row.id, x, y, status: row.status });
          if (x !== row.x || y !== row.y || held !== (row.held === 1)) {
            moveStmt.run(x, y, held ? 1 : 0, stamp, row.id);
          }
        }

        // Log a conflict when it starts, not on every tick it lasts.
        const current = new Set(computeConflicts(positions).map(pairKey));
        for (const key of current) {
          if (!sim.conflicts.has(key)) addEvent("system", "system", null, "conflict", key);
        }
        sim.conflicts = current;
      });
      broadcast();
    } else {
      sim.conflicts = new Set();
    }

    if (sim.ticks % HEARTBEAT_EVERY === 0) heartbeat();
    if (sim.ticks % SWEEP_EVERY === 0) {
      sweep(Date.now());
      sweepLimiter();
      pruneEvents();
    }
  } catch (err) {
    console.error(JSON.stringify({ at: new Date().toISOString(), kind: "tick-error", error: String(err) }));
  }

  const took = performance.now() - started;
  metrics.tickMs = took;
  metrics.worstTickMs = Math.max(metrics.worstTickMs, took);
}

// Called when a stream opens. The tick only has work while someone is
// connected, so after a restart or a Fly wake the first stream starts it.
export function ensureTick(): void {
  if (sim.intervalId) return;
  sim.lastTick = performance.now();
  sim.intervalId = setInterval(tick, TICK_MS);
  sim.intervalId.unref();
}
