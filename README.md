# Democracy?

A table of citizens governs itself, one bill at a time. Anyone sitting at the
table can stand to be Bill Presenter, everyone votes, whoever wins climbs onto
their chair and writes a bill, everyone votes yea or nay, and if it passes it
goes into the permanent record of Bills Passed. Then the table elects again.
There is no bot and no generated text: every word of every bill, and every
vote on it, comes from the people actually sitting there.

It's satire of parliament. An empty chamber is not a neutral default, it's a
weapon. If you're the only one who shows up, you declare yourself candidate,
vote for yourself, win unopposed, and write whatever bill you want. Nobody
stopped you, because nobody else was in the room. That's the joke, and it's
also the whole point of the game: the people who should have been there to
vote against you just weren't.

## What good means here

**Who gets power, and what they do with it, is exactly what the table voted,
visible to everyone as it happens, and never revisable afterwards.**

The satire only works if the procedure is airtight. If a bill passed because
someone's vote got quietly dropped, or a Presenter got the chair because their
tab's clock ran slow, that's not satire anymore, that's just a broken game.
So the claim above is narrow on purpose, and every part of it is something
you can actually check against the running app, not something you have to
take my word for:

- **Everyone sees the same thing, without refreshing.** Each tab holds a
  server-sent event stream. Every vote, declaration and tabled bill is pushed
  to every seat within about a second, along with the server's own clock, so
  the page updates itself and every countdown on every screen ends at the
  same moment.
- **The server owns the clock.** Each window has a fixed close time written
  the moment it opens. A vote or declaration that arrives after that is
  refused, no matter what the browser's clock says.
- **One citizen, one vote per round.** Voting again replaces your vote until
  the window closes, and never after.
- **Outcomes are computed once, from the votes actually stored.** A round
  resolves in a single guarded write that only succeeds if the round is still
  open and its time is up, so it can never resolve twice, and never early.
  Ties are deterministic: whoever declared first wins, a tied bill fails.
- **Only the Presenter can table a bill**, and only during their own round.
  That's a condition baked into the write itself, not a check someone
  remembered to add.
- **Nothing is ever edited or deleted.** The database has triggers that
  refuse any change to a resolved round, any edit to a tabled bill, any
  deletion of a round, a vote, or a log line. There is no admin page, because
  there's no admin.
- **It survives restarts.** Everything lives in SQLite on the Fly volume.
- **Everything is logged, and the log is the audit trail.** Every
  declaration, vote, tabled bill and resolved round gets written out as a
  structured log line: who did what, to which round, with what result. That
  log is what actually makes the game auditable. Anyone watching
  `flyctl logs` can check that a bill in the permanent record really did get
  the votes it claims to have gotten, without needing access to the
  database.

## How a round goes

1. **Election.** Citizens declare, everyone votes for a candidate. If nobody
   stands, the election just lapses and a new one opens.
2. **Drafting.** The winner has the floor. If they table nothing in time, the
   bill fails. A silent Presenter is a valid outcome, not an error.
3. **The vote.** Yea or nay, more yeas than nays passes.

## Testing

Every rule above that's deterministic, the guarded writes, the tie-breaks,
the clock checks, the triggers, has a test next to it in `spec/`. If I can
write down what the expected input and output is, it's not something I check
by hand anymore, it's a test. That's also why the tests run against the real
server rather than mocks of it: a rule that only holds in a mock isn't a rule
I can trust.

## Running it

Node 24, no dependencies: `pnpm start` (or `pnpm dev` for short windows), then
`pnpm check` against it. Window lengths come from `ELECTION_SECS`,
`DRAFT_SECS` and `VOTE_SECS`.
