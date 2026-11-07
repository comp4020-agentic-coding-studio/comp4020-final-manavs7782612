# Democracy?

A table of citizens governs itself, one bill at a time. Anyone can stand to be
Bill Presenter; everyone votes; the winner writes a bill; everyone votes yea
or nay; a pass goes into the permanent record. Then the table elects again.
No bot and no generated text: every word of every bill, and every vote on
it, comes from the people actually sitting there.

It's satire of parliament. An empty chamber isn't a neutral default, it's a
weapon: show up alone, declare yourself candidate, win unopposed, write
whatever bill you want. That's the joke and the point — the people who
should have voted against you just weren't there.

## What good means here

**Who gets power, and what they do with it, is exactly what the table voted,
visible to everyone as it happens, and never revisable afterwards.**

The satire only works if the procedure is airtight: a quietly dropped vote,
or a Presenter seated because their tab's clock ran slow, isn't satire
anymore, it's just a broken game. That's why the server owns time and
outcome instead of trusting any client (a client-supplied clock can't be
trusted for ordering: Lamport, "Time, Clocks, and the Ordering of Events in
a Distributed System," 1978), and why process matters as much as tallying
(end-to-end verifiability: Jones & Simons, *Broken Ballots*, 2012). Every
part of the claim below is checkable against the running app:

- **Everyone sees the same thing, without refreshing.** An SSE stream pushes
  every vote, declaration and tabled bill to every seat within about a
  second, with the server's own clock, so every countdown ends together.
- **The server owns the clock.** Each window has a fixed close time written
  the moment it opens; a late vote or declaration is refused regardless of
  the browser's own clock.
- **One citizen, one vote per round**, changeable until the window closes.
- **Outcomes are computed once, from the votes actually stored**, in a
  single guarded write that only succeeds while the round is open and its
  time is up — it can never resolve twice, or early. Ties are deterministic:
  whoever declared first wins, a tied bill fails.
- **Only the Presenter can table a bill**, only during their own round —
  baked into the write itself, not a remembered check.
- **Nothing is ever edited or deleted.** Triggers refuse any change to a
  resolved round, a tabled bill, or any deletion at all. No admin page,
  because there's no admin.
- **It survives restarts.** Everything lives in SQLite on the Fly volume.
- **Everything is logged, and the log is the audit trail**: every
  declaration, vote, tabled bill and resolved round is a structured log
  line, so anyone watching `flyctl logs` can check a bill in the permanent
  record really did get the votes it claims.

## How a round goes

1. **Election.** Citizens declare, everyone votes for a candidate. If nobody
   stands, the election just lapses and a new one opens.
2. **Drafting.** The winner has the floor. If they table nothing in time, the
   bill fails. A silent Presenter is a valid outcome, not an error.
3. **The vote.** Yea or nay, more yeas than nays passes.

## Testing

Every deterministic rule above, guarded writes, tie-breaks, clock checks,
triggers, has a test in `spec/`, run against the real server rather than
mocks of it: a rule that only holds in a mock isn't a rule I can trust.

## Running it

Node 24, no dependencies: `pnpm start` (or `pnpm dev` for short windows),
then `pnpm check`. Window lengths come from `ELECTION_SECS`, `DRAFT_SECS`
and `VOTE_SECS`.
