# Your harness

This file is yours, and it arrives empty on purpose. The rules you hold the
agent to are part of what gets marked, so they should be rules you decided on.

Nothing about the template is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the course website publishes the
[final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/).
What the agent needs to carry from any of it is your call.

## Rules for this app

These follow directly from what `README.md` says "good" means for
ComplyLogic. If a change would break one of these, stop and ask rather than
silently reinterpreting the brief.

## Non-negotiable (never do this, ever, no exceptions)

1. **A delivery's status never advances to a step out of order, and never
   by the wrong role.** Each confirmation (`loaded`, `restrained`,
   `departed`, `delivered`) is a guarded `UPDATE` whose `WHERE` clause
   checks both the delivery's current status and the confirming person's
   role column (`loader_id`/`driver_id`/`receiver_id`) — never a prior
   `SELECT` that a separate `UPDATE` trusts, never a check followed by a
   separate write.
2. **A driver without enough remaining legal hours is never assigned to a
   delivery, and is re-checked at departure, not just at assignment.** Both
   checks run server-side, inside the same guarded statement that performs
   the state change — never client-side only, never a warning the user can
   dismiss.
3. **Two concurrent assignments of the same driver never both succeed.**
   The driver-availability check and the hours check are both conditions
   inside one `UPDATE ... WHERE ...` on `driver_hours`, guarded by `tx()`.
   An app-level "read, decide, then write" pattern is never an acceptable
   shape for a mutator here.
4. **No UI path (admin override, force-advance, edit flag) ever lets a step
   be skipped, reordered, or a rejected confirmation retried silently as if
   it had succeeded.** If a future prompt seems to need one, stop and raise
   it with the user before building it — it would contradict the README's
   central claim.
5. **An event is never edited or deleted, by any role, including an admin,
   and neither is a photo file a stored event points to.** No route, no
   helper, no migration path ever issues `UPDATE` or `DELETE` against the
   `events` table. `/api/events` and `/api/events/[id]` export `GET` only.
   No route ever overwrites a file already written under the photos
   directory.
