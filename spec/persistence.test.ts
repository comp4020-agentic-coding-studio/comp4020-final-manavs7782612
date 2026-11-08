import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// README: "It survives restarts." The app itself never reopens its own
// database mid-test, so this checks the promise directly: a citizen written
// by one process is still there, untouched, when a second process opens the
// same file - exactly what a Fly restart does to the volume.
describe("data survives a restart", () => {
  it("is still there once the process that wrote it has exited", () => {
    const dir = mkdtempSync(join(tmpdir(), "democracy-db-"));
    const dbPath = join(dir, "game.db");
    try {
      execFileSync(
        process.execPath,
        ["--input-type=module", "-e",
          `import { db } from "./src/lib/db.ts";
           db.prepare("INSERT INTO citizens (token, name, joined_at) VALUES (?, ?, ?)")
             .run("tok-1", "persistent-pat", Date.now());`],
        { env: { ...process.env, DB_PATH: dbPath } },
      );

      const out = execFileSync(
        process.execPath,
        ["--input-type=module", "-e",
          `import { db } from "./src/lib/db.ts";
           const row = db.prepare("SELECT name FROM citizens WHERE token = ?").get("tok-1");
           console.log(row?.name ?? "");`],
        { env: { ...process.env, DB_PATH: dbPath }, encoding: "utf8" },
      );
      expect(out.trim()).toBe("persistent-pat");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
