# 0001: The compliance check and the claim lock are one atomic statement

## Status

Accepted.

## Context

Slotlock's whole reason to exist is a single sentence in the README: a slot
that would breach a driver's legal hours cannot be booked, not just
flagged. "Cannot" is a strong word, and it only means something if nothing
in the system can produce a non-compliant lock, including by accident
through a race.

Two dispatchers can try to claim the same open slot at the same moment.
Separately, a claim has to be checked against the named driver's remaining
legal hours at the instant of the claim, not against a stale read from
moments earlier. Any design that reads "is this slot open, and does this
driver have enough hours" as a separate step from "write the lock" leaves a
gap: two requests can both read "yes, compliant and open" before either has
written anything, and both then write, with the second silently
overwriting the first, or worse, both believing they succeeded.

## Options considered

1. **Check in application code, then write.** Read the slot and the
   driver's hours, decide in JavaScript, then issue the `UPDATE`. Simplest
   to write and easiest to read. Rejected: the gap between the read and the
   write is exactly the race this app exists to close. Two concurrent
   claims can both pass the check before either commits its write.
2. **Client-side validation only, trusting the request.** Reject in the
   browser before the request is even sent. Rejected outright: a client
   can't be trusted to enforce a legal compliance gate, and nothing stops a
   second, unvalidated request from reaching the server directly.
3. **A separate "reserve" step, then a "confirm" step.** Lock the slot
   first, check compliance second, roll back the lock if the check fails.
   Rejected: this still has a gap (between reserve and confirm) where the
   slot looks locked but hasn't actually been validated, and it needs extra
   state (a "provisional" status) just to describe that gap.
4. **One guarded `UPDATE` inside one transaction (chosen).** The hours
   check and the slot-contention check are both conditions in the same
   `WHERE` clause of a single `UPDATE`, run inside `tx()` (`BEGIN
   IMMEDIATE`). The database's own atomicity is what closes the gap: either
   every condition holds and the row is locked, or nothing changes.

## Decision

Option 4.

- `claimSlot` runs one statement: `UPDATE slots SET status='locked', ...
  WHERE id=? AND status='open' AND (SELECT hours_remaining FROM drivers
  WHERE id=?) >= (duration_min + transit_buffer_min) / 60.0`. There is no
  earlier `SELECT` whose result is trusted by a later `UPDATE`.
- With one Node process and one `DatabaseSync` handle, `BEGIN IMMEDIATE`
  means no second write can interleave inside the transaction, so a losing
  claim never half-succeeds.
- When the statement's `changes !== 1`, a read-after (not a read-before)
  works out *why* for the rejection reason (`hours-insufficient` vs
  `slot-taken` vs `no-such-slot`) — this read is for a human-readable
  message only, never for a decision the write already made.
- Every outcome, success or rejection, writes one row to the append-only
  `events` table inside the same transaction, so the audit log and the
  actual state change can never disagree about what happened.
- The same pattern holds for `reassignSlot` and `completeSlot`: whatever
  the mutator is asserting (a new driver is compliant, a slot is in the
  right state to complete), the assertion is a condition in the guarded
  statement, never a prior read.

## What it costs

- Every mutator's SQL is denser and harder to read than the equivalent
  "read, then write" code, because the business rule has to be expressed as
  a `WHERE` clause condition rather than an `if`.
- Adding a new compliance rule later means adding another condition to the
  guarded statement, not just another `if` branch — a design cost paid on
  purpose, since loosening the discipline for convenience is the exact
  failure mode this ADR exists to prevent.
- This holds together only with one process writing to one SQLite file.
  Multiple app instances against the same database would need a different
  locking story; `fly.toml` pins this app to one machine specifically so
  this guarantee holds.

## How it's checked

`spec/compliance-block.md` and `spec/concurrent-claim.md` (executed in
`spec/slotlock.test.ts`) drive the running app with separate sessions:
a driver with insufficient hours is rejected with a specific reason and no
lock is written, and two claims fired within 50ms of each other for
different compliant drivers produce exactly one success and one rejection,
both logged.
