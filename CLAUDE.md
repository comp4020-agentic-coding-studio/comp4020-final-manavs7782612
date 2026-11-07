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

## Timing (`src/lib/config.ts`) — read once at boot, never from the client

All windows configurable via env (`*_SECS`), clamped to a sane range; defaults:

- `ELECTION_MS` = 30s — declare + vote on a Presenter, one window.
- `DRAFT_MS` = 60s — the elected Presenter writes the bill.
- `VOTE_MS` = 25s — starts the instant the bill is tabled, fixed length
  regardless of how early/late tabling happened (decisions/003 — this is why
  drafting and voting are separate windows, not one).
- `GRACE_MS` = 0.5s — a disconnected citizen keeps their seat this long before
  it's released to the gallery, earliest joiner first (`seatGallery()` in
  `game.ts`); their row, candidacy and votes are never touched by
  disconnecting (decisions/004).
- `SEATS` = 8. Beyond that, citizens watch from the gallery.
- Ties: earliest declarer wins, then lowest citizen id — never random
  (decisions/002). No candidates → election lapses immediately. Tied bill →
  fails. Silent Presenter → bill round resolves `failed`, 0–0. Empty table →
  no new rounds open while nobody is connected.

Changing a window means changing `config.ts`, not hardcoding a number at the
call site — the snapshot reports these values to clients so the countdown UI
stays correct.

## Theme (`public/style.css`) — strictly two tokens

`--ink` / `--paper`, swapped wholesale in dark mode (`prefers-color-scheme`,
or `data-theme="dark"` override). No other colour, anywhere, including
sprites — rule 8. Monospace font stack, 2px borders, 0 border-radius, no
shadows. Motion (`bob`, `jump`, `climb` keyframes) is disabled entirely under
`prefers-reduced-motion: reduce`. Don't add a third colour for "just this one
status badge" — express state (e.g. presenter/candidate) via border style
(`dashed`, `double`) or the ink/paper swap, as the existing chair/seat rules do.

(`dist/client/app.css` is a stale build artifact from an earlier, unrelated
project — ignore it; it is not this app's theme.)

## Logging (`src/lib/log.ts`)

One JSON line per governance event to stdout via `logEvent()`: `{ at:
<ISO timestamp>, ...fields }`. This is the permanent, human-inspectable audit
trail once `flyctl logs` captures it — every round transition, vote and bill
should go through `logEvent`, not a bare `console.log`, so the record stays
structured and greppable. `console.error`/`console.log` outside `log.ts` are
for process-level events only (uncaught errors, "listening on :PORT").

## Working agreements

- Every behaviour change gets a spec in `spec/` that runs against the running
  app (`pnpm start` in one terminal, `pnpm check` in another; use short windows
  via `ELECTION_SECS` etc.).
- A design judgement (tie-breaks, timing, what happens on silence) gets a short
  record in `decisions/`.
- Don't rebuild a list's DOM nodes (`replaceChildren`, innerHTML swap, etc.) on
  every snapshot push just because one arrived — the server pushes once a
  second to keep countdowns honest, whether or not anything changed, and
  rebuilding under a reader selects/scrolls out from under them. Compare a
  cheap signature (e.g. length + newest id) against what's rendered and skip
  the rebuild when it hasn't moved, as `renderRecord` does in `app.js`.
- README.md is the student's prose. Don't rewrite it; propose edits.
- No new runtime dependencies without asking: the image is plain `node:24`.
- Every deterministic, testable part of this project gets a test in `spec/`:
  pure functions (`markdown.render`, `config.ts`'s `seconds` parsing/clamping,
  tie-break and outcome logic in `game.ts`) get direct unit tests that import
  the module, no running app needed; anything that only shows up through
  behaviour (routes, triggers, timing) gets an HTTP spec like the existing
  ones in `spec/`. Don't leave a deterministic rule in this file unbacked by a
  test — if you can state the expected input/output, write it down as a test.
