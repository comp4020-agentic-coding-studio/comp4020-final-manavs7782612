# How busy is the crit room?

**Live:** https://comp4020-final-manavs7782612.fly.dev

A shared headcount. Open the link and the server hands your browser a random,
anonymous identity (an httpOnly cookie, no sign-in). Press **I'm here** when
you walk into the COMP4020 crit room, **I'm leaving** when you go. The shared
number is how many identities are currently marked present, and it updates
live for everyone watching, with no reload.

## What good means here

This app is for one specific, small audience: the people in a pod during a
crit session, glancing at a phone to see whether the room is already full
before they walk over. That's it. It is not a chat app, not a profile system,
not a general "multi-user real-time" demo — the brief warns against building
the median answer to that prompt, and the way to avoid it is to pick a use
this small and actually mean it.

Given that audience, good means:

- **Legible at a glance.** One number, large, in the middle of the screen,
  plus one button for your own state. No form, no history to read before you
  understand the state.
- **Tells people apart, server-side.** Crit 10 asks for real multi-user
  behaviour: the server, not the client, decides whose presence a request can
  change. See [decisions/0002-presence-identity-cookie.md](decisions/0002-presence-identity-cookie.md)
  for how that's enforced, not just hoped for — a request can only ever flip
  the presence of the identity its own cookie names.
- **Forgiving of simultaneity.** Two people acting at once never overwrite
  each other, because each one only ever changes their own row — see
  [decisions/0001-apply-deltas-not-counts.md](decisions/0001-apply-deltas-not-counts.md)
  for the crit 9 decision this builds on.
- **Honest about anonymity.** Nobody signs in and the app never asks who you
  are — the identity cookie exists only so the server can tell two browsers
  apart and enforce "you can only change your own presence."
- **Logs who did what, durably.** Every arrival or departure is logged
  server-side (to stdout, tailable with `flyctl logs`), with the visitor's
  short id, so a crit can be narrated from logs alone.
- **Survives the boring failure modes.** A machine restart, a redeploy, or
  someone closing their laptop shouldn't lose presence or the count — it's
  read back off disk, not held only in memory.

This take on "good" comes from two places in the [small web](https://ar.al/2020/08/07/what-is-the-small-web/)
tradition this course keeps pointing at: games built for a handful of people
in the same room (a single shared score, not a leaderboard with accounts),
and tools built for one workshop or one event rather than for the general
public (disposable, single-purpose, no onboarding).

## What this deliberately doesn't do

- **No accounts, no name, no real identity.** The cookie is a random id, not
  a login. For a dozen people in a room together, that's enough to enforce
  ownership without the friction of auth.
- **No one can change another visitor's presence.** That's the one
  permission rule this app enforces; nothing else needs a rule, because
  nothing else is shared, mutable state another person could touch.
- **No undo, no edit history beyond the log.** A wrong toggle gets corrected
  by toggling again, the same way a real headcount would.
- **No notion of "the room is full."** There's no capacity limit baked in —
  it's a headcount, not a booking system. Adding one would be answering a
  question nobody asked.

## How it's built

Astro in SSR mode (`@astrojs/node`, standalone adapter), a `node:sqlite`
file for persistence, and one in-memory broadcaster pushing
[server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
to every open tab. Identity is a random httpOnly cookie minted on first
visit; every write to shared state is scoped to the identity that cookie
names. One Fly.io machine, one volume — see `fly.toml` and the `Dockerfile`
for what that fixes. `CLAUDE.md` says what rules the build was held to;
`PROCESS.md` says how it actually went.
