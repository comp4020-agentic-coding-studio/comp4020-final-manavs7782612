import { randomBytes } from "node:crypto";
import {
  BILL_MAX, BILL_MIN, BILLS_IN_SNAPSHOT, DRAFT_MS, ELECTION_MS, FEED_IN_SNAPSHOT,
  GRACE_MS, MAX_CITIZENS, NAME_MAX, NAME_MIN, SEATS, VOTE_MS,
} from "./config.ts";
import { db, tx } from "./db.ts";
import { logEvent } from "./log.ts";

// A rule the table broke: the route turns it into a 4xx, never a 500.
export class Refused extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Row = Record<string, any>;
const one = (sql: string, ...args: any[]): Row | undefined => db.prepare(sql).get(...args) as Row | undefined;
const all = (sql: string, ...args: any[]): Row[] => db.prepare(sql).all(...args) as Row[];
const run = (sql: string, ...args: any[]) => db.prepare(sql).run(...args);

// Bumped on every write, so the broadcaster only pushes when something moved.
export let version = 0;

function event(now: number, kind: string, roundId: number | null, citizenId: number | null, detail: string | null = null): void {
  run("INSERT INTO events (at, round_id, citizen_id, kind, detail) VALUES (?, ?, ?, ?, ?)", now, roundId, citizenId, kind, detail);
  logEvent({ kind, roundId, citizenId, detail });
  version++;
}

// The one round that isn't resolved yet, if any. There is never more than one:
// a new round is only ever opened inside the transaction that resolved the last.
export const activeRound = (): Row | undefined => one("SELECT * FROM rounds WHERE status != 'resolved' ORDER BY id DESC LIMIT 1");

export function citizenByToken(token: string | undefined): Row | undefined {
  if (!token) return undefined;
  return one("SELECT * FROM citizens WHERE token = ?", token);
}

// ---------- joining and seats ----------

export function join(rawName: unknown, now = Date.now()): { token: string; id: number } {
  const name = typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ") : "";
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw new Refused(400, `a name is ${NAME_MIN}-${NAME_MAX} characters`);
  }
  if (/[\p{C}]/u.test(name)) throw new Refused(400, "a name is printable text");
  return tx(() => {
    if (one("SELECT 1 FROM citizens WHERE lower(name) = lower(?)", name)) {
      throw new Refused(409, "that name is taken");
    }
    if ((one("SELECT count(*) AS n FROM citizens")!.n as number) >= MAX_CITIZENS) {
      throw new Refused(503, "the republic is full");
    }
    const token = randomBytes(18).toString("base64url");
    const id = Number(run("INSERT INTO citizens (token, name, joined_at) VALUES (?, ?, ?)", token, name, now).lastInsertRowid);
    event(now, "joined", null, id, name);
    return { token, id };
  });
}

// Live tab count per citizen; the seat is released GRACE_MS after the last goes.
const tabs = new Map<number, number>();
const leaving = new Map<number, ReturnType<typeof setTimeout>>();

export function connect(citizenId: number): void {
  tabs.set(citizenId, (tabs.get(citizenId) ?? 0) + 1);
  clearTimeout(leaving.get(citizenId));
  leaving.delete(citizenId);
  tx(() => {
    const me = one("SELECT * FROM citizens WHERE id = ?", citizenId)!;
    if (me.connected) return;
    const taken = new Set(all("SELECT seat FROM citizens WHERE connected = 1 AND seat IS NOT NULL").map((r) => r.seat));
    let seat: number | null = null;
    for (let s = 0; s < SEATS; s++) if (!taken.has(s)) { seat = s; break; }
    run("UPDATE citizens SET connected = 1, seat = ? WHERE id = ?", seat, citizenId);
    version++;
  });
  seatGallery();
  ensureRound();
}

export function disconnect(citizenId: number): void {
  const left = (tabs.get(citizenId) ?? 1) - 1;
  if (left > 0) { tabs.set(citizenId, left); return; }
  tabs.delete(citizenId);
  leaving.set(citizenId, setTimeout(() => {
    leaving.delete(citizenId);
    run("UPDATE citizens SET connected = 0, seat = NULL WHERE id = ?", citizenId);
    version++;
    seatGallery();
  }, GRACE_MS));
}

// Anyone connected but standing in the gallery takes a freed seat, earliest joiner first.
function seatGallery(): void {
  tx(() => {
    const taken = new Set(all("SELECT seat FROM citizens WHERE connected = 1 AND seat IS NOT NULL").map((r) => r.seat));
    const waiting = all("SELECT id FROM citizens WHERE connected = 1 AND seat IS NULL ORDER BY id");
    for (let s = 0; s < SEATS && waiting.length; s++) {
      if (taken.has(s)) continue;
      run("UPDATE citizens SET seat = ? WHERE id = ?", s, waiting.shift()!.id);
      version++;
    }
  });
}

