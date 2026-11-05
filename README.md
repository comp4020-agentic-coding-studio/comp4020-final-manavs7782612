# ComplyLogic

**Live:** https://comp4020-final-manavs7782612.fly.dev

ComplyLogic is an evidence record and compliance dashboard for a delivery's
Chain of Responsibility (CoR). Under the Heavy Vehicle National Law, a
company's only defence against CoR liability is proving it did everything
"reasonably practicable." Legal commentary on the first HVNL CoR
prosecution
([Godfrey Haulage, 2020](https://www.allens.com.au/insights-news/insights/2020/03/first-prosecution-for-breach-of-new-heavy-vehicle-national-law-chain-of-responsibility-duties/))
is blunt: "we always check" is not evidence. What holds up is a
timestamped, attributable record of *that specific load*. *Barrie Toepfer
v CGU Insurance* [2016] NSWCA 67 shows the same from the insurance side.
Disputes turn on exactly who loaded the freight and whether the driver
checked. Kynection, Allotrac and EROAD manage one operator's own CoR
program well; AgriChain gets closest to crossing company lines with a
joint sign-off, but that's one declaration, not a running trail that also
records what was refused and what deadlines slipped. ComplyLogic is built
for the case those tools don't cover: a consignor, a loading depot, a
carrier and a receiving business who are four separate companies with no
shared system of record, brought together only for the life of one
delivery.

## What good means here

**Good means one thing above all: every delivery produces an unalterable,
attributable record of what happened, by whom, when. A missed legal
deadline is surfaced and tracked, not left to quietly disappear once a
load eventually moves.**

What's enforced:

- **A delivery can never skip or reorder its status steps** (loaded,
  restrained, departed, delivered), each confirmed only by the right
  party. A blocked attempt is itself written to the record.
- **A driver without enough remaining legal hours, or without
  `MIN_REST_HOURS` (7, the HVNL Standard Hours minimum continuous
  stationary rest) since their last delivery, can never be assigned.**
  Both checks are conditions of the same guarded database write that
  performs the assignment, never a separate check, never overridable.
- **Two consignors can never both assign the same driver**, for the same
  reason: contention, hours and rest are all conditions of one guarded
  statement, so there's no gap for a race to land in.
- **Every confirmation and rejection is append-only**, naming who did it,
  with an optional note and photo. Nothing can edit or delete a past
  entry, or the photo it points to.
- **A missed deadline becomes a tracked incident automatically.** If a
  delivery's `load_by`/`depart_by`/`arrive_by` passes with the matching
  step unconfirmed, the system raises an incident a manager must act on.
  It doesn't wait for anyone to notice. Resolving one records the cause,
  any rearranged time, and any penalty pay, without rewriting what was
  originally legally expected. The compliance dashboard counts how often
  this happens across every delivery, including ones that eventually
  moved late and were never raised as an incident. The pattern matters
  as much as any single breach.
- **`departed` and `delivered` require an observed GPS position, not just
  the confirming party's say-so.** A truck can't be recorded as departed
  until a phone's own location is seen outside the pickup site, and can't
  be recorded as delivered until one is seen at the dropoff site. The
  same guarded database write that checks role and sequence also checks
  this. A truck that leaves a site and comes back shortly after is
  flagged for a manager automatically, whether or not anyone reported it.

What's judged, not enforced: which loader, driver and receiver a consignor
names on a delivery (by name and company, not a pick from a shared roster),
the category and amount a manager records when resolving an incident, and
the note a manager leaves when resolving a geofence flag.

Five parties, by function: **consignor**, **loader**, **driver**,
**receiver**, each delivery visible only to its own four, plus
**manager**, who sees every delivery and the dashboard but can never
confirm a step on anyone's behalf. A consignor registers their own company;
everyone else arrives by claiming a one-time invite link tied to the
specific delivery they were named on, carrying their own company's name
with them, not a login the consignor's company controls. Real time matters
because a confirmation, a blocked attempt, or a freshly detected incident
has to reach every relevant screen immediately, not in a report compiled
later.

This app doesn't guarantee legal admissibility or verify a photo's
honesty. It only guarantees attribution, timing, and immutability.

Sources: NHVR CoR primary-duty guidance;
[Allens — first HVNL CoR prosecution](https://www.allens.com.au/insights-news/insights/2020/03/first-prosecution-for-breach-of-new-heavy-vehicle-national-law-chain-of-responsibility-duties/);
*Barrie Toepfer v CGU Insurance* [2016] NSWCA 67; HVNL Standard Hours
work/rest rules (Kynection); Kynection/Allotrac/EROAD/AgriChain feature
pages.

## What this deliberately doesn't do

- **No real telematics, fatigue monitoring, or ELD integration.**
  `hours_remaining` and `resting_since` are tracked by the app itself,
  decremented or reset on confirmed events, a deliberate simplification.
  GPS position comes from the driver's own phone (the browser's
  Geolocation API, posted while the delivery room is open), not fleet
  hardware.
- **Geofencing is a fixed 150m radius and a 60-minute revisit window, not
  survey-grade boundary detection.** Generous enough to absorb ordinary
  consumer GPS error; a deliberately spoofed GPS source is not something
  this app detects.
- **No Basic/Advanced Fatigue Management accreditation.** Only the
  Standard Hours option (12h work / 7h continuous rest per 24h) is
  modeled.
- **No managed organizations.** `company_name` is free text a party types
  in once, not a company account with its own admins, members or login —
  see decisions/0005. There's no org-switching, no company directory, and
  no way for a company to see its own history across deliveries it wasn't
  named on.
- **No email delivery for invites.** An invite link is shown to the
  consignor to copy and send however they'd already contact that person;
  the app doesn't send it for them.
- **No admin override, force-advance, or edit of any kind**, for any role
  including manager. A manager can resolve an incident, never confirm a
  delivery step or change a logged fact.
- **No legal certification.** Whether a given record is sufficient in a
  specific dispute is a legal question this app doesn't answer.

## How it's built

Astro SSR (`@astrojs/node` standalone) and `node:sqlite` hold all state;
photos live alongside it on the same volume. Every write goes through one
guarded transaction. The compliance check and the state change are one
statement, so a race has exactly one winner and a skipped step is
structurally impossible. A delivery's pickup/dropoff addresses are
geocoded once, at creation, via OpenStreetMap's Nominatim; a driver's
phone posts its own position while the delivery room is open, and the
departure/delivery gate and the revisit flag are both read from that same
append-only ping log, inside the guarded write itself (a `haversine_m`
SQL function registered on the database connection). A periodic sweep
detects missed deadlines and raises incidents idempotently. State pushes
over
[server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events);
confirmations are multipart POSTs, the one deliberate exception to
strict-JSON. One Fly.io machine, one volume. `CLAUDE.md` holds the
build's rules; `PROCESS.md` the actual process; `decisions/` the
reasoning behind the big calls.
