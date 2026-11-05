import { describe, expect, it } from "vitest";
import { call } from "./helpers.ts";

// What's checkable without playing: no route can rewrite the record, and the
// API refuses malformed input rather than storing it.
describe("the record", () => {
  it("has no admin, edit, delete or reset route", async () => {
    for (const path of ["/api/admin", "/api/reset", "/api/skip", "/api/bills/1", "/api/rounds/1"]) {
      const res = await fetch(new URL(path, (await import("./helpers.ts")).baseUrl), { method: "DELETE" });
      expect(res.status, path).toBeGreaterThanOrEqual(400);
    }
    expect((await call("/api/reset", undefined, {})).status).toBe(404);
  });

  it("serves the passed-bills list to anyone", async () => {
    const { status, json } = await call("/api/bills");
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });

  it("refuses names that are too short, too long or blank", async () => {
    for (const name of ["", " ", "a", "x".repeat(13), 42]) {
      expect((await call("/api/join", undefined, { name })).status, JSON.stringify(name)).toBe(400);
    }
  });

  it("reports the server's clock and windows, so every countdown agrees", async () => {
    const { json } = await call("/api/state");
    expect(Math.abs(json.now - Date.now())).toBeLessThan(5000);
    expect(json.windows.election).toBeGreaterThan(0);
  });
});
