// Every number that shapes the game, in one place. The windows are read once
// at boot from the environment and reported to every client in the snapshot,
// so the spec (and the countdown) adapt to whatever the deployment runs with.
// Nothing here is changeable at runtime by anyone: there is no admin.

function seconds(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${name} must be a number of seconds between ${min} and ${max}, got "${raw}"`);
  }
  return n;
}

// A round table of this many seats. Citizens beyond it watch from the gallery
// and take the first seat that frees up.
export const SEATS = 8;

// Phase 1: candidates declare and everyone votes, in one window.
export const ELECTION_MS = seconds("ELECTION_SECS", 30, 2, 600) * 1000;
// Phase 2a: the elected Presenter writes the bill.
export const DRAFT_MS = seconds("DRAFT_SECS", 60, 2, 900) * 1000;
// Phase 2b: everyone votes yea/nay on the tabled bill. Starts the moment the
// bill is tabled, and is the same length however early or late that was.
export const VOTE_MS = seconds("VOTE_SECS", 25, 2, 600) * 1000;
// How long a citizen keeps their seat after their last tab closes, so a page
// reload doesn't stand them up.
export const GRACE_MS = seconds("SEAT_GRACE_SECS", 0.5, 0, 60) * 1000;

export const NAME_MIN = 2;
export const NAME_MAX = 12;
export const BILL_MIN = 3;
export const BILL_MAX = 280;

export const MAX_CITIZENS = 500;
export const MAX_STREAMS = 120;
export const MAX_STREAMS_PER_CITIZEN = 4;

// What one snapshot carries. The full record is always one GET away at
// /api/bills; a snapshot only needs the recent end of it.
export const BILLS_IN_SNAPSHOT = 50;
export const FEED_IN_SNAPSHOT = 40;
