# Process overview

## What was built, and why

ComplyLogic is an evidence record and compliance dashboard for a delivery's
Chain of Responsibility (CoR). A consignor, loader, driver and receiver
confirm a fixed sequence of status steps (loaded, restrained, departed,
delivered) that can never be skipped or confirmed by the wrong party.
Every confirmation and blocked attempt is append-only, with an optional
note and photo, feeding a per-delivery evidence pack. On top of that, a
manager role sees every delivery and a live compliance dashboard: a
missed legal deadline (a dock slot nothing was confirmed against) is
detected automatically and raised as an incident a manager must resolve
with a structured cause, any rearranged time, and any penalty pay — and a
real rest-period gate, separate from the existing hours cap, blocks
reassigning a driver until they've actually had 7 continuous hours off.

This is the third shape this repo has taken, each pivot driven by
checking a claim against evidence rather than by taste: a crit-room
tally, then Canberra Sector (an ATC simulation, abandoned before a final
checkpoint,
[`f319211`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/f319211)),
then Slotlock (a dock-slot booking tool enforcing a driver-hours gate,
shipped and deployed,
[`1c26ef4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/1c26ef4)..[`364313a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-manavs7782612/commit/364313a)).
Slotlock's guarded-write pattern is exactly what ComplyLogic reuses. The
agent was first asked for a harder version of Slotlock — seamless
multi-party chat with a deadline timeline — but checked that against the
market first and found the gap too thin (AgriChain already does a joint
sign-off; Kynection/Allotrac/EROAD already run internal CoR programs
well). The student pushed back explicitly ("Are you sure this is
monetisable... for companies with large fleets"), which sent the agent to
primary sources — HVNL case law and insurance litigation — rather than
market-positioning pages, landing on ComplyLogic's actual claim: a
per-step, cross-party evidence trail that also records what the system
refused, documented in
[`decisions/0002`](decisions/0002-two-guarded-writes-and-structured-evidence.md).

## This round: a central view, missed-deadline incidents, a real rest gate

The student's next ask was specific: ComplyLogic needed a central,
management-facing view across every delivery, not just each one's own
room — one that treats the append-only record as the actual source of
truth ("if an entry doesn't exist in this app, no real action happened"),
proactively alerts when a legal deadline passes unconfirmed, lets
management record the remedy (rearranged time, penalty pay, cause), and
counts how often this happens across the business, specifically because a
habit of quietly back-dating a late entry shouldn't be invisible just
because the load eventually moved. The student also sharpened the
existing hours gate, asking for the actual HVNL rest-period rule modeled
for real rather than folded into the existing hours budget.

The agent researched the HVNL Standard Hours rule (7 continuous hours
stationary rest per 24h) before writing any schema, then proposed: a
`manager` role with read access to every delivery but no path to confirm
any step, ever; a separate `incidents` table (not another kind of
`events` row, since an incident needs mutable resolution fields an
append-only table structurally can't have) detected by an idempotent
sweep guarded by a `UNIQUE(delivery_id, missed_step)` constraint rather
than a scheduler or a read-then-insert; and a rest gate added as a third
condition on the existing assignment's guarded `UPDATE`, resetting only
at `delivered` (not `departed`, which only releases booking contention,
not fitness-for-duty). The full reasoning, including why a resolution
never edits a delivery's original deadlines, is in
[`decisions/0003`](decisions/0003-missed-deadline-incidents-and-rest-gate.md).

Two real bugs surfaced while building this, both worth recording.
First, a self-review of the generated `public/manager.js` caught raw
user-supplied strings (a delivery's label, a manager's resolution note)
being interpolated into `innerHTML` template literals — a real XSS
vector — in the dashboard's incident cards and deliveries table. Fixed by
rewriting both to build DOM nodes and set `textContent`, matching
`CLAUDE.md`'s existing rule, extended to call this out explicitly rather
than leaving it implicit. Second, resolving an incident 500'd against a
freshly-rebuilt local database: the `people.role` CHECK constraint in
source had been widened to include `'manager'`, but `CREATE TABLE IF NOT
EXISTS` never re-applies a schema change to an existing file, and this
app deliberately has no migration system — so a stale local `data/`
directory from before that change silently failed every manager insert
via `INSERT OR IGNORE`. The fix was a clean rebuild, and a new `CLAUDE.md`
note (rule 19) that a schema change always needs a confirmed-clean
database before the next check run.

## Spec before code

Four new specs were written before their matching code:
`rest-gate.md`, `missed-deadline.md`, `incident-resolution.md`, and
`manager-visibility.md`, alongside an extension to `evidence-pack.md` for
a resolved incident showing up verbatim. All are executable in
`spec/chainlock.test.ts`. Writing them against the new rest gate
immediately starved the existing driver pool — several tests already
relied on a driver's `committed_to` clearing to stay reusable, and the
rest gate meant `delivered` no longer freed a driver for *immediate*
reassignment either. The roster grew from 16 to 23 people (5 new
drivers) and one test's own final assertion (that a driver becomes
reassignable right after `departed`) was corrected to assert the
opposite, since that assertion had been testing the old, less correct
behaviour the new gate was specifically built to close.

## This round: GPS geofence gating for departure and delivery

The student's next ask started as an open-ended design conversation, not a
spec: what's a good design ethos for logistics software in general. The
agent proposed a short list of candidate principles (capture now and judge
later, visible provenance confidence, designing for the disputed case,
append-only-and-visibly-so, offline-first). The student picked the thread
that mattered most concretely: close the gap where `departed` and
`delivered` were still pure self-reports, using real GPS — a truck isn't
recorded as departed unless it actually left the pickup location, and a
truck that leaves and quietly comes back should be flagged, not invisible.

Before writing any schema, the agent asked four rounds of clarifying
questions rather than guessing at the shape, each because CLAUDE.md's own
rule says to stop and ask rather than silently reinterpret: whether the
gate belonged on `loaded` or `departed` (answer: `departed` — it's already
the status that means "left pickup," `loaded` happens before restraints
are even confirmed so gating it there would force the truck to leave
before the load was secured); whether revisit-flagging applied only at
pickup or at both ends (both); how pickup/dropoff addresses — stored as
free text, not coordinates — would become a geofence (geocoded via a real
API, not simulated, since this app's own spec runs against the real
running app, not stubs); and whether a flaky geocoder call could safely
sit in `pnpm check`'s path, which surfaced that the existing test suite's
placeholder addresses (`"A"`, `"B"`) would need replacing with real,
geocodable ones regardless of which geocoding approach was chosen.

The agent then proposed, and the student approved, a plan built entirely
on patterns this app already had rather than new machinery: GPS proof as
one more condition of the same guarded `UPDATE` that already checks role,
sequence, and hours (not a separate verification step), computed via a
`haversine_m` SQL function registered on the database connection itself —
the same principle as the existing `julianday()` rest-hours arithmetic,
so there's still no prior `SELECT` a later write trusts. A revisit flag
reuses `incidents`' exact once-mutable, idempotently-detected shape
(`geofence_flags`, a separate table since a revisit shares no fields with
a missed deadline) rather than inventing a new resolution lifecycle. The
full reasoning is in
[`decisions/0004`](decisions/0004-gps-geofence-gating.md).

## Verifying it actually works

`pnpm check` passes 25 tests (23 app specs plus the two course-mandated
invariants) against the built app, including five new GPS/geofence specs:
departed/delivered each refused until a ping confirms the right side of
the right geofence, only a delivery's own driver can post its ping, an
exit-then-reentry pattern raises exactly one open flag idempotently, and a
manager resolves a flag exactly once. `pnpm check:evidence` passes. A real
Docker persistence test — build the image, mount a volume, create a
delivery, drive it through a GPS-confirmed departure and a flagged
revisit, `docker restart` — confirmed the location ping log, the
geofence flag, and the delivery's geocoded coordinates all survived
exactly, the same way the event log and incidents already did.

## What isn't proven yet

Everything above was checked on localhost and in a local Docker
container, not the live Fly deploy. `reflections/crit-10.md` is still the
template placeholder, needing the student's own account, not the agent's.
The GPS flow itself has only been exercised with synthetic pings posted
directly to `/api/location` in the spec — not a real phone's browser
Geolocation permission prompt and `watchPosition` callback, which only a
manual pass in an actual mobile browser can confirm end to end.
