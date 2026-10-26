# 0003: The server owns every position; clients only send steering intents

## Status

Accepted.

## Context

Canberra Sector is only worth building as a multi-user real-time app if the
real-time is necessary, not decorative. Planes that move continuously make it
necessary: you can only avoid another plane if you can see where it is *now*, so
a stale picture is a wrong picture. That also makes the central design question
sharper than it was for the crit-room tally. Several people act on one shared,
moving world at once, and the server has to decide whose picture is true.

The failure to design against is a client telling the server where its plane is.
Anything a client can write, a client can lie about: teleporting, flying through
the 1 km separation limit, or moving someone else's plane.

## Options considered

1. **Clients report their own position.** Simplest to build and smoothest to
   steer, but the server can only trust or reject numbers it didn't compute.
   Rejected: it makes "only you can fly your plane" unenforceable.
2. **Discrete commands only (request a route, tower clears it).** Safe and
   small, but real-time stops being necessary: nothing depends on seeing a change
   within a second. Rejected after the student chose live steering for exactly
   this reason.
3. **An in-memory simulation with periodic checkpoints to SQLite.** Fast, but
   there are now two copies of the truth. A crash loses everything since the last
   checkpoint, which breaks the persistence promise. Rejected.
4. **Server-authoritative tick, SQLite as the only state (chosen).** Clients
   send intents ("turn right 15 degrees", "speed up one step"). A 4 Hz tick
   reads the airborne planes, integrates their motion and writes them back inside
   one transaction.

## Decision

Option 4.

- Clients send intents only, never a position. The server clamps heading to
  0 to 359 and speed to three fixed steps, and rate-limits steering per cookie.
- Every write goes through one `tx()` helper (`BEGIN IMMEDIATE`, rollback on
  error, no `await` inside). With one Node process and one `DatabaseSync` handle
  the tick and the request handlers can't interleave inside a transaction.
- Positions are written every tick, so persistence is exact to the last tick: a
  restart loses at most 250 ms of motion. Elapsed time per tick is capped at
  0.5 s, and the first tick after boot uses zero, so waking from a Fly auto-stop
  never teleports a plane.
- **Runways are a hard rule, separation is a soft one.** One clearance per
  runway is enforced by a partial unique index, so two racing clearances can't
  both succeed. Getting within 1.0 km of another plane raises a conflict alert
  and a log line, but nothing is destroyed.
- **SSE for push, plain POST for commands.** A 4 Hz broadcast and steering at a
  few requests a second don't need WebSockets, and SSE is already proven in this
  repo. Each commit also broadcasts straight away rather than waiting for the next
  tick, so a steer reaches other screens in tens of milliseconds, not 250.
- **The tower is open to anyone, and says so.** `/tower` and its stream are public.
  The rule that the tower can't clear its own plane, and the 5 km pilot view, are
  game rules for a friendly room, not access control. The README states this.
- **The system never deletes a plane.** An owner who has been silent for a minute
  has their plane put on hold; it resumes when they return. Abandonment is measured
  against uptime, and every owner's last-seen time is reset at boot. Otherwise a
  wake from auto-stop looks like everyone leaving at once, and the next-day
  persistence check finds an empty sky.

## What it costs

- A tick loop and continuous state are much more machinery than discrete
  commands. They are bounded by a global plane cap of 24, stream caps, and the
  tick skipping its work when nobody is connected or nothing is flying.
- The sky pauses while the machine sleeps. That is deliberate: simulating flight
  with nobody watching would just burn the Fly budget.
- A cookie is free to mint, so per-cookie limits protect nothing on their own.
  The global caps and a per-IP join cap are what actually bound abuse.
- This holds together only on exactly one Fly machine with one SQLite file
  (`fly.toml` fixes this). A second machine would run a second tick against its
  own copy of the world.
- A plane waiting for landing clearance waits for a human. With nobody on
  `/tower` it keeps waiting, and the README says so.

## How it's checked

`spec/atc.test.ts` drives separate cookie jars against the running app:
steering moves only your own plane, the tower gets a 403 on its own plane, two
racing landing clearances at one runway give exactly one 200, a conflict reaches
both pilots' streams, a pilot stream omits planes beyond 5 km, and a steer is seen
on a second stream in under a second. The restart claim is checked by hand with
`docker restart` against a mounted volume, as `CLAUDE.md` rule 9 requires.
