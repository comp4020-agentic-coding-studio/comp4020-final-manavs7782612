# Process overview

## The pivot, and why

Crits 9 and 10 produced a working crit-room headcount, graded as such. For the
final project I replaced it with Canberra Sector: a text-first air traffic game
with an airport in Belconnen, Woden, Gungahlin and Majura, pilots who steer
live, and an open tower that clears takeoffs and landings. The reason was a
test I could apply to my own idea: could someone act correctly without seeing a
change within a second? In the headcount, mostly yes. In a sky where planes
move, no. Real-time had to be necessary, not decorative.

That came from pushing on the design in two rounds. First I asked what makes
real-time necessary rather than an afterthought, and gave the example of not
being able to take a route because it is in use; the agent turned that into
corridors and runways as contested resources. Then, reviewing the written plan,
I commented that real-time needed to be more apparent, and asked whether live
steering of the plane would make the system justifiable. I chose it knowing
it adds a tick loop, continuous state and a bigger attack surface. The agent also made two wrong claims early on and caught both
itself when it came to write the plan: it described a successful guarded UPDATE
as changing zero rows (it is one), and proposed holds that expire on a timer,
which would change state with no broadcast and contradict the real-time
requirement. I only learned of them because it said so; had it not, the plan
would have carried both errors into the code.

## Where I steered, and where I didn't

My calls were about scope and what counts as necessary: Canberra only, four
airports, mostly text with a green-and-dots radar, the tower open to anyone, and
real-time that has to matter. I also asked for logic simple enough not to open
vulnerabilities, which is why occupancy is derived rather than stored and every
write is one guarded statement. The agent proposed the mechanics (the tick,
intents-only steering, the caps). I didn't write the SQL, so I leaned on the
spec and the mutation check below to know it does what the README claims.

## Stack

Astro SSR with the Node standalone adapter, `node:sqlite`, server-sent events
for push, plain POSTs for commands. One process matters: the 4 Hz simulation
tick and every request handler share one SQLite handle and cannot interleave
inside a transaction. SQLite is the only state, so a restart loses at most one
tick. The reasoning, with rejected options (client-reported positions, discrete
commands, an in-memory sim with checkpoints), is in
[`decisions/0003-server-authoritative-steering.md`](decisions/0003-server-authoritative-steering.md)
([`5243eb0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/5243eb0)).

## Defining "good" first, then the harness

Before any code, the README's definition of good and twelve CLAUDE.md rules
were committed
([`b432711`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/b432711)):
clients never send positions, the tower's ownership check lives inside the SQL
WHERE clause, every write goes through one `tx()`, nothing but the tick and a
logged hold rule changes state unprompted, and a real `docker restart` is
required before calling persistence done. The README also lists what the app
deliberately doesn't do, including that the tower and its stream are public and
the 5 km view is a game rule, not security.

## Reviewing the design before building it

I had a separate agent attack the plan twice, because an agent that designed
something is poor at breaking it. The first pass (corridor design) found that a
throw between BEGIN and COMMIT would wedge the shared connection for everyone,
that callsigns would run out, and that tests would block each other. The second
pass (steering) found the one that mattered most: after a Fly auto-stop, every
owner looks absent, so an abandonment rule that deletes planes would empty the
sky overnight and fail the next-day persistence check. Abandonment became
hold-only, measured against uptime. It also showed per-cookie limits protect
nothing because cookies are free, so I added global plane, per-network and
stream caps. The second review first died on a network error and returned
nothing; I re-ran it rather than assume it had passed.

## Spec before code

The spec was committed before the implementation
([`0f6c712`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/0f6c712)),
then the server
([`c79ea55`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/c79ea55)),
then the pages
([`cc18dbd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/cc18dbd),
[`1cf343d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/1cf343d)).
It drives separate cookie jars against the running app and checks: steering
moves only your own plane, the tower gets 403 on its own plane, two racing
landing clearances at one runway yield exactly one 200, a conflict reaches both
pilots and the tower, a pilot stream omits planes beyond 5 km, and a steer
reaches a second stream in under a second. Tests assert only on their own
planes and clean up after themselves, because the sky is shared.

## Verifying it actually works

`pnpm check` passes 17 tests against the built app. One failure was a wrong
assumption in my spec, not the app: Astro's own origin check answers form-type
bodies with 403 before my route's 415, so the spec now pins both.

To check the spec can fail, I temporarily removed the `owner != ?` condition
from the tower UPDATEs, rebuilt, and confirmed the ownership test failed with
"expected 200 to be 403". I restored the file and confirmed a clean diff.

For persistence I built the Docker image, ran it against a mounted volume,
flew two planes with different headings and speeds, ran `docker restart`, and
compared the first snapshot after boot with the state before: both planes
matched, with status, heading and speed identical and 0.000 km moved. I also
screenshotted the tower, pilot and About pages at 390 px and 1100 px wide:
no horizontal overflow, and amber appears only on pending requests and
conflicts, always with a text label.

## What isn't proven yet

Steer-to-seen measured 1 ms, but on localhost, not across Fly. Nothing is
merged or deployed yet. I haven't done the two-browser-profile pass or the
next-day check on the live URL. The one-minute hold rule is a documented manual
check, not an automated test. Until those are done I don't claim them.
