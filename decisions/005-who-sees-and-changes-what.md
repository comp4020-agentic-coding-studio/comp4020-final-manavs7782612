# 005 — What each citizen may see and change

What counts as a person here is a citizen: a name claimed once (`POST
/api/join`), tied to a bearer token in an `HttpOnly` cookie. Two browsers with
no shared cookie jar — two Chrome profiles, an incognito window — are two
citizens even if a human types the same name into both (the second is
refused: `lower(name)` is unique). This record states what that identity is
allowed to see and change, and where each rule is actually checked, because
crit 10 asks for the decision written down even where the mechanism predates
this record.

**Everyone sees the same table.** There is no per-citizen view of state: the
SSE snapshot (`snapshot()` in `game.ts`) is identical for every open stream
except for the `me` and `myVote` fields stitched on in `frame()`. Considered
hiding candidates' live vote counts from everyone but the candidates, to cut
down on tactical voting; rejected, because README's claim is that the
procedure is visible to everyone as it happens — a hidden tally would break
that, not protect it.

**Only the seated Presenter may table a bill.** Checked on the server, not
the client: `propose()`'s `UPDATE` names `presenter_id = ?` in its `WHERE`
clause (rule 4, CLAUDE.md) — a citizen who isn't the Presenter gets 0 rows
changed and a 403, before any text is written. The client-side UI hiding the
textarea from non-Presenters is a convenience, not the guard; removing the
UI check changes nothing about who can actually table a bill.

**Only the citizen a token belongs to may cast that citizen's vote or
declaration.** Checked the same way: `tokenOf(req)` resolves a token to a
citizen id server-side (`server.ts`), and every write (`declare`, `vote`,
`propose`) takes that id as its own argument, never one from the request
body. There is no route that accepts "vote as citizen N" — the only
citizen id a request can act as is the one its cookie names.

**Nobody may change the past.** This is the one restriction that applies
identically to every citizen, including the Presenter and including anyone
who could reach the database directly: resolved rounds, cast votes, tabled
bill text and declarations are frozen by triggers in `db.ts`, not by
application logic that a route could get wrong (rule 3, CLAUDE.md). Considered
giving the Presenter a short correction window on typos in a tabled bill;
rejected, because any edit window — however short — reopens the exact
failure mode the whole app exists to rule out (README: "never revisable
afterwards").

**There is no citizen with more access than any other.** No admin account,
no moderator role, no route gated on anything but "is this the Presenter of
this exact round" or "is this the citizen whose token this is." Considered
adding a convenor/observer role for crit purposes (read the log without
joining); rejected as unneeded — `flyctl logs` already gives an outside
observer everything they need without a row in `citizens` at all.
