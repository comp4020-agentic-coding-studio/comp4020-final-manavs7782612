# How busy is the crit room?

A single shared number. Anyone with the link can press **+** when someone
walks into the COMP4020 crit room, or **−** when someone leaves. Everyone
looking at the page watches that number change live, with no reload.

## What good means here

This app is for one specific, small audience: the people in a pod during a
crit session, glancing at a phone to see whether the room is already full
before they walk over. That's it. It is not a chat app, not a profile system,
not a general "multi-user real-time" demo — the brief warns against building
the median answer to that prompt, and the way to avoid it is to pick a
use this small and actually mean it.

Given that audience, good means:

- **Legible at a glance.** One number, large, in the middle of the screen.
  No login, no name, no history to read before you understand the state.
- **Forgiving of simultaneity.** Two people in the room at once will press
  a button near-simultaneously. The app should never let one person's press
  erase another's — see [decisions/0001-apply-deltas-not-counts.md](decisions/0001-apply-deltas-not-counts.md)
  for how that's enforced, not just hoped for.
- **Honest about anonymity.** Nobody signs in, so "multi-user" here means
  "multiple open tabs acting on shared state," not "multiple accounts." The
  app doesn't pretend to know who pressed a button, and doesn't ask.
- **Doesn't go negative.** A room can't hold fewer than zero people. The
  count clamps at 0 rather than drifting into a number that means nothing.
- **Survives the boring failure modes.** A machine restart, a redeploy, or
  someone closing their laptop shouldn't lose the count — it's read back off
  disk, not held only in memory.

This take on "good" comes from two places in the [small web](https://ar.al/2020/08/07/what-is-the-small-web/)
tradition this course keeps pointing at: games built for a handful of people
in the same room (a single shared score, not a leaderboard with accounts),
and tools built for one workshop or one event rather than for the general
public (disposable, single-purpose, no onboarding).

## What this deliberately doesn't do

- **No accounts, no identity.** Anyone can press either button. For a dozen
  people in a room together, trust is cheaper than auth, and auth would be
  the first thing people notice as unnecessary friction.
- **No per-person history.** The last-20-changes list on the page shows
  *what* happened (a `+1` or `−1` and when), not *who* did it, because the
  app has no idea who did it and shouldn't invent an answer.
- **No undo.** A wrong press gets corrected by pressing the other button,
  the same way a real headcount would: someone notices and says "actually,
  one more."
- **No notion of "the room is full."** There's no capacity limit baked in —
  it's a tally, not a booking system. Adding one would be answering a
  question nobody asked.

## How it's built

Astro in SSR mode (`@astrojs/node`, standalone adapter), a `node:sqlite`
file for persistence, and one in-memory broadcaster pushing
[server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
to every open tab. One Fly.io machine, one volume — see `fly.toml` and the
`Dockerfile` for what that fixes. `CLAUDE.md` says what rules the build was
held to; `PROCESS.md` says how it actually went.
