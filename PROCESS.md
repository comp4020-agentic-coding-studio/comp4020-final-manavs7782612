# Process overview

## Stack

Astro in SSR mode, via the `@astrojs/node` standalone adapter
([`1df5972`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/1df5972)).
The published crit specs already assume Astro, and a single standalone
process matters here: the app's one architectural decision (below) depends
on exactly one process holding the count, not a pool of workers that could
race each other. Storage is `node:sqlite`'s `DatabaseSync` — stable,
unflagged, no native compile step, and a flat file is the right amount of
database for one integer and a change log.

## The feature

[`053a7e6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/053a7e6):
`db.ts` owns reads/writes against sqlite, `broadcast.ts` holds the open SSE
connections, two API routes (`POST /api/tally`, `GET /api/tally/stream`),
one SSR page wiring a `+`/`−` UI to both.

Crit 9 asks every final project to decide and defend how the app behaves
when more than one person acts on shared state at once — here, two people
pressing `+`/`−` close enough together to overlap. The server applies a
*delta* against its own last-written count, in one synchronous operation,
rather than ever trusting a client's idea of the current count, so neither
press can silently overwrite the other. Written up with the rejected
options in
[`decisions/0001-apply-deltas-not-counts.md`](decisions/0001-apply-deltas-not-counts.md);
`spec/tally.test.ts` fires two overlapping `+1` requests and asserts the
count moves by exactly 2. That test was written alongside `applyDelta`
rather than strictly before it, under real time pressure — but I confirmed
it actually fails if the delta-not-count decision is reverted, which is the
property it's meant to cover.

## Defining "good," then holding the build to it

`README.md`'s definition of good — one number, no accounts, forgiving of
simultaneity, never negative, survives a restart — came before the
Dockerfile or any other documentation, and `CLAUDE.md`'s rules are written
directly off that definition
([`cf7a850`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/cf7a850)).
The same commit replaces the starter's busybox placeholder Dockerfile with
a real multi-stage Node build, verified by actually running it: built the
image locally, ran it against a mounted volume standing in for Fly's
`/data`, restarted the container, and confirmed the count survived before
calling it done.

## Direction

Scoped the app myself — a one-number headcount for my own pod's crit room,
not a generic chat app, deliberately avoiding the median "multi-user
real-time" answer the brief warns about — chose the stack myself, and
worked through app → ADR → Dockerfile → docs in that order, so each later
artifact describes something already built and tested rather than
aspirational.

## Verifying it actually works

`pnpm build` then `node dist/server/entry.mjs` locally, curling `/`,
`/readme/`, `POST /api/tally`, and `GET /api/tally/stream` by hand; the
same build inside the real Docker image, including a container restart
against a mounted volume to check persistence; `pnpm check` (typecheck plus
`spec/tally.test.ts` and the supplied `spec/invariants.test.ts`) against
the running built app; `pnpm check:evidence` against this file.
