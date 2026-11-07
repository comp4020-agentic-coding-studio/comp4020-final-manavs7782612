import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// README: "Everything is logged, and the log is the audit trail." Checks
// that a governance event (declaring a candidate) produces both an
// append-only row in `events` and a structured stdout line, with matching
// details — the two forms of the same claim (CLAUDE.md's logging section).
describe("the audit trail", () => {
  it("writes an append-only event row and a structured log line for the same action", () => {
    const dir = mkdtempSync(join(tmpdir(), "democracy-log-"));
    const dbPath = join(dir, "game.db");
    try {
      const out = execFileSync(
        process.execPath,
        ["--input-type=module", "-e",
          `import { db, tx } from "./src/lib/db.ts";
           import { logEvent } from "./src/lib/log.ts";
           tx(() => {
             db.prepare("INSERT INTO citizens (id, token, name, joined_at) VALUES (1, 't', 'alice', 0)").run();
             db.prepare("INSERT INTO events (at, round_id, citizen_id, kind, detail) VALUES (?, ?, ?, ?, ?)")
               .run(Date.now(), null, 1, "declared", null);
             logEvent({ kind: "declared", citizenId: 1, citizen: "alice" });
           });
           const row = db.prepare("SELECT kind, citizen_id FROM events WHERE kind = 'declared'").get();
           console.log(JSON.stringify(row));`],
        { env: { ...process.env, DB_PATH: dbPath }, encoding: "utf8" },
      );
      const lines = out.trim().split("\n");
      const logLine = JSON.parse(lines[0]);
      const dbRow = JSON.parse(lines[1]);
      expect(logLine).toMatchObject({ kind: "declared", citizenId: 1, citizen: "alice" });
      expect(typeof logLine.at).toBe("string");
      expect(dbRow).toMatchObject({ kind: "declared", citizen_id: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the events table refuses updates and deletes (append-only, CLAUDE.md rule 3)", () => {
    const dir = mkdtempSync(join(tmpdir(), "democracy-log2-"));
    const dbPath = join(dir, "game.db");
    try {
      const out = execFileSync(
        process.execPath,
        ["--input-type=module", "-e",
          `import { db } from "./src/lib/db.ts";
           db.prepare("INSERT INTO events (at, round_id, citizen_id, kind, detail) VALUES (?, ?, ?, ?, ?)")
             .run(Date.now(), null, null, "test", null);
           let updateFailed = false, deleteFailed = false;
           try { db.prepare("UPDATE events SET kind = 'changed'").run(); } catch { updateFailed = true; }
           try { db.prepare("DELETE FROM events").run(); } catch { deleteFailed = true; }
           console.log(JSON.stringify({ updateFailed, deleteFailed }));`],
        { env: { ...process.env, DB_PATH: dbPath }, encoding: "utf8" },
      );
      expect(JSON.parse(out.trim())).toEqual({ updateFailed: true, deleteFailed: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
