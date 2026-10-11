# 0001: Apply deltas, never accept an absolute count

## Status

Accepted.

## Context

The crit room tally has exactly one piece of shared state: how many people
are currently in the room. Several people can press **+** or **−** within
the same second — that's the whole point of a crit, several devices open at
once (see `crits/09-all-at-once`). Two requests can arrive close enough
together that, from the server's point of view, they overlap.

If each button press read the current count on the client, incremented or
decremented it locally, and sent the result back (`{count: N}`), two
overlapping presses would race: both clients read the same starting number,
both compute their own "next" value, and whichever request's write lands
second silently overwrites the first. One person's `+1` would vanish with no
error and no trace — the exact failure mode the README's "forgiving of
simultaneity" promise rules out.

## Options considered

1. **Client sends the absolute next count.** Simplest client code, but has
   the race above. Rejected.
2. **Client sends a delta; server applies it against whatever it currently
   has stored, inside one synchronous operation.** The server never trusts a
   client's idea of the current value — it only trusts the direction. Two
   overlapping `+1`s both land, in whatever order they're actually
   processed, and the final count reflects both.
3. **Optimistic concurrency (client sends delta + the count it last saw;
   server rejects if the stored count has since moved, client retries).**
   Correct, but adds a retry loop and user-visible failure state for a
   problem option 2 already solves without one, for an app this small.
   Rejected as unnecessary complexity.

## Decision

Option 2. `POST /api/tally` accepts only `{ delta: 1 | -1 }`
(`src/pages/api/tally.ts`). The server reads the last-written count and
writes `max(0, lastCount + delta)` in one synchronous call
(`src/lib/db.ts`, `applyDelta`) — `node:sqlite`'s `DatabaseSync` runs on a
single Node process with no connection pool, so "read current count, then
write the new one" has no `await` between those two steps for another
request to interleave with. The new count is broadcast over SSE to every
open tab (`src/lib/broadcast.ts`), including the tab that sent the request —
no client ever computes or displays a count it invented locally.

## What it costs

- The server is the only source of truth for the count; a client can never
  render a value it computed itself, even briefly. In practice this is
  invisible at this app's latency and scale — the SSE round trip back to
  the same tab is well under the "about a second" bar the brief sets.
- This only works because the app runs on exactly one Fly machine with one
  SQLite file (`fly.toml` fixes this). Scaling to multiple machines would
  reintroduce the race across machines and need a real single writer (a
  queue, or a database with transactions) — out of scope for twelve people
  in a room.

## How it's checked

`spec/tally.test.ts` sends two `+1` requests back-to-back against a running
server and asserts the count increases by exactly 2, not 1 — the test this
decision has to keep passing.
