# Process overview

## Restarting on 2026-11-05

The previous concept, ComplyLogic (and before that Slotlock, and before that
a Canberra air traffic control sim), was a compliance tracker built around a
Chain of Responsibility pattern. The code worked and the tests passed, but
nothing about using it was satisfying. I kept adding polish, a better
dashboard, cleaner audit records, and none of it fixed the actual problem,
which was that I couldn't say in one sentence what the app proved. It had
features, it didn't have a claim.

So I abandoned it and restarted the same day as Democracy?, a game where a
table of people elects someone to write a law and then votes on it. I picked
this because it's the opposite problem: the whole thing is one claim that
either holds or doesn't, and a stranger can feel whether it holds within
thirty seconds of sitting at the table. If someone shows up alone, declares
themselves candidate, wins by default, and passes whatever bill they want,
that's not a bug, that's the satire working. Every rule in CLAUDE.md exists
to protect that one sentence in README.md ("What good means here").

## Writing the claim before the code

I wrote README's "What good means here" paragraph before any server code
existed, same as I did for Slotlock. The reasoning: if I write the harness
rules first and the claim second, the rules end up being whatever I thought
of, and the claim becomes a summary of the rules instead of the other way
round. Writing the claim first means every rule has to justify itself by
pointing back at a clause of it. That's also why CLAUDE.md's non-negotiable
list is numbered the way it is, each rule is traceable to a specific phrase
in the claim, not a general instinct about what a well-built app should do.

## Deciding which rule needed to go in the harness

Not everything that came up while building this needed to become a
CLAUDE.md rule. The test I used: would breaking this silently make the
claim false, in a way nobody watching the table would notice until it was
too late to matter? If yes, it's a non-negotiable. If it's just a judgement
call with a defensible alternative, it's a decision record instead, written
down so I remember why, but not something the agent is forbidden from
touching.

Concretely, working through it looked like this:

- **"A round resolves once, from stored votes"** became rule 1 because the
  failure mode is invisible from the UI. If resolution read from a SELECT
  made earlier in the request instead of computing the outcome inside the
  same guarded write, a slow request and a fast one racing each other could
  resolve the same round twice, or resolve it on stale votes, and the page
  would just show whichever write happened to land last. Nobody watching
  would know the record was wrong unless they went and checked the
  database by hand. That's exactly the kind of bug the whole game exists
  to rule out, so it went in as a non-negotiable, not a decision to
  revisit later.
- **"The server owns the clock"** became rule 2 the moment I thought about
  what a bored citizen would actually try. The easiest way to cheat this
  game isn't SQL injection, it's just lying about what time it is on your
  own machine. Any rule whose enforcement depended on the client's clock
  was never actually a rule.
- **"No override path"** (rule 3) came from asking what I'd want if I were
  marking this myself: is there anywhere in this app, admin route, reset
  button, delete endpoint, that lets a bill or a vote be made to disappear
  after the fact? README promises the record is permanent. An admin page
  "for debugging" would have quietly broken that promise the first time I
  used it, so I ruled it out structurally with database triggers instead of
  trusting myself not to add one under deadline pressure.
- **Tie-breaks being deterministic** (rule 6) came out of actually building
  decisions/002 and noticing I was tempted to just pick `Math.random()`
  because it was less code. I stopped because a random tie-break is
  something a citizen could reasonably suspect was rigged, and "was it
  rigged" is the one question this whole app is supposed to make
  unaskable. Earliest-declarer-wins is boring but it's checkable: a citizen
  can look at the order they declared in and verify the outcome themselves.
- **The black-and-white rule** (rule 8) is the one non-negotiable that
  isn't about correctness, it's about the satire reading as satire and not
  as a polished SaaS product. I added it after noticing my first pass at
  styling made the app look friendly and trustworthy, which undercuts the
  joke that this is a system anyone can weaponise. Flat, two-tone,
  monospace keeps it looking like a procedure, not a product.
- Things that did **not** become non-negotiables: the grace period length
  for a disconnected citizen, what happens when the table is empty, how
  long drafting takes versus voting. These are judgement calls with
  reasonable alternatives (decisions/002, 003, 004), not load-bearing for
  the claim itself, so I wrote down the reasoning and left them open to
  revision instead of locking them in CLAUDE.md.

## Stack and agentic workflow

Node 24, no dependencies: `node:http`, `node:sqlite`, server-sent events. The
guarded-write and SSE patterns carried over from the earlier project; the
framework didn't, because this app is one page and a JSON API, and Astro was
solving a problem (multi-page SSR) this app doesn't have. SQLite over a
managed Postgres add-on for the same reason: one machine, one volume, no
second service to deploy or keep credentials for, and WAL mode already gives
non-blocking reads against the one writer `tx()` serialises. The agentic
workflow itself was constraints-first, not features-first: README's claim
was fixed before any server code, same as the harness's non-negotiables are
each traceable to a clause of it, rather than inferred afterwards from
whatever got built. The full trade-off case, with sources, is
decisions/006-stack-and-workflow.md.

## Where I steered versus where the agent proposed

I decided what the app is and what it refuses to be: a satire of an empty
parliament, not a general voting platform; no accounts beyond claiming a
name; no admin role of any kind, ever; strictly black and white. The agent
proposed the mechanics that make those hold up under concurrent use, the
guarded `UPDATE` pattern, the SSE snapshot-plus-delta broadcast, the
grace-period seat handling in decisions/004, and drafted every decision
record for me to check against what I actually meant.

Everything else, the testable claims, the design judgements, the executable
spec, is in `decisions/` and `spec/`.