// On boot nobody is connected yet, whatever the file says.
export function resetPresence(): void {
  run("UPDATE citizens SET connected = 0, seat = NULL WHERE connected = 1 OR seat IS NOT NULL");
}

const anyoneHere = (): boolean => !!one("SELECT 1 FROM citizens WHERE connected = 1 LIMIT 1");

// ---------- the loop ----------

function openElection(now: number): void {
  const id = Number(run("INSERT INTO rounds (phase, status, opens_at, closes_at) VALUES ('election', 'voting', ?, ?)", now, now + ELECTION_MS).lastInsertRowid);
  event(now, "election_opened", id, null);
}

// The table only sits when someone is at it: an empty room doesn't churn out
// empty elections. The first citizen through the door opens one.
export function ensureRound(now = Date.now()): void {
  tx(() => {
    if (!activeRound() && anyoneHere()) openElection(now);
  });
}

// Plurality of the stored votes; a tie (including all-zero) goes to the
// candidate who declared first, then the lower citizen id. Deterministic, never random.
export function electionWinner(roundId: number): number | null {
  const row = one(
    `SELECT c.citizen_id AS id, count(v.citizen_id) AS n
       FROM candidates c
       LEFT JOIN votes v ON v.round_id = c.round_id AND v.choice = CAST(c.citizen_id AS TEXT)
      WHERE c.round_id = ?
      GROUP BY c.citizen_id
      ORDER BY n DESC, c.declared_at ASC, c.citizen_id ASC
      LIMIT 1`,
    roundId,
  );
  return row ? (row.id as number) : null;
}

export function billTally(roundId: number): { yea: number; nay: number } {
  const r = one(
    "SELECT sum(choice = 'yea') AS yea, sum(choice = 'nay') AS nay FROM votes WHERE round_id = ?",
    roundId,
  )!;
  return { yea: (r.yea as number) ?? 0, nay: (r.nay as number) ?? 0 };
}

// Resolves whatever round has run out of time. Every resolution is one UPDATE
// guarded on the status it expects and on closes_at having passed: run it twice,
// or from two places at once, and the second is a no-op. The outcome is computed
// from the votes inside the same transaction, never from an earlier read.
export function sweep(now = Date.now()): boolean {
  return tx(() => {
    const r = activeRound();
    if (!r || r.closes_at > now) return false;

    if (r.phase === "election") {
      const winner = electionWinner(r.id);
      const done = run(
        "UPDATE rounds SET status = 'resolved', resolved_at = ?, presenter_id = ? WHERE id = ? AND status = 'voting' AND closes_at <= ?",
        now, winner, r.id, now,
      );
      if (done.changes !== 1) return false;
      if (winner === null) {
        event(now, "no_candidates", r.id, null);
        if (anyoneHere()) openElection(now);
      } else {
        event(now, "elected", r.id, winner);
        const bill = Number(run(
          "INSERT INTO rounds (phase, status, opens_at, closes_at, presenter_id, election_id) VALUES ('bill', 'drafting', ?, ?, ?, ?)",
          now, now + DRAFT_MS, winner, r.id,
        ).lastInsertRowid);
        event(now, "drafting", bill, winner);
      }
      return true;
    }

    if (r.status === "drafting") {
      // A Presenter who never tables a bill: the round fails with no text.
      const done = run(
        "UPDATE rounds SET status = 'resolved', resolved_at = ?, bill_outcome = 'failed', yea = 0, nay = 0 WHERE id = ? AND status = 'drafting' AND closes_at <= ?",
        now, r.id, now,
      );
      if (done.changes !== 1) return false;
      event(now, "silent", r.id, r.presenter_id);
    } else {
      const { yea, nay } = billTally(r.id);
      const outcome = yea > nay ? "passed" : "failed";
      const done = run(
        "UPDATE rounds SET status = 'resolved', resolved_at = ?, bill_outcome = ?, yea = ?, nay = ? WHERE id = ? AND status = 'voting' AND closes_at <= ?",
        now, outcome, yea, nay, r.id, now,
      );
      if (done.changes !== 1) return false;
      event(now, outcome, r.id, r.presenter_id, `${yea}-${nay}`);
    }
    if (anyoneHere()) openElection(now);
    return true;
  });
}

// ---------- what citizens can do ----------

// Every action re-reads the round and the clock on the server; nothing the
// client says about time or phase is trusted.
function openRound(phase: string, status: string, now: number): Row {
  const r = activeRound();
  if (!r || r.phase !== phase || r.status !== status) throw new Refused(409, `no ${phase} is open for that right now`);
  if (r.closes_at <= now) throw new Refused(409, "that window has closed");
  return r;
}

