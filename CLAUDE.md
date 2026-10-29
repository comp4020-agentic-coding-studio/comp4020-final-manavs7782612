# Your harness

This file is yours, and it arrives empty on purpose. The rules you hold the
agent to are part of what gets marked, so they should be rules you decided on.

Nothing about the template is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the course website publishes the
[final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/).
What the agent needs to carry from any of it is your call.

## Rules for this app

These follow directly from what `README.md` says "good" means for Slotlock.
If a change would break one of these, stop and ask rather than silently
reinterpreting the brief.

## Non-negotiable (never do this, ever, no exceptions)

1. **A slot claim never succeeds if the driver's remaining hours are less
   than the slot's duration plus its configured transit buffer.** This
   check runs server-side, inside the same guarded `UPDATE` statement that
   would lock the slot — never client-side only, never as a warning the
   user can dismiss, never as a check followed by a separate write.
2. **Two concurrent claims on the same slot never both succeed.** The
   slot-open check and the driver's-hours check are both conditions inside
   one `UPDATE ... WHERE ...` statement, guarded by `tx()`. That race —
   check-then-write with a gap in between — is exactly what this app
   exists to close, so an app-level "read, decide, then write" pattern is
   never an acceptable shape for a mutator here.
3. **No UI path (admin override, "force book," edit flag) ever lets a
   non-compliant booking through.** If a future prompt seems to need one,
   stop and raise it with the user before building it — it would
   contradict the README's central claim.
4. **An audit log entry is never edited or deleted, by any role, including
   an admin.** Append-only means append-only in the schema and the
   application code: no route, no helper, no migration path ever issues
   `UPDATE` or `DELETE` against the `events` table. `/api/events` exports
   `GET` only; there is no handler for any other method on that route.

## Judged, not enforced — implement as a default, not a lock

5. Which driver to suggest on reassignment is a ranked recommendation
   (soonest compliant availability first). The dispatcher can pick any
   compliant driver from the list, including one not ranked first.
6. Dock appointment window length and the fixed dock/roster lists are
   configuration in source, not something a UI role can edit live.

## Identity and sessions

7. **Dispatchers and drivers are real, attributable identities, logged in
   with name + PIN against the seeded roster in `src/lib/roster.ts`** — not
   anonymous cookies. No session is minted by a bare page render; login is
   an explicit `POST /api/login`. The consumer dock view (`/dock`) needs no
   identity at all and shows no names or PII, only fill status.
8. Every mutating API route reads the actor from the session, never from a
   request body field naming "who did this." A body that tries to claim a
   slot on someone else's behalf is a structural rejection, not a trust
   decision.

## Persistence and writes

9. **Every write goes through one `tx()` helper, and `node:sqlite` is the
   only state.** `tx` is `BEGIN IMMEDIATE`, try/catch to `ROLLBACK`, no
   `await` inside, and it throws on re-entry. Parse the request body before
   calling it, insert the audit event only when the guarded statement's
   `changes === 1`, and broadcast only after commit. The database handle
   lives on `globalThis` so a dev reload can't create a second one.
10. **Persistence means a real restart test, not just "it's in a
    database."** Before calling a change to the schema or a mutator done,
    actually `docker restart` the container against a mounted volume and
    confirm every slot's status, lock owner and the full audit history
    survived exactly. `DB_PATH` is the whole persistence story; don't let
    it fall back to an in-memory default when the variable is unset.

## Real-time and transport

11. **SSE for push, plain POST for commands** — not WebSockets. All
    broadcasts go through one `broadcast.ts`, filtered per role
    (`dispatcher` gets the full board and audit feed; `driver` gets their
    own slot plus the open slots they're compliant for; `consumer` gets
    dock fill status only). A client whose stream stops draining is
    dropped, and total/per-session stream counts are capped.

## Input handling and rendering

12. **POST with `content-type: application/json` only, strict body
    parsing.** An unknown key in a request body is a 400, not something
    quietly ignored. Render live state with `textContent`, never
    `innerHTML`.

## Styling

13. **A safety/compliance amber accent, text-first layout, mobile-first at
    375px.** There is no map or radar in this app; the board, slot cards
    and audit log carry the whole state in words. `--warn` means "needs
    action" (a pending claim conflict, a rejection) and is always paired
    with a text label, never colour alone. Any animation is off under
    `prefers-reduced-motion`.

## When a correction happens

14. If a mistake in the hours-calculation logic or claim-locking is caught
    and fixed, the fix must land as a new `spec/` check (regression test)
    and a one-line note in `PROCESS.md`, not just a silent re-attempt in
    the same commit.

## The gate

15. **`pnpm check` and `pnpm check:evidence` are the gate, not a
    suggestion.** Don't report a change as done without both passing
    locally against a built app (`pnpm build`, then run
    `dist/server/entry.mjs`, per `spec/global-setup.ts`). Specs assert only
    on their own slots and drivers, never on global counts, and every
    session a test creates leaves in `afterEach`.
