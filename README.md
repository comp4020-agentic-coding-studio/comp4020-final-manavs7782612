# Slotlock

**Live:** https://comp4020-final-manavs7782612.fly.dev

Slotlock is a dock and load-slot booking tool for small Australian transport
operators. It exists because of one fact: from August 2026, Heavy Vehicle
National Law reforms make a documented Safety Management System a legal duty
for every party in the Chain of Responsibility — not just large fleets with
enterprise TMS budgets. A missed fatigue breach isn't a UX bug here; it's a
Category 1 offence carrying penalties up to $436,850 and five years'
imprisonment for an individual, or over $4.2M for a corporation.

Existing software doesn't close this gap. Dock schedulers like GoRamp and
Opendock solve detention fees for US warehouses and have no concept of
Australian driver-hours law. Enterprise suites like Kynection or Allotrac
bury compliance as one module in a system priced for large fleets. Tools
built for small AU carriers — MachShip, MyTrucking — are on record as lacking
deep Chain of Responsibility functionality. Nobody stops a non-compliant
booking from happening. They all report on it afterward.

## What good means here

**Good, for this app, means one thing above all others: a slot that would
breach a driver's legal hours cannot be booked — not "should not," not
"is flagged," but cannot.** Everything else in this document, `CLAUDE.md`,
and `spec/` exists to make that true in practice, not just in prose.

What's enforced (the app will refuse to let this happen, and a spec check
proves it):

- **A claim is rejected outright, synchronously, if the claimed driver's
  remaining legal hours are insufficient** for the slot's duration plus
  transit buffer. No override exists in the UI for this case, for any role.
- **A slot cannot be claimed by two dispatchers at once**; the second claim
  is rejected, not silently overwritten. The hours check and the
  contention check both live inside the same guarded database statement,
  so there is no gap between "check" and "write" for a race to land in.
- **Every lock, completion and rejection is written to an append-only
  log**, naming who did it. Nothing in the system can edit or delete a
  past entry — not even an admin role.

What's judged (a human call this app supports but doesn't automate):

- Whether a *reassignment* to another driver is the right business
  decision versus rescheduling the load entirely — Slotlock surfaces a
  ranked list of compliant drivers, but the dispatcher chooses.
- Whether a dock's own appointment windows are generous enough for the
  operator's actual yard — that's a judgment about the business, not a
  safety rule, so it's configurable rather than enforced.

The system distinguishes three parties by function, per the Chain of
Responsibility's own definitions, not job title: the **dispatcher** who
claims a slot, the **driver** who is bound by it, and the **consignor/
consignee** who can see it fill live, anonymously, with no login. Real-time
matters here specifically because the race condition — two dispatchers
claiming the same door, a driver's hours ticking over mid-claim — is the
exact moment a paper-based or asynchronous system fails regional operators
today.

Sources consulted: NHVR Chain of Responsibility primary-duty guidance,
HVNL 2026 reform coverage (ctrack.com.au, fleetcard.com.au), industry
analysis naming the MachShip/MyTrucking compliance gap (kynection.com.au).

## What this deliberately doesn't do

- **No real telematics or fatigue-monitoring integration.** A driver's
  `hours_remaining` is a number this app tracks itself, decremented when a
  slot completes. For a real operator this would read from a certified
  logbook or ELD feed; here it's a deliberate simplification stated
  plainly so it doesn't read as an overclaim.
- **No multi-operator accounts, no signup.** A fixed, small roster of
  dispatchers and drivers, each with a name and a 4-digit PIN, seeded in
  source. This is a single-operator prototype, not a SaaS with tenants.
- **No more than a handful of docks**, all fixed in source.
- **No admin override, force-book, or "edit flag" of any kind.** If a
  future feature seemed to need one, the answer is to stop and ask, not to
  build it — it would contradict the one claim this app exists to make
  true.
- **No security boundary around the consumer/dock view.** `/dock` is
  public on purpose, same as a real yard's status board, but it shows no
  names and no PII — fill status only.

## How it's built

Astro in SSR mode (`@astrojs/node`, standalone adapter) and a `node:sqlite`
file hold all state — slots, drivers, docks, sessions and the audit log.
Dispatchers and drivers log in with name + PIN against a fixed seeded
roster; the consumer dock view needs no identity at all. Every write that
changes a slot's state goes through one transaction, with the compliance
check and the contention check inside the same guarded `UPDATE` statement,
so a race between two claims has exactly one winner and the loser is told
why. State changes push to every open tab over
[server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events);
claims, reassignments, reschedules and completions are plain POSTs. One
Fly.io machine, one volume: see `fly.toml` and the `Dockerfile` for what
that fixes. `CLAUDE.md` says what rules the build is held to; `PROCESS.md`
says how it actually went; `decisions/` holds the reasoning behind the
big calls.
