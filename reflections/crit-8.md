# Crit 8: It's alive!

**What was the breakthrough that moved the work forward?**

The breakthrough was refusing to answer the brief literally. "A multi-user,
real-time website" is exactly the prompt the brief warns produces a median,
forgettable answer, so instead of building a generic app I picked one
audience I could actually picture: the handful of people in my own pod,
glancing at a phone to see whether the crit room is already full before
walking over. Once the scope was that narrow — one number, no accounts,
nobody signs in — "what does good mean here" stopped being abstract and
became a short, concrete list in README.md: legible at a glance, forgiving
of simultaneity, survives a restart. Everything after that (the schema,
the Dockerfile, the CLAUDE.md rules) was just holding the build to a
definition that already existed, rather than inventing one after the fact.

**What did this work change about who I want to be as a software developer?**

It reinforced that "it's alive" is a claim you verify, not one you assert
from reading the code. I didn't call persistence done because a database
existed — I called it done after building the real Docker image, running
it against a mounted volume, restarting the container, and watching the
count come back correct. That habit — insisting on seeing the actual
running thing before believing an account of it — is the one I want to
keep carrying into a build where an agent is typing most of the code: the
agent can tell me it works, but only a restart, a curl, or a browser tab
actually tells me.
