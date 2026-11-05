# 001 — How a round resolves

**Decision.** A round resolves in one `UPDATE` guarded on its expected status and
on `closes_at <= now`, run by a 1-second sweep (and safe to run from anywhere,
any number of times). The winner or tally is computed from `votes` inside the
same `BEGIN IMMEDIATE` transaction, and the next round is opened in it too.

**Why.** It makes "resolves exactly once, never early" a property of the write,
not of whichever caller got there first. Opening the next round in the same
transaction guarantees there is never more than one active round.
