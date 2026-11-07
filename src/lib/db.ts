import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

// One SQLite file on the Fly volume (/data), the only storage that survives a
// restart. Locally it defaults to ./data so a dev run never touches /data.
const path = process.env.DB_PATH ?? "data/game.db";
mkdirSync(dirname(path), { recursive: true });

export const db = new DatabaseSync(path);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;");

db.exec(`
CREATE TABLE IF NOT EXISTS citizens (
  id        INTEGER PRIMARY KEY,
  token     TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  seat      INTEGER,
  connected INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS citizens_name ON citizens (lower(name));

CREATE TABLE IF NOT EXISTS rounds (
  id           INTEGER PRIMARY KEY,
  phase        TEXT NOT NULL CHECK (phase IN ('election', 'bill')),
  status       TEXT NOT NULL CHECK (status IN ('voting', 'drafting', 'resolved')),
  opens_at     INTEGER NOT NULL,
  closes_at    INTEGER NOT NULL,
  resolved_at  INTEGER,
  presenter_id INTEGER REFERENCES citizens (id),
  election_id  INTEGER REFERENCES rounds (id),
  bill_text    TEXT,
  yea          INTEGER,
  nay          INTEGER,
  bill_outcome TEXT CHECK (bill_outcome IN ('passed', 'failed')),
  bill_no      INTEGER
);
CREATE INDEX IF NOT EXISTS rounds_status ON rounds (status);

CREATE TABLE IF NOT EXISTS candidates (
  round_id    INTEGER NOT NULL REFERENCES rounds (id),
  citizen_id  INTEGER NOT NULL REFERENCES citizens (id),
  declared_at INTEGER NOT NULL,
  PRIMARY KEY (round_id, citizen_id)
);

CREATE TABLE IF NOT EXISTS votes (
  round_id   INTEGER NOT NULL REFERENCES rounds (id),
  citizen_id INTEGER NOT NULL REFERENCES citizens (id),
  choice     TEXT NOT NULL,
  cast_at    INTEGER NOT NULL,
  PRIMARY KEY (round_id, citizen_id)
);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY,
  at         INTEGER NOT NULL,
  round_id   INTEGER,
  citizen_id INTEGER,
  kind       TEXT NOT NULL,
  detail     TEXT
);

-- The record is permanent by construction, not by convention: once a round
-- resolves nothing can change it, a tabled bill's text never changes, a
-- Presenter is never swapped, and nothing here is ever deleted.
CREATE TRIGGER IF NOT EXISTS rounds_resolved_frozen BEFORE UPDATE ON rounds
  WHEN OLD.status = 'resolved'
  BEGIN SELECT RAISE(ABORT, 'a resolved round is permanent'); END;
CREATE TRIGGER IF NOT EXISTS rounds_bill_text_once BEFORE UPDATE OF bill_text ON rounds
  WHEN OLD.bill_text IS NOT NULL AND NEW.bill_text IS NOT OLD.bill_text
  BEGIN SELECT RAISE(ABORT, 'a tabled bill is never edited'); END;
CREATE TRIGGER IF NOT EXISTS rounds_presenter_once BEFORE UPDATE OF presenter_id ON rounds
  WHEN OLD.presenter_id IS NOT NULL AND NEW.presenter_id IS NOT OLD.presenter_id
  BEGIN SELECT RAISE(ABORT, 'a Presenter is never replaced'); END;
CREATE TRIGGER IF NOT EXISTS rounds_bill_no_once BEFORE UPDATE OF bill_no ON rounds
  WHEN OLD.bill_no IS NOT NULL AND NEW.bill_no IS NOT OLD.bill_no
  BEGIN SELECT RAISE(ABORT, 'a bill number is never reassigned'); END;
CREATE TRIGGER IF NOT EXISTS rounds_no_delete BEFORE DELETE ON rounds
  BEGIN SELECT RAISE(ABORT, 'rounds are never deleted'); END;
CREATE TRIGGER IF NOT EXISTS votes_frozen BEFORE UPDATE ON votes
  WHEN (SELECT status FROM rounds WHERE id = OLD.round_id) = 'resolved'
  BEGIN SELECT RAISE(ABORT, 'a vote in a resolved round is permanent'); END;
CREATE TRIGGER IF NOT EXISTS votes_no_delete BEFORE DELETE ON votes
  BEGIN SELECT RAISE(ABORT, 'votes are never deleted'); END;
CREATE TRIGGER IF NOT EXISTS candidates_no_delete BEFORE DELETE ON candidates
  BEGIN SELECT RAISE(ABORT, 'declarations are never withdrawn'); END;
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
  BEGIN SELECT RAISE(ABORT, 'the log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
  BEGIN SELECT RAISE(ABORT, 'the log is append-only'); END;
`);

// Everything that reads-then-writes runs inside one of these. BEGIN IMMEDIATE
// takes the write lock up front, so nothing can land between the read and the
// write it informs.
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
