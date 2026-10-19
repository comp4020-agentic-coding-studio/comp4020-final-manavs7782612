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

1. **A request can only ever change the presence of the identity its own
   cookie names.** `getOrSetUserId` (`src/lib/identity.ts`) is the only
   source of `userId` server-side; no API route accepts one from the request
   body. This is the one documented multi-user decision for crit 10 — see
   `decisions/0002-presence-identity-cookie.md` — and it's load-bearing: an
   endpoint that trusted a client-supplied id would let one visitor flip
   another's presence.
2. **The shared count is always derived, never stored directly.** It's
   `COUNT(*)` of present rows (`src/lib/db.ts`, `getCount`), so it can't drift
   from the presence rows that are the actual source of truth.
3. **Identity is anonymous but real: a random cookie, not an account.** No
   login, no name field, no password. The cookie exists only so the server
   can tell two visitors apart and enforce "you can only change your own
   presence" — it must not grow into anything that asks a person who they are.
4. **Every presence change is logged server-side, to stdout, and that log
   must persist past the crit.** `src/lib/log.ts`'s `logEvent` is the one
   place that happens; don't add a second, quieter path for state changes.
   `flyctl logs` is what the crit narrates from — a change that only shows up
   client-side doesn't count.
5. **Persistence means a real restart test, not just "it's in a database."**
   Before calling a change to `src/lib/db.ts` or the Dockerfile done, actually
   stop and restart the process (or container) and confirm presence and the
   count are still right. node:sqlite plus the `/data` volume path (`DB_PATH`)
   is the whole persistence story — don't let it quietly fall back to an
   in-memory default when the env var is unset in a new environment.
6. **Real-time means push, not a faster poll, unless you change this file.**
   The SSE broadcaster in `src/lib/broadcast.ts` is the one fan-out path for
   count changes. New features that change shared state should broadcast
   through it rather than inventing a second channel.
7. **Don't grow the feature set past "who's here right now."** No chat, no
   per-person profile, no history of more than the last-N log of
   arrived/left events. If a prompt asks for one of these, point back to the
   "what this deliberately doesn't do" section of `README.md` before
   building it.
8. **`pnpm check` and `pnpm check:evidence` are the gate, not a suggestion.**
   Don't report a change as done without both passing locally against a
   built app (`pnpm build` then run `dist/server/entry.mjs`, per
   `spec/global-setup.ts`).
9. **Keep the look Apple-ish: calm, soft, and consistent across pages.**
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
