<!-- DRAFT by Claude, for Manav to rewrite in their own words before the crit-9 cutoff. -->

**What was the breakthrough that moved the work forward?**

Realising the real-time requirement and the permanence requirement pull in
the same direction instead of fighting each other. Once resolution is a
single guarded UPDATE inside a transaction, broadcasting it is just "push the
snapshot after any write that changed `version`" — there's no separate
real-time layer to design, because the guard that makes the record honest is
the same guard that makes the push safe to fire from the 1-second sweep, a
client request, or both racing each other. Writing decision 004 made that
explicit instead of implicit: most of "what happens when several people act
at once" turned out to already be answered by rules written for a different
reason (rule 1, rule 3).

**What did this work change about who I want to be as a software developer?**

It's tempting to treat "make it real-time" and "decide what happens
concurrently" as two separate tasks — one a websocket/SSE plumbing problem,
the other a design problem to solve with new code. This week showed that if
the first version's invariants are strict enough, the second is often a
matter of reading the existing code honestly and writing down what it already
does, not adding more of it. I want to default to that reading-first move
before reaching for a new mechanism.
