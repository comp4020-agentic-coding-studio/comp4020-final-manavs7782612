# Crit 9: All at once

**What was the breakthrough that moved the work forward?**

The breakthrough was scoping down before building anything: a single shared
number for one pod's crit room, not a generic multi-user chat app. The brief
warns that asking an agent for "a multi-user, real-time website" produces
the median answer, and I only avoided that by picking something small enough
to actually mean — one number, no accounts, nobody signs in. Once the scope
was that narrow, the "what happens when two people act at once" question had
one obvious, defensible answer: the server applies a `+1`/`-1` delta against
its own last-written count and never trusts a count the client sends.
Writing that decision down as an ADR before building it, rather than after,
is what made the rest fall into place — the test, the harness rules in
`CLAUDE.md`, and the README's definition of "good" all just restated the
same decision from a different angle instead of needing to be invented
separately. Refining it after the first pass meant going back over the
Dockerfile three times: the first version served a static placeholder, the
second built the real app but looked for `README.md` in the wrong directory
inside the image, and only the third actually ran correctly end to end —
each fix came from running the thing, not from reading the code and
assuming it was right.

The functional pass left the UI as bare, unstyled HTML, and running it
locally made that obvious immediately — a correct app that looks like a
placeholder reads as unfinished, even when it isn't. The second refinement
pass was design: a frosted glass card, a soft gradient background, Apple's
system font stack, and a spring-eased pulse on the count when it changes.
That pass earned its own rule in `CLAUDE.md` once it was done, because
"good" for this app always included how it feels to glance at mid-crit, not
just what it does, and that rule now keeps the readme page and the main
page from drifting apart as either one gets touched again.

**What did this work change about who I want to be as a developer?**

It sharpened a preference for proving things over asserting them. I didn't
call a piece of this done because it built or because the code looked
right — I called it done after actually driving the count to zero to check
it clamps, restarting a container against a mounted volume to check the
count survives, watching a live SSE connection receive a pushed update
after a POST, and loading the redesigned pages in a browser rather than
trusting that CSS compiled. Each of those caught something before it could
become a demo-day surprise: a wrong file path, a race that wasn't actually
handled yet, a look that didn't match the app's own definition of good.
That's the kind of developer I want to be with an agent doing most of the
typing — the one who insists on watching the real thing run, and look,
before believing the account of it.
