# Your harness

This file is yours, and it arrives empty on purpose. The rules you hold the
agent to are part of what gets marked, so they should be rules you decided on.

Nothing about the template is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the course website publishes the
[final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/).
What the agent needs to carry from any of it is your call.

## Rules for this app

These follow directly from what `README.md` says "good" means for Canberra
Sector. If a change would break one of these, stop and ask rather than silently
reinterpreting the brief.

1. **Identity comes only from the cookie, and only page renders mint it.**
   `/` and `/tower` set the httpOnly `uid` cookie; API routes and the live
   stream answer 401 without one, so a first visit can never create two
   identities at once. Pilot endpoints never accept a plane id: the plane is
   found from the cookie. The public id shown or logged is a hash of the
   cookie (`sha256(uid).slice(0, 8)`), never a prefix of the secret itself.
2. **Clients never send positions.** Only the simulation tick moves planes.
   Steering is a bounded delta (turn left/right, speed up/down), clamped
   server-side and rate-limited per cookie. Anything that looks like a client
   telling the server where a plane is gets refused, not accommodated.
3. **The tower can't act on its own plane, enforced in the SQL `WHERE`
   clause.** `owner != me` lives inside the same statement as the state change,
   never as a JavaScript check beforehand. This is a game rule, not security:
   a second browser is a second identity, and the README says so.
4. **Every write goes through `tx()`, and SQLite is the only state.** `tx` is
   `BEGIN IMMEDIATE`, try/catch to `ROLLBACK`, no `await` inside, and it throws
   on re-entry. Parse the request body before it, insert the event only when
   `changes === 1`, and broadcast only after commit. No in-memory copy of the
   planes outlives a tick. The database handle and the tick interval live on
   `globalThis` so dev reloads can't create a second of either.
5. **The only changes nobody asked for are the tick and the hold rule.** Both
   are logged with actor `system`. A silent owner's plane goes on hold; the
   system never deletes a plane. Abandonment is measured against uptime, and on
   boot every owner's last-seen time is reset, so waking from a Fly auto-stop
   can never look like everyone leaving.
6. **All broadcasts go through `src/lib/broadcast.ts`.** Pilot streams are
   filtered to 5 km server-side; the tower stream is unfiltered and public.
   Drop a client whose stream stops draining, and cap total and per-cookie
   streams, so one stalled or hostile tab can't grow memory.
7. **Cap what a free cookie can create.** Cookies cost nothing to mint, so
   per-cookie limits alone protect nothing: keep the global plane cap, the
   per-IP join cap, and the stream caps. Write a conflict to `events` on its
   rising edge only, and prune old events.
8. **POST with `content-type: application/json` only.** Whitelist airport codes
   and advisory phrases before they touch SQL. Render live state with
   `textContent`, never `innerHTML`.
9. **Persistence means a real restart test, not just "it's in a database."**
   Before calling a change to the database, the tick or the Dockerfile done,
   start planes flying, actually `docker restart` the container against a
   mounted volume, and confirm positions, headings, speeds and statuses
   survived. `DB_PATH` (`/data/atc.db`) is the whole persistence story; don't
   let it fall back to an in-memory default when the variable is unset.
10. **The look is phosphor: calm green on black, monospace.** Colour comes
    only from the `:root` tokens (`--bg`, `--phosphor`, `--dim`, `--amber`).
    Amber means "needs action" (a pending request, a conflict) and is always
    paired with a text label, never colour alone. Build the text (strips,
    request queue, conflict list) before the scope. Any animation is off under
    `prefers-reduced-motion`. Mobile-first at 375 px.
11. **Don't grow past "a text-first sector for one room."** No altitude, fuel,
    weather, crashes, chat, free-text radio or fifth airport. If a prompt asks
    for one, point back to "What this deliberately doesn't do" in `README.md`
    before building it.
12. **`pnpm check` and `pnpm check:evidence` are the gate, not a suggestion.**
    Don't report a change as done without both passing locally against a built
    app (`pnpm build`, then run `dist/server/entry.mjs`, per
    `spec/global-setup.ts`). Specs assert only on their own planes, never on
    global counts, and every plane a test creates leaves in `afterEach`.
