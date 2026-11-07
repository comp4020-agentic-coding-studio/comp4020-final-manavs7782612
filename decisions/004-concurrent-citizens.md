# 004 — Several citizens at once

The table is never used by one person at a time, so this is a record of what
already happens when it isn't, and why those outcomes were chosen over the
alternatives.

**Two votes (or declarations) land in the same instant.** Considered: let both
writes race and keep whichever SQLite happens to commit last. Rejected,
because "last" would depend on request arrival order, not on anything a
citizen did — not deterministic, not auditable. Chosen instead: every write
that touches a round runs inside `tx()`, which takes `BEGIN IMMEDIATE` up
front, so SQLite serialises the two requests itself. The second writer simply
re-reads the round it re-checks against (`closes_at`, `status`) after the
first commits. Cost: a vote under heavy simultaneous load queues briefly
behind the lock rather than running in parallel — acceptable, since the table
seats 8 and a transaction is microseconds.

**A citizen disconnects and comes back.** Considered: free their seat (and any
candidacy/vote) the instant their tab closes, so a dropped connection reads as
leaving. Rejected — a flaky phone network or a reload would eject someone
mid-round for no fault of their own, and the bill they tabled or the vote they
cast must not be touched (rule 3, CLAUDE.md). Chosen instead: `GRACE_MS`
(`src/lib/config.ts`) keeps their seat reserved after the last tab closes; if
they reconnect inside the window they keep the same seat, otherwise the seat
is released to whoever is waiting in the gallery, earliest joiner first
(`seatGallery()` in `game.ts`). Their citizen row, candidacy and votes are
never touched by disconnecting — those live in the permanent record
regardless of presence. Cost: a citizen who leaves for good still holds a
seat for `GRACE_MS` before anyone else can sit.

**Two citizens try to table a bill as Presenter at once.** Not actually
possible to race: `presenter_id` is fixed on the round the moment the
election resolves (rule 4, CLAUDE.md), and `propose()`'s `UPDATE` names that
exact id in its `WHERE` clause. A second citizen's attempt fails the guard —
0 rows changed — and gets a 403, not a conflict to resolve. No decision was
needed here because the schema already makes the race impossible; it's listed
so the record of "what happens when several people act at once" is complete.

**What a returning citizen sees.** Nothing is replayed to them specially: on
reconnect they get the same snapshot everyone else gets (`GET /api/state`,
or the first SSE frame), which already reflects every round that resolved
while they were away, because resolution is unconditional on who's watching
(`sweep()` runs on the server's own 1-second tick regardless of client
presence, lines 159-206 in `game.ts`). There's no separate "catch-up" feed —
the permanent record (`bills`, `feed` in `snapshot()`) already is the
catch-up.
