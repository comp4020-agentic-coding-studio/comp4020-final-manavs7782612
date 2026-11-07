import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { afterClose, call, freshElection, join, state, type Citizen } from "./helpers.ts";

// One full round of government, then a tied one, against the running app.
// Sequential on purpose: each step is a rule from CLAUDE.md, in the order a
// real table meets them.
describe("a round of government", { timeout: 300_000 }, () => {
  let a: Citizen, b: Citizen, c: Citizen;
  let electionId: number, billId: number;
  const text = `Be it enacted that ${Math.random().toString(36).slice(2)} is a public holiday`;

  beforeAll(async () => {
    [a, b, c] = await Promise.all([join(), join(), join()]);
  });
  afterAll(() => [a, b, c].forEach((x) => x?.close()));

  it("seats every connected citizen and shows them to everyone", async () => {
    const s = await state();
    const seated = s.citizens.map((x: any) => x.id);
    for (const x of [a, b, c]) expect(seated).toContain(x.id);
  });

  it("refuses actions from someone who hasn't joined", async () => {
    expect((await call("/api/declare", undefined, {})).status).toBe(401);
    expect((await call("/api/vote", "not-a-token", { choice: "yea" })).status).toBe(401);
  });

  it("refuses a taken name, whatever its case", async () => {
    expect((await call("/api/join", undefined, { name: b.name.toUpperCase() })).status).toBe(409);
  });

  it("runs an election: declare, vote, change your vote, one vote each", async () => {
    electionId = (await freshElection()).id;
    expect((await call("/api/declare", a.token, {})).status).toBe(200);
    expect((await call("/api/declare", b.token, {})).status).toBe(200);
    expect((await call("/api/declare", b.token, {})).status).toBe(200); // declaring twice is a no-op

    expect((await call("/api/vote", c.token, { choice: c.id })).status).toBe(400); // not a candidate
    expect((await call("/api/vote", c.token, { choice: a.id })).status).toBe(200);
    expect((await call("/api/vote", c.token, { choice: b.id })).status).toBe(200); // changed mind
    expect((await call("/api/vote", a.token, { choice: b.id })).status).toBe(200);

    const r = (await state()).round;
    expect(r.id).toBe(electionId);
    const votes = Object.fromEntries(r.candidates.map((k: any) => [k.id, k.votes]));
    expect(votes).toEqual({ [a.id]: 0, [b.id]: 2 });
    expect((await state(c.token)).myVote).toBe(String(b.id));
  });

  it("makes the plurality winner Presenter when the window closes, and nobody else can table", async () => {
    const s = await afterClose(electionId);
    expect(s.round.phase).toBe("bill");
    expect(s.round.status).toBe("drafting");
    expect(s.round.presenterId).toBe(b.id);
    billId = s.round.id;
    expect(s.feed.find((f: any) => f.kind === "elected" && f.name === b.name)?.detail).toBe("2-0");

    expect((await call("/api/propose", a.token, { text: "a coup" })).status).toBe(403);
    expect((await call("/api/declare", a.token, {})).status).toBe(409); // no election open
  });

  it("lets the Presenter table once, and never edit it", async () => {
    expect((await call("/api/propose", b.token, { text })).status).toBe(200);
    expect((await call("/api/propose", b.token, { text: "actually, something else" })).status).toBe(409);
    const r = (await state()).round;
    expect(r).toMatchObject({ id: billId, status: "voting", billText: text });
  });

  it("counts one yea/nay per citizen, changeable until close", async () => {
    expect((await call("/api/vote", a.token, { choice: "maybe" })).status).toBe(400);
    for (const [x, v] of [[a, "yea"], [b, "yea"], [c, "nay"], [c, "yea"]] as const) {
      expect((await call("/api/vote", x.token, { choice: v })).status).toBe(200);
    }
    expect((await state()).round.tally).toEqual({ yea: 3, nay: 0 });
  });

  it("records a passed bill permanently, and starts the next election by itself", async () => {
    const s = await afterClose(billId);
    expect(s.round.phase).toBe("election");
    const { json: bills } = await call("/api/bills");
    const mine = bills.find((x: any) => x.id === billId);
    expect(mine).toMatchObject({ text, presenter: b.name, yea: 3, nay: 0 });

    // A late vote lands in the new round or nowhere: the bill's tally never moves.
    await call("/api/vote", c.token, { choice: "nay" });
    const again = (await call("/api/bills")).json.find((x: any) => x.id === billId);
    expect(again).toMatchObject({ yea: 3, nay: 0 });
  });

  it("names who voted yea and who voted nay on a passed bill", async () => {
    const bill = (await call("/api/bills")).json.find((x: any) => x.id === billId);
    expect(bill.yeaNames.sort()).toEqual([a.name, b.name, c.name].sort());
    expect(bill.nayNames).toEqual([]);
  });

  it("breaks a tie for whoever declared first, and a silent Presenter fails the bill", async () => {
    const e = await freshElection();
    expect((await call("/api/declare", c.token, {})).status).toBe(200);
    expect((await call("/api/declare", a.token, {})).status).toBe(200);
    // no votes at all: a 0-0 tie
    const s = await afterClose(e.id);
    expect(s.round.presenterId).toBe(c.id);

    const after = await afterClose(s.round.id); // c says nothing
    expect(after.round.phase).toBe("election");
    expect(after.feed.some((f: any) => f.kind === "silent" && f.name === c.name)).toBe(true);
    expect((await call("/api/bills")).json.some((x: any) => x.id === s.round.id)).toBe(false);

    const failed = (await call("/api/bills/failed")).json;
    const mine = failed.find((x: any) => x.id === s.round.id);
    expect(mine).toMatchObject({ text: null, presenter: c.name, yea: 0, nay: 0 });
    expect(mine.yeaNames).toEqual([]);
    expect(mine.nayNames).toEqual([]);
  });
});
