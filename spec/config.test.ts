import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// config.ts reads its *_SECS env vars once, at import time, so each case
// needs its own process (CLAUDE.md: "read once at boot, never from the
// client" - this checks that the clamping it promises actually happens).
function readMs(name: string, env: Record<string, string>): number {
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", `import { ${name} } from "./src/lib/config.ts"; console.log(${name})`],
    { env: { ...process.env, ...env }, encoding: "utf8" },
  );
  return Number(out.trim());
}

function fails(name: string, env: Record<string, string>): boolean {
  try {
    readMs(name, env);
    return false;
  } catch {
    return true;
  }
}

describe("config seconds parsing", () => {
  it("defaults when the env var is unset or empty", () => {
    expect(readMs("ELECTION_MS", {})).toBe(30_000);
    expect(readMs("ELECTION_MS", { ELECTION_SECS: "" })).toBe(30_000);
  });

  it("converts a valid value to milliseconds", () => {
    expect(readMs("ELECTION_MS", { ELECTION_SECS: "5" })).toBe(5_000);
    expect(readMs("DRAFT_MS", { DRAFT_SECS: "10" })).toBe(10_000);
    expect(readMs("VOTE_MS", { VOTE_SECS: "7" })).toBe(7_000);
  });

  it("rejects a value outside its clamped range", () => {
    expect(fails("ELECTION_MS", { ELECTION_SECS: "1" })).toBe(true); // below min 2
    expect(fails("ELECTION_MS", { ELECTION_SECS: "601" })).toBe(true); // above max 600
  });

  it("rejects a non-numeric value", () => {
    expect(fails("ELECTION_MS", { ELECTION_SECS: "soon" })).toBe(true);
  });

  it("accepts the boundary values", () => {
    expect(readMs("ELECTION_MS", { ELECTION_SECS: "2" })).toBe(2_000);
    expect(readMs("ELECTION_MS", { ELECTION_SECS: "600" })).toBe(600_000);
  });
});
