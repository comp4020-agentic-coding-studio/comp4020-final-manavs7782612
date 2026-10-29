# Process overview

## What was built, and why the compliance gate has to be a database guarantee

Slotlock is a dock/load-slot booking tool for small Australian transport
operators. Its one claim is that a slot a driver's remaining legal hours
can't cover is never bookable — not flagged, not warned against, refused.
That claim only means something if nothing in the system can produce a
non-compliant lock by accident, including through a race between two
dispatchers claiming the same slot at once. The design question that
followed directly: where does "is this compliant, and is this slot still
open" get decided, and can two requests ever both pass that decision before
either has written anything?

The answer settled on before any code was written
([`1c26ef4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/1c26ef4)):
the hours check and the slot-contention check are both conditions inside
one guarded `UPDATE` statement, run inside a single transaction. There is
no earlier `SELECT` whose result a later `UPDATE` trusts. The reasoning,
including the three alternatives rejected (application-level check-then-
write, client-side validation only, a two-step reserve/confirm), is in
[`decisions/0001-server-authoritative-compliance-gate.md`](decisions/0001-server-authoritative-compliance-gate.md).

## Where I steered, and where the agent proposed

My calls were about what the app actually is and who's in it: a dock
booking tool, not a general logistics platform; a small fixed roster of
dispatchers and drivers logged in by name and PIN, not anonymous cookies
like a prior prototype used, because the audit log's whole value is
attributing who did what; a public, anonymous consumer view of dock fill
status with no names or PII; no admin override of any kind, ever, on the
compliance gate. The agent proposed the mechanics: the single guarded
`UPDATE` pattern, the schema shape (an append-only `events` table with no
application code path that issues `UPDATE` or `DELETE` against it, enforced
structurally by `/api/events` exporting only `GET`), the SSE role-filtered
broadcast, and the roster's seeded low-hours drivers so the compliance gate
is demonstrable on first run rather than requiring manual setup.

## Stack

Astro SSR with the Node standalone adapter, `node:sqlite` for all state
(drivers, docks, slots, sessions, the audit log), server-sent events for
push, plain POSTs for commands. One process matters here for a different
reason than a simulation tick would: the single guarded `UPDATE` only
closes the claim race because one `DatabaseSync` handle and `BEGIN
IMMEDIATE` mean no second write can interleave inside the transaction.
Sessions are process memory, not persisted state — logging back in after a
restart is a login, not data loss, unlike a slot's lock or an audit entry.

## Spec before code

The five spec scenarios
([`compliance-block`](spec/compliance-block.md),
[`concurrent-claim`](spec/concurrent-claim.md),
[`realtime-propagation`](spec/realtime-propagation.md),
[`audit-immutability`](spec/audit-immutability.md),
[`persistence`](spec/persistence.md)) were written as prose before the
engine
([`1c26ef4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/1c26ef4)),
then made executable
([`e8f6b1d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/e8f6b1d))
against the running app with separate login sessions, the same shape a
marker with two browser profiles would exercise by hand. `compliance-block`
claims a 180-minute slot for a driver with 0.75 hours remaining and checks
the rejection reason, that nothing locked, and that the rejection itself is
logged. `concurrent-claim` fires two claims for different compliant drivers
at the same slot and checks exactly one 200 and one `slot-taken` 409, both
logged. `realtime-propagation` claims in a dispatcher session and waits on
a driver's and the public consumer's own SSE streams for the change,
asserting it lands within a second. `audit-immutability` sends `PATCH` and
`DELETE` at an existing event id and confirms both fail and the entry is
byte-for-byte unchanged afterward.

## Verifying it actually works

`pnpm check` passes 14 tests against the built app (`pnpm build`, then
`dist/server/entry.mjs`, per `spec/global-setup.ts`), the same thing CI
gates the deploy on. Along the way, running the real server surfaced one
leftover from the prior prototype this repo started from: `spec/atc.test.ts`
was still present and failing against the new app, since it expected
cookie-minting page renders this app doesn't do. It was deleted rather than
adapted — it tested a different app's identity model entirely.

For persistence I built the actual Docker image, ran it with a mounted
named volume, logged in, claimed a slot, recorded the audit log's exact
contents, ran `docker restart`, logged in again, and diffed the audit log
byte-for-byte against the pre-restart copy: identical. The slot's lock
state (`status`, `driver_id`, `locked_by`, `locked_at`) also matched
exactly. This is the test `CLAUDE.md` rule 10 requires before calling
persistence done, not just "it's in a database."

I also manually fired two concurrent `curl` claims at the same slot for two
different compliant drivers and confirmed one 200 and one 409 with reason
`slot-taken`, matching what the automated `concurrent-claim` spec checks.

## What isn't proven yet

Everything above was checked on localhost and in a local Docker container,
not against the live Fly deploy — the two-browser-profile pass and a
next-day persistence check on the deployed URL haven't been done yet.
`reflections/crit-10.md` is a placeholder; it needs the student's own
first-person account before the cutoff sweep reads it, not an agent's
account of the work.
