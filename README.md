# Democracy?

<!-- DRAFT by Claude, for Manav to rewrite in their own words before submission. -->

A table of citizens governs itself, one bill at a time. Anyone at the table
can stand to be the Bill Presenter; everyone votes; whoever wins climbs onto
their chair and writes a bill; everyone votes yea or nay; if it passes, it goes
into the permanent record of Bills Passed. Then the table elects again. There
is no bot and no generated text: every word of every bill, and every verdict on
it, comes from the people sitting there.

## What good means here

**Who gets power, and what they do with it, is exactly what the table voted —
visible to everyone as it happens, and never revisable afterwards.**

The satire only works if the procedure is airtight. A joke bill that passed
because someone's vote was quietly dropped, or a Presenter who got the chair
because their tab's clock ran slow, isn't funny; it's a broken game. So the
claim is narrow, and every part of it is something you can check:

- **Everyone sees the same thing.** Each tab holds one server-sent event
  stream. Every vote, declaration and tabled bill is pushed to every seat
  within about a second, along with the server's clock, so every countdown
  ends at the same moment.
- **The server owns the clock.** Each window has a fixed close time written
  when it opens. A vote or declaration that arrives after it is refused,
  whatever the browser thinks the time is.
- **One citizen, one vote per round.** A second vote replaces the first until
  the window closes, and never after.
- **Outcomes are computed once, from the stored votes.** A round resolves in a
  single guarded write that only succeeds if the round is still open and its
  time is up, so it can't resolve twice or early. Ties are deterministic:
  the candidate who stood first wins; a tied bill fails.
- **Only the Presenter can table the bill**, and only during their round. That
  is a condition in the write itself, not a check someone could forget.
- **The record is permanent.** Database triggers refuse any change to a
  resolved round, any edit to a tabled bill, and any deletion of a round, a
  vote or a log entry. There is no admin page, because there is no admin.
- **It survives restarts.** Everything is in SQLite on the Fly volume.

## How a round goes

1. **Election.** Citizens declare; everyone votes for a candidate. If nobody
   stands, the election lapses and a new one opens.
2. **Drafting.** The winner has the floor. If they table nothing in time, the
   bill fails — a silent Presenter is an outcome, not an error.
3. **The vote.** Yea or nay; more yeas than nays passes.

## Running it

Node 24, no dependencies: `pnpm start` (or `pnpm dev` for short windows), then
`pnpm check` against it. Window lengths come from `ELECTION_SECS`,
`DRAFT_SECS` and `VOTE_SECS`.
