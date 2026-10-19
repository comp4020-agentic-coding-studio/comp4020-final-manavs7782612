# Crit 10: Fly by instruments

**What was the breakthrough that moved the work forward?**

The breakthrough was realising crit 9's anonymity rule and crit 10's
"tell people apart" requirement are in direct tension, and that the fix
wasn't to bolt identity onto the existing `+1`/`-1` tally but to change what
the shared state *is*. An anonymous counter has no natural owner for a
press — there's nothing a permission check could be "yours" versus "theirs."
Presence does: each visitor has exactly one true thing to say about
themselves, "I'm here" or "I'm not," and the shared count becomes a
derived `COUNT(*)` over everyone's presence row rather than a value anyone
writes directly. Once I reframed it that way, the server-enforced boundary
fell out for free: a request can only ever name *its own* identity (read
from an httpOnly cookie the server minted), never anyone else's, so there's
no field left for a client to abuse even if it tried. That's the same shape
of decision as crit 9's delta-not-count rule — never trust the client with
something the server alone should own — applied to a second axis.

Writing `decisions/0002-presence-identity-cookie.md` before touching the
route handler kept the scope honest: the moment "random anonymous cookie"
was written down as the chosen option next to "login" and "client-supplied
id," it was obvious the identity only needs to be *distinct*, not *real*,
which is what kept this from growing into an accounts system.

**What did this work change about who I want to be as a developer?**

It sharpened the same instinct crit 9 built: don't claim a permission
boundary is enforced until you've tried to break it from outside your own
UI. I wrote `spec/presence.test.ts` to run two independent cookie jars
against the real running server and assert that one jar's toggle never
moves the other's count — not by reading the code and reasoning that it
should hold, but by actually sending the requests. I also watched the
structured log lines land on stdout for two concurrent "visitors" before
trusting that a crit could be narrated from `flyctl logs` alone, and
restarted the built container against a mounted volume again to confirm
presence (not just the old count) survives a redeploy. The habit from
crit 9 generalised cleanly: for a claim this load-bearing — "the server
decides who's who" — proving it against the running thing is the only
version of "done" that counts.
