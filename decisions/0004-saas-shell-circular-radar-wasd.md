# 0004: Split the theme in two, make the radar circular, add WASD on top of the existing steer intent

## Status

Accepted.

## Context

The original look (decision-free phosphor green-on-black, everywhere, per the
first cut of `CLAUDE.md` rule 10) read as a retro terminal, including on the
panels that carry the flight strips, request queue and conflict list — the
parts `README.md` calls "legible as text" and leans on hardest. A pod member
skimming on a phone has to read those panels fastest, and low-contrast green
monospace on near-black is not what reads fastest. Separately, the rectangular
SVG scope didn't read as "a radar" at a glance, and steering only by buttons
left the "live, moving sky" feeling more like a form than a game.

None of this touches what decision 0003 established: the server still owns
every position, clients still send bounded intents, and `/api/pilot/steer`
still only accepts `{ turn, speed }` each in `{-1, 0, 1}`.

## Options considered

1. **Reskin the whole app in a SaaS theme, including the radar.** Simplest
   CSS, but it throws away the one place "phosphor scope" actually earns its
   keep: a radar is recognisable as a radar partly *because* it's green on
   black. Rejected.
2. **Keep one global theme, add a `.scope-dark` override just for colours.**
   Cheaper to write than scoping an entire token set, but every current
   `svg.scope .foo { fill: var(--dim) }` rule would need a second, parallel
   rule instead of just a different value for `--dim`. More CSS to keep in
   sync, not less. Rejected.
3. **Two complete `:root`-shaped token sets, the old one redeclared inside a
   `.radar-frame` wrapper (chosen).** The SaaS tokens (`--surface`, `--text`,
   `--accent`, `--warn`, ...) live at `:root`. The original phosphor tokens
   (`--bg`, `--phosphor`, `--dim`, `--faint`, `--line`, `--amber`) are
   redeclared, unchanged in value, on `.radar-frame`. Every existing
   `svg.scope` rule still reads `var(--dim)` etc. and keeps working without
   being rewritten — only which value those names resolve to changes, by CSS
   custom property scoping.
4. **For the map: replace steering with client-reported heading/position
   (true "move the plane with the keyboard").** Would need new server
   validation to not regress decision 0003's core guarantee. Rejected: a
   WASD-driven *intent* reuses the exact contract that's already rate-limited,
   clamped and tested.
5. **For the map: WASD sampled on an interval, mapped to the same `turn`/
   `speed` deltas the buttons send (chosen).** Held-key state is read every
   200 ms (close to the 250 ms sim tick) and, if non-neutral, sent as one
   `POST /api/pilot/steer` body — the same shape and the same endpoint a
   button click already produces. The server cannot tell a WASD-driven steer
   from a button-driven one, and doesn't need to.

## Decision

Options 3 and 5.

- `public/atc.css`: SaaS tokens at `:root`; the phosphor set reapplied inside
  `.radar-frame`, which also makes the frame a circle (`border-radius: 50%`,
  `aspect-ratio: 1/1`, `overflow: hidden`).
- `public/scope.js`: the `viewBox` is now a square centred on the sector's
  midpoint, radius the sector's half-diagonal (with a small pad) so the whole
  rectangular world always fits inside the circle; a `<clipPath>` circle
  clips the sector rect and all live content so nothing draws outside the
  disc; a few decorative concentric rings are drawn for the classic radar
  look. Each flying plane is now a small rotated triangle (`<path>`, nose =
  heading) instead of a plain dot, so heading is visible on the icon itself,
  not only via the separate heading line.
- `public/pilot.js`: a `keydown`/`keyup` listener tracks held `KeyW/A/S/D`
  (ignoring modifier keys and focus inside inputs/buttons/selects, clearing on
  blur/tab-hide to avoid stuck keys), sampled by a 200 ms interval that calls
  the same `act("/api/pilot/steer", {...})` helper the buttons already use.
  A/D set `turn: -1/1` (both held cancels), W/S set `speed: 1/-1` (both held
  cancels). The buttons are kept, unchanged, as the touch/accessibility path
  for the identical action.
- `CLAUDE.md` rules 10 and 11 rewritten to describe this split-theme,
  radar-as-controller shape as the standing rule, not an exception to it.

## What it costs

- Two token sets to keep straight instead of one; a future colour change has
  to pick which set it belongs to. Mitigated by the sets never overlapping in
  name and the radar one only ever being declared in one place
  (`.radar-frame`).
- WASD adds a second input path to the same endpoint, so steering now has two
  call sites in `pilot.js` instead of one. Both go through the same `act()`
  helper and the same server-side rate limit (`src/lib/limits.ts`), so the
  server's guarantees are unchanged; the risk is purely "two places to keep
  in sync" in the client, which the shared `act()` call keeps small.
- The circular clip means the extreme corners of the rectangular sector are
  visually tucked into the disc rather than flush with an edge — a glance aid
  trade accepted because the text panels (strips, nearby list, runway list)
  remain the complete, exact source of truth, per rule 10.

## How it's checked

No server contract changed, so `spec/atc.test.ts`'s steering, conflict and
rate-limit checks exercise the same `/api/pilot/steer` body shape WASD now
also produces, and keep passing unmodified. `spec/invariants.test.ts` still
reads `README.md`'s headings against `/readme/`, which are unchanged by the
prose edits in this pass. Manually: holding `A`/`D`/`W`/`S` while airborne
moves the strip's HDG/SPD and the plane icon turns to match; flying toward a
sector edge stops at the boundary (the existing clamp in
`src/lib/geometry.ts`'s `advance()`), which reads as the plane icon sliding
along the inside of the circle rather than leaving it.
