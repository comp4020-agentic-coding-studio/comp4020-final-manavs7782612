import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// fly.toml mounts the volume at /data; the Dockerfile sets DB_PATH there.
// Locally this falls back to a gitignored file instead.
const DB_PATH = process.env.DB_PATH ?? "./data/tally.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS presence (
    user_id TEXT PRIMARY KEY,
    present INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    count INTEGER NOT NULL,
    at TEXT NOT NULL
  )
`);

export interface Event {
  userId: string;
  action: "arrived" | "left";
  count: number;
  at: string;
}

const getPresenceStmt = db.prepare("SELECT present FROM presence WHERE user_id = ?");
const upsertPresenceStmt = db.prepare(`
  INSERT INTO presence (user_id, present, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET present = excluded.present, updated_at = excluded.updated_at
`);
const countStmt = db.prepare("SELECT COUNT(*) AS n FROM presence WHERE present = 1");
const insertEventStmt = db.prepare(
  "INSERT INTO events (user_id, action, count, at) VALUES (?, ?, ?, ?)",
);
const historyStmt = db.prepare(
  "SELECT user_id, action, count, at FROM events ORDER BY id DESC LIMIT ?",
);

export function getCount(): number {
  const row = countStmt.get() as { n: number };
  return row.n;
}

export function getPresence(userId: string): boolean {
  const row = getPresenceStmt.get(userId) as { present: number } | undefined;
  return row?.present === 1;
}

// The one thing crit 10 asks us to decide: a request can only ever change the
// presence row for the identity its own cookie carries (src/lib/identity.ts
// derives userId; nothing here accepts one from a request body). The upsert
// is a single synchronous statement --- no read-then-write gap for another
// call, even from the same user's second tab, to land in between. See
// decisions/0002-presence-identity-cookie.md.
export function setPresence(userId: string, present: boolean): number {
  const now = new Date().toISOString();
  upsertPresenceStmt.run(userId, present ? 1 : 0, now);
  const count = getCount();
  insertEventStmt.run(userId, present ? "arrived" : "left", count, now);
  return count;
}

export function getHistory(limit = 50): Event[] {
  const rows = historyStmt.all(limit) as { user_id: string; action: string; count: number; at: string }[];
  return rows.reverse().map((r) => ({
    userId: r.user_id,
    action: r.action as "arrived" | "left",
    count: r.count,
    at: r.at,
  }));
}
