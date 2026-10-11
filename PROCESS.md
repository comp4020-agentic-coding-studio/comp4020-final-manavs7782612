# Process overview

## Stack, chosen deliberately

Week 9 is where the final-project repo gets created and the stack gets picked
for the whole run through to A3, so it had to be one I could justify, not just
the default. I went with Astro in SSR mode
([`1df5972`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/1df5972)):
the published crit specs from week 2 onward already assume it, and the
`@astrojs/node` standalone adapter gives a single self-contained server
process — which matters because this app's one real architectural decision
(below) depends on there being exactly one process holding the count, not a
pool of workers that could race each other.

For storage I used `node:sqlite`'s `DatabaseSync` rather than reaching for
`better-sqlite3` or a hosted database. It's stable and unflagged on the
Node version this repo already pins, needs no native compile step (no
`allowBuilds` entry, no prebuilt binary to ship), and a flat file is the
right amount of database for one integer and a change log.

## Building the actual feature

The headcount tally itself —
[`053a7e6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/053a7e6)
— came together as: a `db.ts` module owning reads/writes against sqlite, a
`broadcast.ts` module holding the set of open SSE connections, two API
routes (`POST /api/tally` to change the count, `GET /api/tally/stream` to
receive it), and one SSR page wiring a `+`/`−` UI to both.

The one thing crit 9 asks every final project to decide and defend is how the
app behaves when more than one person acts on shared state at the same
moment. For this app that's: what happens when two people in the crit room
press `+`/`−` close enough together to overlap. I chose to have the server
apply a *delta* against its own last-written count, in one synchronous
operation, rather than ever trust a client's idea of the current count — so
neither press can silently overwrite the other. That's written up properly,
with the options I didn't take and why, in
[`decisions/0001-apply-deltas-not-counts.md`](decisions/0001-apply-deltas-not-counts.md),
and `spec/tally.test.ts` fires two overlapping `+1` requests and asserts the
count moves by exactly 2 — the test that decision has to keep passing.

I did not write that test first and watch it fail before writing
`applyDelta` — the realistic account is that I built the feature and the
test for its one risky property in the same pass, under real time pressure
the night before the crit-9 cutoff, and checked the test actually fails if I
revert the delta-not-count decision (swapping `applyDelta` for a version
that accepts an absolute count from the client makes that test fail
immediately, which is the property I actually wanted covered).

## Defining "good," then holding the build to it

Before touching the Dockerfile or writing documentation, I wrote
`README.md`'s definition of good for this specific app — one number, no
accounts, forgiving of simultaneity, never negative, survives a restart —
and then wrote `CLAUDE.md`'s rules directly off that definition, so later
prompts in this repo are held to a standard I set deliberately rather than
a generic one
([`cf7a850`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/cf7a850)).
The same commit replaces the starter's busybox placeholder Dockerfile with a
real multi-stage Node build. I didn't just trust that it worked: I built the
image locally with Docker, ran it with a mounted volume standing in for
Fly's `/data` mount, restarted the container, and confirmed the count was
still there before calling that commit done.

## Direction, grounding and correction

I'm doing this in one sitting the night before the crit-9 cutoff, having
missed the work for weeks 8 and 9 up to this point — so the honest account
of "direction" here is: I scoped the app myself (a one-number headcount for
my own pod's crit room, not a generic chat app — picked specifically because
the brief warns against the median "multi-user real-time" answer), chose
the stack myself, and worked through the app, the ADR, the Dockerfile and
this file in that order on purpose, so each later artifact describes
something that was already real and already tested rather than something
aspirational.

The one correction worth recording: earlier in this session the agent
started working in a different student's final-project repo entirely
(a name-matching mistake between a pod label and a GitHub handle). I caught
it before anything from that repo made it into this one, and the agent
re-grounded in `comp4020-final-manavs7782612` — this repo — from scratch.
Nothing from that other repo was copied here.

## Verifying the whole thing actually works

Before calling any of this done I ran it, not just built it: `pnpm build`
then `node dist/server/entry.mjs` locally, curling `/`, `/readme/`,
`POST /api/tally`, and `GET /api/tally/stream` by hand; then the same build
inside the real Docker image, including a container restart against a
mounted volume to check persistence; then `pnpm check` (typecheck plus
`spec/tally.test.ts` and the supplied `spec/invariants.test.ts`) against the
running built app, and `pnpm check:evidence` against this file.
