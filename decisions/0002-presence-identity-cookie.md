# 0002: Tell visitors apart with a random identity cookie, enforce ownership server-side

## Status

Accepted.

## Context

Crit 10 requires the app to be genuinely multi-user: two or more people, each
in their own browser, act on shared state, and the server — not the client —
tells them apart and enforces who may change what. The crit 9 design
(decision 0001) deliberately kept the tally anonymous: anyone could press `+`
or `−`, and the server had no notion of "who." That's no longer sufficient:
without an identity, there's nothing to enforce a permission boundary against,
and nothing a log line could honestly call "who."

The shape of the app also had to change, not just add an id. A plain `+/-`
counter has no natural owner for a press — "whoever happens to walk in"
isn't a thing the server can check. Presence does: each visitor has exactly
one thing they can truthfully claim about themselves ("I am here" / "I am
not"), and the shared count becomes how many such claims are currently true.

## Options considered

1. **Login (username/password or OAuth).** Gives real identity and a natural
   permission boundary, but is a login system for a crit-room headcount —
   onboarding friction and scope the brief doesn't ask for, and overkill for
   "tell two browser sessions apart."
2. **Anonymous random identity cookie, issued on first request, httpOnly.**
   No sign-in, no name collected. The server mints a UUID the first time a
   browser shows up with no `uid` cookie, and every later request from that
   browser carries the same one. Enough to tell visitors apart and to write
   "who did what" without ever learning who anyone actually is.
3. **Client-generated id, sent in the request body.** Rejected immediately:
   a client could claim any id, including someone else's, which defeats the
   entire point of a server-enforced permission check.

## Decision

Option 2. `getOrSetUserId` (`src/lib/identity.ts`) reads the `uid` cookie or
mints one, httpOnly so client JS can't read or forge it. Every write to
shared state — `POST /api/presence` — derives `userId` from that cookie, not
from the request body (`src/pages/api/presence.ts`): the only thing a request
can say is "set *my* presence to true/false." Two browsers (two Chrome
profiles, or incognito) each get their own `uid` on first load and can only
ever change their own row in `presence` (`src/lib/db.ts`). The shared count
is derived (`COUNT(*) WHERE present = 1`), so it can't drift from the
presence rows that are its real source of truth. Every change is logged
server-side with the visitor's short id, the action, and the resulting count
(`src/lib/log.ts`), to stdout, which `flyctl logs` can tail live and which
outlives the request that produced it.

## What it costs

- Identity here means "same browser, same cookie," not a verified person —
  clearing cookies or opening a new incognito window gets a new, distinct
  identity. That's the intended trade for a crit-room app: good enough to
  enforce "you can only change your own presence" and to tell two
  simultaneous users apart in logs, without building accounts.
- As with decision 0001, this only holds together on exactly one Fly machine
  with one SQLite file (`fly.toml` fixes this); a second machine would need a
  shared session/identity store.

## How it's checked

`spec/presence.test.ts` drives two independent cookie jars against the
running app and asserts: each can set their own presence independently, each
only ever sees their *own* identity able to change its own row (toggling one
jar's presence never moves the other's), and the shared count reflects both.
