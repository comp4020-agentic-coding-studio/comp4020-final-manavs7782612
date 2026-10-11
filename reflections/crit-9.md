# Crit 9: All at once

**What was the breakthrough that moved the work forward?**

I started this session having done no work at all for weeks 8 or 9, and
partway through I realised the agent had been building in the wrong repo —
a different student's, found by matching a pod label against a GitHub
handle that happened to look similar. The breakthrough wasn't technical, it
was catching that and stopping immediately rather than letting momentum
carry it forward. Once I was actually in my own repo, the real unlock was
scoping small on purpose: a single shared number for one pod's crit room,
not a generic multi-user chat app. Once the scope was that narrow, the
"what happens when two people press a button at once" question had one
obvious, defensible answer — apply a delta, never trust a client's count —
and everything else (the ADR, the test, the harness rules in CLAUDE.md)
followed from that one decision instead of needing to be invented
separately.

**What did this work change about who I want to be as a developer?**

Catching the wrong-repo mistake mid-session was uncomfortable, and it's
made me want to be the kind of developer who checks the ground they're
standing on before building on it — which repo, which identity, which
assumption — rather than one who trusts an agent's confident output because
it looks finished. I also want to be someone who proves things rather than
asserts them: I didn't call the Dockerfile done because it built, I called
it done after restarting the actual container against a mounted volume and
watching the count survive. That habit cost very little time tonight and
would have caught a real bug if there'd been one.