export function declare(citizenId: number, now = Date.now()): void {
  tx(() => {
    const r = openRound("election", "voting", now);
    const done = run("INSERT OR IGNORE INTO candidates (round_id, citizen_id, declared_at) VALUES (?, ?, ?)", r.id, citizenId, now);
    if (done.changes) event(now, "declared", r.id, citizenId);
  });
}

export function vote(citizenId: number, choice: unknown, now = Date.now()): void {
  tx(() => {
    const r = activeRound();
    if (!r || r.status !== "voting") throw new Refused(409, "nothing is up for a vote right now");
    if (r.closes_at <= now) throw new Refused(409, "that window has closed");
    let value: string;
    if (r.phase === "election") {
      const id = Number(choice);
      if (!Number.isInteger(id) || !one("SELECT 1 FROM candidates WHERE round_id = ? AND citizen_id = ?", r.id, id)) {
        throw new Refused(400, "vote for one of this round's candidates");
      }
      value = String(id);
    } else {
      if (choice !== "yea" && choice !== "nay") throw new Refused(400, "a bill vote is yea or nay");
      value = choice;
    }
    run(
      `INSERT INTO votes (round_id, citizen_id, choice, cast_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (round_id, citizen_id) DO UPDATE SET choice = excluded.choice, cast_at = excluded.cast_at`,
      r.id, citizenId, value, now,
    );
    event(now, "voted", r.id, citizenId);
  });
}

export function propose(citizenId: number, rawText: unknown, now = Date.now()): void {
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (text.length < BILL_MIN || text.length > BILL_MAX) {
    throw new Refused(400, `a bill is ${BILL_MIN}-${BILL_MAX} characters`);
  }
  tx(() => {
    const r = openRound("bill", "drafting", now);
    // Structural, not a trust decision: the guard names the Presenter.
    const done = run(
      "UPDATE rounds SET bill_text = ?, status = 'voting', opens_at = ?, closes_at = ? WHERE id = ? AND status = 'drafting' AND presenter_id = ? AND closes_at > ?",
      text, now, now + VOTE_MS, r.id, citizenId, now,
    );
    if (done.changes !== 1) throw new Refused(403, "only this round's Presenter may table the bill");
    event(now, "proposed", r.id, citizenId, text);
  });
}

// ---------- what everyone sees ----------

export function passedBills(limit = -1): Row[] {
  return all(
    `SELECT r.id, r.bill_text AS text, r.yea, r.nay, r.resolved_at AS resolvedAt, c.name AS presenter
       FROM rounds r JOIN citizens c ON c.id = r.presenter_id
      WHERE r.phase = 'bill' AND r.bill_outcome = 'passed'
      ORDER BY r.resolved_at DESC, r.id DESC LIMIT ?`,
    limit,
  );
}

export function snapshot(now = Date.now()) {
  const seated = all("SELECT id, name, seat FROM citizens WHERE connected = 1 ORDER BY id");
  const r = activeRound();
  let round: Row | null = null;
  if (r) {
    round = { id: r.id, phase: r.phase, status: r.status, closesAt: r.closes_at, presenterId: r.presenter_id, billText: r.bill_text };
    if (r.phase === "election") {
      round.candidates = all(
        `SELECT c.citizen_id AS id, z.name, count(v.citizen_id) AS votes
           FROM candidates c JOIN citizens z ON z.id = c.citizen_id
           LEFT JOIN votes v ON v.round_id = c.round_id AND v.choice = CAST(c.citizen_id AS TEXT)
          WHERE c.round_id = ? GROUP BY c.citizen_id ORDER BY c.declared_at, c.citizen_id`,
        r.id,
      );
    } else {
      round.tally = billTally(r.id);
    }
    round.voters = all("SELECT citizen_id AS id FROM votes WHERE round_id = ?", r.id).map((v) => v.id);
  }
  const feed = all(
    `SELECT e.id, e.at, e.kind, e.detail, c.name FROM events e LEFT JOIN citizens c ON c.id = e.citizen_id
      WHERE e.kind != 'voted' ORDER BY e.id DESC LIMIT ?`,
    FEED_IN_SNAPSHOT,
  );
  return {
    now, seats: SEATS, windows: { election: ELECTION_MS, draft: DRAFT_MS, vote: VOTE_MS },
    citizens: seated, round, bills: passedBills(BILLS_IN_SNAPSHOT), feed,
  };
}

export function myVote(citizenId: number): string | null {
  const r = activeRound();
  if (!r) return null;
  return (one("SELECT choice FROM votes WHERE round_id = ? AND citizen_id = ?", r.id, citizenId)?.choice as string) ?? null;
}