6. **A driver who hasn't had `MIN_REST_HOURS` (7) continuous hours off duty
   is never assigned to a delivery.** This is a condition of the same
   guarded `UPDATE` as the hours check, not a second check run afterward —
   see decisions/0003. `resting_since` is cleared the moment a driver is
   assigned (they're on duty) and set again only when their delivery
   reaches `delivered` — never at `departed`, which only releases booking
   contention and says nothing about whether the driver is actually done
   for the day.
7. **A manager session can never confirm a delivery step, under any
   role-spoofing or UI state.** Every confirm-*.ts route's role check is an
   exact match against `loader`/`driver`/`receiver`; a manager's role is
   checked for read access separately (`canRead`, src/lib/db.ts) and never
   participates in a confirm route's own check. A manager resolving an
   incident is not a delivery confirmation and never advances a delivery's
   status.
8. **An incident resolves at most once, and never edits the delivery's own
   deadlines.** `resolveIncident`'s guarded `UPDATE ... WHERE resolved_at
   IS NULL` makes a second resolution structurally impossible. Resolving
   an incident writes to the `incidents` row and appends one
   `incident-resolved` event; it never touches
   `load_by`/`depart_by`/`arrive_by` on the `deliveries` row — what was
   legally expected has to survive exactly as it was, even after a remedy
   is arranged.
9. **`departed` and `delivered` are never confirmed on a party's say-so
   alone — each is gated on an observed GPS position, as one more
   condition of the same guarded `UPDATE` as the role/sequence/hours
   checks, never a separate check or a prior `SELECT` a later write
   trusts.** `confirmDepartedStmt` requires a row in `location_pings` more
   than `GEOFENCE_RADIUS_M` from the delivery's own `pickup_lat/lng`;
   `confirmDeliveredStmt` requires one within that radius of
   `dropoff_lat/lng` — both computed by `haversine_m`, a SQL function
   registered on the database handle itself (decisions/0004), so a truck's
   departure and arrival are things the system observed, not things a
   driver or receiver merely asserted.
10. **`location_pings` is append-only, exactly like `events`.** No route,
    no helper, no migration path ever issues `UPDATE` or `DELETE` against
    it. Every ping a driver's phone sends while the room is open is kept
    permanently, whether or not it ever mattered to a gate.
11. **A geofence revisit (a truck that exited a geofence and came back
    within `REVISIT_WINDOW_MIN`) is flagged at most once per delivery and
    geofence, and a flag resolves at most once.** `detectRevisit`'s
    `INSERT OR IGNORE` is guarded by `UNIQUE(delivery_id, geofence)`, the
    same idempotent-sweep shape as missed-deadline detection
    (decisions/0003); `resolveGeofenceFlag`'s guarded `UPDATE ... WHERE
    resolved_at IS NULL` makes a second resolution structurally
    impossible, the same shape as `resolveIncident`.
12. **A delivery's `pickup_lat`/`pickup_lng`/`dropoff_lat`/`dropoff_lng`
    are geocoded exactly once, at creation, and never edited afterward.**
    Geocoding happens before `tx()` starts in `/api/assign` (same
    ordering principle as rule 19's photo-before-write) — a lookup
    failure is a 400 before anything is written, never a partial
    delivery.
12a. **A delivery's `loader_id`/`driver_id`/`receiver_id` being NULL is not
    an edge case to handle, it's the normal state of a freshly-created
    delivery whose parties haven't all claimed their invites yet
    (decisions/0005).** No confirm route's guarded `UPDATE` can ever match
    a row where its own role field is NULL — this falls out of the
    `WHERE ... role_id = ?` shape every confirm statement already has,
    with no extra check needed, so a delivery is structurally unable to
    advance past `created` while any party is still unclaimed.

## Judged, not enforced — implement as a default, not a lock

13. Which loader, driver and receiver a consignor names on a delivery is a
    judgment call made by name and company, not a pick from a ranked pool
    (decisions/0005). There is no roster to rank: the consignor names
    whoever they're actually working with, and the system either
    recognises that person's already-active account or mints them a
    one-time invite. A driver still has to clear the compliance gate
    (rule 2) before being attached, whether they're recognised or invited.
14. ~~The fixed roster is configuration in source~~ — retired along with the
    roster itself. `src/lib/db.ts`'s `people`/`invites` tables are the only
    source of identity now; nothing is hand-authored in source except the
    two seeded managers (decisions/0005).
15. A manager's category/rearranged-time/penalty-pay choices when resolving
    an incident are a judgment call the manager makes — the app never
    second-guesses the category chosen or validates the penalty amount
    against any policy, only that the fields are well-formed. A manager
    resolving a geofence flag is the same kind of judgment call, with only
    a free-text note — no category or amount to second-guess at all.

## Identity and sessions

16. **Every party is a real, attributable identity, created one of two
    ways: self-registration (consignor only, `POST /api/register`) or
    claiming a one-time invite tied to a specific delivery (loader/driver/
    receiver, `POST /api/invites/[token]/claim`)** — never an anonymous
    cookie, never a bare page render, never a self-serve "sign up as a
    driver" form (decisions/0005). A manager is provisioned directly in
    the seed; there is no manager self-registration. There is no
    identity-free view anywhere in this app — every delivery is visible
    only to its four named parties, plus a manager (read-only, every
    delivery).
16a. **Every person carries a `company_name`** — free text, not a managed
    organization, but a real and visible fact about who someone is
    (decisions/0005). A driver's compliance numbers (`hours_remaining`,
    `resting_since`) are self-declared at the moment they claim their
    invite, exactly once, and immediately run through the same guarded
    compliance gate (rule 2) as any other assignment — self-reporting
    generous numbers is never a way to skip that gate.
17. Every mutating API route reads the actor from the session, never from a
    request body or form field naming "who did this." A request that tries
    to confirm a step — resolve an incident, or post a location ping on
    someone else's behalf — is a structural rejection (role/id mismatch),
    not a trust decision. `/api/location` checks the session's own
    `personId` against that delivery's `driver_id` exactly like every
    other mutating route checks its own role field. The one exception is
    `POST /api/invites/[token]/claim`, which is necessarily anonymous — the
    token itself is the credential, and the guarded `claimed_at IS NULL`
    condition on the claim is what stands in for a session check there.
18. Every route that reads or serves a delivery's data — the room, the
    evidence pack, a photo, its events — checks the session against that
    delivery's `consignor_id`/`loader_id`/`driver_id`/`receiver_id`, or
    that the session's role is `manager` (`canRead`, src/lib/db.ts). A
    non-party, non-manager session gets 403/404, never partial content.

## Persistence and writes

19. **Every write goes through one `tx()` helper, and `node:sqlite` is the
    only state.** `tx` is `BEGIN IMMEDIATE`, try/catch to `ROLLBACK`, no
    `await` inside, and it throws on re-entry. A photo is written to disk
    *before* `tx()` runs (file I/O can't happen inside a synchronous
    transaction) and deleted again if the guarded write inside `tx()`
    rejects, so no `events` row ever points at a missing file and no orphan
    file survives a rejected confirmation. Insert the event only when the
    guarded statement's `changes === 1`, and broadcast only after commit.
    The database handle lives on `globalThis` so a dev reload can't create
    a second one. A schema change to an existing `CREATE TABLE IF NOT
    EXISTS` (e.g. widening a `CHECK` list) only takes effect on a fresh
    database file — there is no migration path in this app, so a schema
    change always needs a confirmed-clean local `data/` directory before
    the next `pnpm check` run, and the gate (rule 35) has to actually pass
    against that fresh file, not a stale one left over from before the
    change.
20. **Persistence means a real restart test, not just "it's in a
    database."** Before calling a change to the schema or a mutator done,
    actually `docker restart` the container against a mounted volume and
    confirm every delivery's status, the full event log, every open and
    resolved incident, every open and resolved geofence flag, and an
    uploaded photo's servability all survived exactly. `DB_PATH` is the
    whole persistence story; don't let it fall back to an in-memory
    default when the variable is unset. Photos live under a `photos/`
    directory next to `DB_PATH`, on the same volume, for the same reason.

## Real-time and transport

21. **SSE for push, plain POST (or multipart POST on the four confirm
    routes only) for commands** — not WebSockets. All broadcasts go through
    one `broadcast.ts`; each client's snapshot always includes
    `myDeliveries`, one delivery's `room` when subscribed and a party (or a
    manager), and a `manager` block (every delivery, every incident, every
    geofence flag, the compliance stats) only for a manager session. The
    missed-deadline sweep runs inline with computing that `manager` block,
    plus on the same periodic interval that already re-broadcasts to
    connected clients — a manager's dashboard is never more than that
    interval stale. A client whose stream stops draining is dropped, and
    total/per-session stream counts are capped.

## Input handling and rendering

22. **Every route is strict-JSON-only except the four confirm routes,
    which are strict-multipart-only** (`parseConfirmBody` in `src/lib/
    api.ts`) — a photo can't travel as JSON, and this is the one stated
    exception to that rule, scoped to exactly those four routes.
    `/api/location` is strict-JSON like everything else: a ping carries no
    file. An unknown key in either kind of body is a 400, not something
    quietly ignored. A photo must be `image/jpeg` or `image/png`, under 5
    MB, or the request is refused before anything is written. Render live
    state with `textContent`, never `innerHTML` with interpolated user
    data — a delivery's label, a resolution note, and anything else a
    person typed are rendered through `textContent` or an `.append()`'d
    node, never concatenated into an `innerHTML` template string. The
    evidence pack page is server-rendered Astro and so is exempt from the
    `textContent`-specifically rule, but still never interpolates
    unescaped user text into a `set:html` block.

## Styling — the ComplyLogic design ethos

This app is a legal evidence record used outdoors, one-handed, often in
gloves and glare, by people who did not choose to use software today. Every
rule below exists because of that user, not because of taste. It was derived
by comparing several design traditions on their own terms rather than by
tweaking whatever the app already looked like — see below for what was
borrowed from where, and what was deliberately rejected.

23. **Subtraction first.** Before adding any control, border, icon or colour,
    the test is: does this do real work, or is it decoration? If the app
    still tells the truth without it, cut it. This looks like a tool and a
    document of record, not a marketing surface — no hero imagery, no
    illustration, no decorative colour anywhere outside the status system in
    rule 25.
24. **One typeface, one spacing grid.** `--font` leads with the platform's
    own system sans (`-apple-system`/San Francisco, falling through system
    UI stacks, Inter last) — never a second "display" font anywhere. Exactly
    three font weights exist in the whole app: 700 (headings, critical
    state), 600 (labels, buttons, badges), 400 (body) — no others, no
    italics except disabled/placeholder text. Spacing comes from one 8px
    scale (4/8/12/16/24/32/48px); nothing is spaced ad hoc. Type comes from
    one 4-step ramp — 13px caption, 16px body (the floor — never smaller on
    any viewport), 20px section heading, 28px page title — nothing between
    those four sizes.
25. **Colour is a status language, not a decorative brand palette, and every
    colour is traceable to a real external source — never invented, and
    never presented as an official government palette, which doesn't exist
    for a third-party app to adopt.** The neutral base and `--accent` (navy)
    are aligned to the National Heavy Vehicle Regulator's own identity — the
    regulator this app's HVNL/CoR claim is built around — not a claim to
    government branding itself. The three status hues are fixed and
    traceable to AS 1742 / ISO 3864 safety-signage colour meaning: `--warn`
    (amber) means "needs action" (a blocked attempt, an open incident, an
    open geofence flag, a deadline overrun); `--error` (red) means
    "blocked/rejected" — its own distinct token, never collapsed into
    `--warn`; `--ok` (green) means "confirmed/compliant." No other hue
    appears anywhere in the app, and colour never stands alone — every
    coloured state is always paired with a text label.
26. **Flat and bordered, never a drop shadow.** Panels and cards are defined
    by a single 1px hairline border. No `box-shadow`, no elevation system —
    shadow reads as app chrome, not as a document someone can trust and
    print.
27. **No map, no radar, no icon without a text label.** The delivery room,
    the timeline, the manager dashboard and the evidence pack carry the
    whole state in words — GPS confirmation and a geofence flag are no
    exception: a plain-text status line ("GPS: confirmed left pickup at
    14:32"), never a map or an icon-only button.
28. **One column, one primary action, thumb reach.** Mobile-first at 375px,
    single-column always. The one action available right now is the single
    largest tappable element on the screen and sits in the lower two-thirds
    of the viewport, not top-right. Never more than one primary (`.go`-style)
    button per screen — every other action is a plain text link.
29. **Built for gloves and glare, not a mouse.** No affordance exists only
    on hover. Tap targets are at least 48px (56px for the one primary
    action per rule 28). A form defaults to the only sensible choice instead
    of asking a question the system already knows the answer to.
30. **Jargon gets a tap-to-reveal definition, not a hover tooltip.** Any
    CoR/logistics term that isn't plain English (CoR, consignor, geofence,
    restrained, HVNL, etc.) gets a focusable `<details class="term">`
    disclosure at its first use per screen: the plain-language framing comes
    first, the technical term second, and tap or keyboard focus reveals a
    one-sentence definition. A hover-only tooltip is never acceptable here —
    it does not exist on a phone.
31. **One lockup, everywhere, honestly plain.** The `Brand` component
    (`src/components/Brand.astro`) — a single-stroke shield-and-check mark
    plus the "ComplyLogic" wordmark — is the only logo treatment in the app
    and renders identically, same position and size, in every page's
    `header.bar`. No page invents its own header treatment.
32. **Motion only confirms a state actually changed**, capped at roughly
    150ms, and fully off under `prefers-reduced-motion`.
33. **The evidence pack is a printable document, not a page view.** It has
    its own print stylesheet that hides navigation — it's meant to be
    printed or saved as a PDF, not just viewed on screen.
34. **Creating something new is always a deliberate, named action the user
    reaches for — never a form the screen opens with.** This is the same
    "recognition over recall, disclose progressively" principle behind the
    patterns people already navigate without instruction: Gmail's "Compose"
    button, Trello's "+ Add a card", a phone's camera app opening to the
    viewfinder, not a settings sheet. A list screen's default state is the
    list; the one `.go`-style primary action on it is a short, verb-first
    trigger ("+ New delivery"), never the creation form itself laid out
    inline. The form appears only after that explicit tap, replaces the
    trigger as the screen's one primary action while open, and a plain
    text "Cancel" collapses it back — so rule 28 ("one primary action per
    screen") is never violated by a hidden second one sitting below the
    fold. This applies to every "add new X" surface in the app, not just
    delivery creation.

## When a correction happens

34. If a mistake in the hours-calculation logic, the sequence-gate logic,
    the rest-gate logic, the missed-deadline sweep, the geofence-gate
    logic, the revisit-detection logic, or the photo-cleanup-on-rejection
    logic is caught and fixed, the fix must land as a new `spec/` check
    (regression test) and a one-line note in `PROCESS.md`, not just a
    silent re-attempt in the same commit.

## The gate

35. **`pnpm check` and `pnpm check:evidence` are the gate, not a
    suggestion.** Don't report a change as done without both passing
    locally against a built app (`pnpm build`, then run
    `dist/server/entry.mjs`, per `spec/global-setup.ts`) — and, per rule
    19, against a database file that actually reflects the current schema.
    Specs assert only on their own deliveries, people and incidents, never
    on global counts, and every session a test creates logs out in
    `afterEach`.
