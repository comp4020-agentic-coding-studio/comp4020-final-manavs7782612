<!-- DRAFT by Claude, for Manav to rewrite in their own words before the crit-10 cutoff. -->

**What was the breakthrough that moved the work forward?**

Narrating from `flyctl logs` while two classmates use the app from its URL
alone exposes anything that was only ever checked by the UI, not the server,
because the UI isn't there to hide it. Going through the server-checked-access
decision (005) before the crit meant every write path I could point to in the
logs had an answer for "could the other citizen have done this instead" —
the Presenter guard and the token-to-citizen-id binding are both WHERE
clauses, not `if` statements a route could skip. The one real gap I found was
cosmetic, not structural: the log line said "citizen 7 declared," which is
useless to narrate from without a lookup table. Writing the citizen's name
into the log event closed that.

**What did this work change about who I want to be as a software developer?**

Logging for an audience that isn't me, in real time, without the UI in front
of them, is a different discipline from logging to debug my own crash. It
forced me to ask "could a stranger reading only this line tell the two
citizens apart" rather than "is there enough information in here somewhere."
That's a question I want to keep asking about anything meant to outlive the
person who wrote it.
