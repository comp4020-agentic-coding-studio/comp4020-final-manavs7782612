# Your harness

This file is yours, and it arrives empty on purpose. The rules you hold the
agent to are part of what gets marked, so they should be rules you decided on.

Nothing about the template is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the course website publishes the
[final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/).
What the agent needs to carry from any of it is your call.

## Rules for this app

These follow directly from what `README.md` says "good" means for the crit
room tally. If a change would break one of these, stop and ask rather than
silently reinterpreting the brief.

1. **Never send or accept an absolute count from the client.** Every write
   to the tally is a `+1` or `-1` delta, applied server-side against whatever
   the server last wrote (`src/lib/db.ts`, `applyDelta`). This is the one
   documented multi-user decision — see `decisions/0001-apply-deltas-not-counts.md`
   — and it's load-bearing: an endpoint that accepted `{count: N}` would let
   two near-simultaneous presses silently undo each other.
2. **The count never goes negative.** Clamp at 0 in the same place deltas are
   applied, not in the UI.
3. **No accounts, no stored identity, no per-user anything.** Don't add a
   login, a name field, a cookie that tracks who made a change, or any
   schema column that implies the app knows who's using it. The README's
   anonymity claim has to stay true.
4. **Persistence means a real restart test, not just "it's in a database."**
   Before calling a change to `src/lib/db.ts` or the Dockerfile done, actually
   stop and restart the process (or container) and confirm the count is
   still right. node:sqlite plus the `/data` volume path (`DB_PATH`) is the
   whole persistence story — don't let it quietly fall back to an in-memory
   default when the env var is unset in a new environment.
5. **Real-time means push, not a faster poll, unless you change this file.**
   The SSE broadcaster in `src/lib/broadcast.ts` is the one fan-out path for
   count changes. New features that change shared state should broadcast
   through it rather than inventing a second channel.
6. **Don't grow the feature set past a headcount tally.** No capacity limit,
   no undo button, no per-change attribution, no chat. If a prompt asks for
   one of these, point back to the "what this deliberately doesn't do"
   section of `README.md` before building it.
7. **`pnpm check` and `pnpm check:evidence` are the gate, not a suggestion.**
   Don't report a change as done without both passing locally against a
   built app (`pnpm build` then run `dist/server/entry.mjs`, per
   `spec/global-setup.ts`).
8. **Keep the look Apple-ish: calm, soft, and consistent across pages.**
   The design language is set in `src/pages/index.astro` and mirrored in
   `src/pages/readme.astro` — a frosted `.card` (blur + translucency) on a
   soft radial-gradient background, `-apple-system` as the font stack, large
   tabular-numeral type for the count, fully-rounded buttons, and
   light/dark values both driven off the same `:root` custom properties (so
   dark mode is "pick new values for the variables," not a second
   stylesheet). New UI should reuse those variables and the `.card`
   pattern rather than inventing a new look per page. Motion should read as
   a spring (the `cubic-bezier(0.34, 1.56, 0.64, 1)` easing already used on
   the buttons and the count's pulse), not a linear fade — that bounce is
   the one bit of personality the design has, so don't flatten it out.
