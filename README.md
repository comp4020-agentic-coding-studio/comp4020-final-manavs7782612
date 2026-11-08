# Democracy?

Live satire of parliament. A table of citizens governs itself one bill at a time: anyone may stand for Bill Presenter, everyone votes for a candidate, the winner writes one bill, the table votes yea or nay, and a pass enters the permanent record. The table then elects again. Every bill and vote comes from a citizen actually present.

## The Satire

An empty chamber is not neutral. It is a weapon: stand alone, win unopposed, write whatever bill you like - nobody was there to vote against you. That's the satire, and it only works if the mechanism is correct: a broken app and a genuinely empty chamber look identical from outside. So the claim every rule in CLAUDE.md protects is narrow - who holds power, and what they do with it, is exactly what the table voted, visible as it happens, never revisable after the fact.

The same satire explains why there's no identity check. Nothing verifies who you are: a name is claimed once, never confirmed, so anyone can call themselves whoever they like. What that name does afterwards is checked, logged and permanent, tied to it forever. That gap isn't a hole, it is the satire - honest about how little it takes to seize a room, verifying none of who you are and all of what you did.

## Round structure

1. Election. Citizens declare, the table votes for a candidate. No candidates: the election lapses and reopens.
2. Drafting. The elected Presenter has the floor to table one bill. None tabled before the window closes: the bill fails - not an error, a valid outcome.
3. Vote. Yea or nay. Majority yea passes; a tie fails.

## Basis for the design

Two sources set what "correct" means here. Lamport (1978): the server alone owns time and outcome, since a client clock would let a citizen reopen a closed window. Jones and Simons (2012): a correct tally isn't enough - the procedure producing it must itself be trustworthy.

Three requirements follow: the server alone decides when a window closes and what a round resolved to; a round resolves exactly once, from votes stored at resolution time, never a stale read; nothing in the record is edited, deleted or re-decided by anyone, operator included.

## Enforcement

Every rule below I check with `pnpm check` against the real server, under `spec/` - a rule that only holds in a mock isn't one I trust.

SSE pushes every vote, declaration and bill to every seat within about a second, stamped with the server's clock, so countdowns stay in sync. A vote after a window closes is refused regardless of the client's clock - close time is fixed server-side at window open. One vote per citizen per round, changeable only while open.

Resolution is one guarded write, succeeding only once the round is open and its deadline has passed. Ties are deterministic - earliest declaration wins, a tied bill fails, never random. Only the Presenter can table a bill, only during their round, enforced in the write's `WHERE` clause rather than a check that could be forgotten. No admin route exists to undo any of it.

State survives a restart, in SQLite on the Fly volume. Every event is a log line via `flyctl logs`, so a passed bill's vote count can be checked independently.

The one thing no test catches: whether an empty chamber reads as satire or as a malfunction. I settled that by seating real people at the table and watching an uncontested win land as the joke, not as something broken.

## References

Decisions [001-006](decisions/): resolution, ties and silence, the draft/vote split, concurrent citizens, visibility and mutation rules, stack and workflow rationale.

Leslie Lamport, *Time, Clocks, and the Ordering of Events in a Distributed System* (1978).

Douglas W. Jones and Barbara Simons, *Broken Ballots: Will Your Vote Count?* (2012).
