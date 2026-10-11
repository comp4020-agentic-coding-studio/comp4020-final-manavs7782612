import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// fly.toml mounts the volume at /data; the Dockerfile sets DB_PATH there.
// Locally this falls back to a gitignored file instead.
const DB_PATH = process.env.DB_PATH ?? "./data/tally.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delta INTEGER NOT NULL,
    count INTEGER NOT NULL,
    at TEXT NOT NULL
  )
`);

export interface Change {
  delta: number;
  count: number;
  at: string;
}

const latestStmt = db.prepare("SELECT count FROM changes ORDER BY id DESC LIMIT 1");
const insertStmt = db.prepare("INSERT INTO changes (delta, count, at) VALUES (?, ?, ?)");
const historyStmt = db.prepare("SELECT delta, count, at FROM changes ORDER BY id DESC LIMIT ?");

export function getCount(): number {
  const row = latestStmt.get() as { count: number } | undefined;
  return row?.count ?? 0;
}

// The one thing crit 9 asks us to decide: two people pressing +1/-1 "at
// once" never overwrite each other, because neither ever sends the count ---
// only a delta applied here, in this one process, against the row that was
// actually last written. See decisions/0001-apply-deltas-not-counts.md.
export function applyDelta(delta: 1 | -1): number {
  const next = Math.max(0, getCount() + delta);
  insertStmt.run(delta, next, new Date().toISOString());
  return next;
}

export function getHistory(limit = 50): Change[] {
  return (historyStmt.all(limit) as unknown as Change[]).reverse();
}
