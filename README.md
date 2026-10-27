# Canberra Sector

**Live:** https://comp4020-final-manavs7782612.fly.dev

A tiny air traffic control game for Canberra. Four town centres each have an
airport: Belconnen, Woden, Gungahlin and Majura. Open the link and the server
hands your browser a random, anonymous identity (an httpOnly cookie, no
sign-in). As a **pilot** you pick a start airport, get a callsign, ask for
takeoff and fly your plane on a circular radar map, steering with WASD. As the
**tower** (`/tower`) you clear takeoffs and landings and watch the whole sky.
Planes move continuously, so what you see a second ago is already wrong.

## What good means here

This is for one small audience: a pod of roughly 4 to 12 people in the same room,
playing for one afternoon. It is not a flight simulator and not a general
"multi-user real-time" demo. The brief warns against the median answer to that
prompt; the way out is to pick a use this small and mean it. Flight strips and
a green phosphor scope are how real controllers worked, and a circular radar
you fly with WASD, framed by a clean modern UI everywhere else, fits a room of
people glancing at phones without feeling like a spreadsheet.

Given that audience, good means:

- **You can see who is near you, live, in time to avoid them.** Planes move
  continuously, so a stale picture is a wrong picture. A conflict (two planes
  closer than 1.0 km) shows on both pilots' screens and the tower within about
  a second. Your scope shows planes within 5 km of you.
- **The tower is necessary.** No plane takes off or lands without a clearance,
  and one runway serves one plane at a time. Two clearances racing for the same
  runway never both succeed.
- **Only you can fly your plane.** No request can steer a plane its own cookie
  doesn't own, and clients never send positions: WASD and the on-screen buttons
  both just send "turn" and "speed up", and the server decides where the plane
  is.
- **The sky survives a restart.** A redeploy, a crash or Fly stopping the machine
  overnight brings every plane back where it was, heading and speed intact.
- **Legible as text, flyable as a map.** Flight strips, a request queue and a
  conflict list carry the whole state in words. The circular radar is a glance
  aid and the actual control surface for a pilot's plane, and the app stays
  playable with it hidden.
- **Logs who did what, durably.** Clearances, advisories, conflicts and denials
  go to stdout (tailable with `flyctl logs`) and to an events table, so a session
  can be narrated afterwards.

This take on "good" comes from two places in the
[small web](https://ar.al/2020/08/07/what-is-the-small-web/) tradition this
course keeps pointing at: games built for a handful of people in the same room,
and tools built for one workshop or one event rather than the general public
(disposable, single-purpose, no onboarding). The text-first strip board follows
real practice, where controllers ran traffic on paper flight strips.

## What this deliberately doesn't do

- **No altitude, weather, fuel, crashes or real aviation physics.** Planes fly at
  a constant heading and one of three speeds. Getting too close raises an
  alert and a log line; nothing explodes.
- **No accounts, no names, no chat, no free-text radio.** The cookie is a random
  id. The tower sends one of a few fixed advisory phrases, never free text.
- **No more than four airports**, all in Canberra.
- **No security boundary around who sees what.** `/tower` and its live stream are
  public on purpose. The 5 km pilot view and the rule that the tower cannot
  clear its own plane are game rules for a friendly room, not access control: a
  second browser is a second identity.
- **No system deleting your plane.** If a pilot disconnects for a minute their
  plane is put on hold, and it stays on hold until they return. It is never
  removed by a timer.
- **The sky pauses while the server sleeps.** Fly stops the machine when nobody
  is connected, and planes don't fly while it is stopped. They resume where they
  were.
- **A plane waiting for landing clearance waits for a human.** If nobody opens
  `/tower`, it keeps waiting.

## How it's built

Astro in SSR mode (`@astrojs/node`, standalone adapter), a `node:sqlite` file
for all state, and one in-process simulation tick (4 times a second) that moves
the airborne planes. Positions are written to the database on every tick, so
persistence is exact to the last tick. State changes are pushed to every open
tab over
[server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events);
steering (WASD or buttons) and clearances are plain POSTs. The UI is a modern
SaaS theme everywhere except the radar, which keeps the original green
phosphor-on-black look, drawn circular with a plane icon per flight. One
Fly.io machine, one volume: see `fly.toml` and the `Dockerfile` for what that
fixes. `CLAUDE.md` says what rules the build is held to; `PROCESS.md` says how
it actually went; `decisions/` holds the reasoning behind the big calls.
