# Democracy? — rules for the agent

The claim this app makes (README.md) is that who holds power and what passes is
exactly what the table voted, live for everyone, and never revisable. Every rule
below protects part of that claim. Break one and the app stops being true.

## Non-negotiable

1. **One guarded write resolves a round.** Resolution is an `UPDATE ... WHERE
   id = ? AND status = <expected> AND closes_at <= now` inside `tx()`, and the
   outcome (winner, yea/nay) is computed from `votes` inside that same
   transaction. Never trust a SELECT from earlier in the request for an outcome.
2. **The server owns the clock.** Every action re-reads the active round and
   checks `closes_at` against the server's `Date.now()`. Never accept a time,
   phase or round id from the client.
3. **No override path.** No admin route, no "skip", no "reset", no edit or
   delete of rounds, votes, candidates or events. The triggers in `db.ts`
   enforce this; never drop or weaken them, and never add a route that would
   need them dropped.
4. **Presenter-only tabling is structural.** The bill write's WHERE clause
   names `presenter_id`. Don't replace it with an `if` before the write.
5. **One vote per citizen per round**, by primary key, changeable only while
   the round is open.
6. **Tie-breaks are deterministic and documented** (decisions/). Never random.
7. **User text only reaches the page via `textContent`.** No `innerHTML` with
   anything a player typed.
8. **Strictly black and white.** Two colour tokens, `--ink` and `--paper`.
   No other colour anywhere, sprites included. Motion respects
   `prefers-reduced-motion`.

## Working agreements

- Every behaviour change gets a spec in `spec/` that runs against the running
  app (`pnpm start` in one terminal, `pnpm check` in another; use short windows
  via `ELECTION_SECS` etc.).
- A design judgement (tie-breaks, timing, what happens on silence) gets a short
  record in `decisions/`.
- README.md is the student's prose. Don't rewrite it; propose edits.
- No new runtime dependencies without asking: the image is plain `node:24`.
