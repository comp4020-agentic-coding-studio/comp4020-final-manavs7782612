# 006 — Stack and agentic workflow

**Context.** A3 asks for a multi-user, real-time, persistent app, built and
deployed inside a week, with every behavioural claim backed by a test that
runs against the real server. The stack and the harness (CLAUDE.md) had to
support that together: whatever I picked, an agent working from CLAUDE.md
needed to be able to add a guarded write or an SSE event without first
learning a framework's idioms for either.

**Options considered.**

- *Framework (Astro, as the course default) vs. plain Node.* Astro earns its
  keep solving multi-page SSR and islands hydration — a problem this app
  doesn't have. It's one page and a JSON API; a framework here would be
  surface area the agent has to route around, not use. This matches the
  general caution against adopting infrastructure sized for problems you
  don't have (the "mythical scale" argument in Bernhardt, *You Are Not
  Google*, bernhardt.io/you-are-not-google — written about distributed
  systems, but the reasoning transfers to framework choice: pay for the
  complexity you need, not the complexity that's popular).
- *SQLite vs. a managed Postgres add-on.* The persistence requirement is
  "survives restarts and redeploys," not "survives concurrent writers across
  machines" — there's one Fly machine and one volume. SQLite with
  `journal_mode = WAL` gives that for free, with no network hop and no
  second service to deploy or keep credentials for (SQLite's own WAL
  documentation, sqlite.org/wal.html, is the source for why WAL specifically:
  readers don't block the writer, which matters once `tx()` serialises every
  guarded write). A managed Postgres instance would have cost a second Fly
  app, a connection string to manage, and round-trip latency for no
  durability this app actually needs.
- *Hand-rolled guarded writes vs. an ORM's optimistic-locking layer.* An ORM
  would have hidden the one thing every CLAUDE.md rule protects: that a round
  resolves from exactly one `UPDATE ... WHERE status = ... AND closes_at <=
  now`. Writing it by hand means the guard is visible at the call site,
  which is also what makes it reviewable by an agent that didn't write it.
- *Agentic workflow: constraints-first vs. features-first.* The alternative
  to writing README's claim before any code (see "Writing the claim before
  the code" above) was the more common agentic pattern of describing desired
  features and letting the harness infer the rules. Rejected for the same
  reason Fowler's writing on technical debt treats unstated intent as the
  expensive kind of debt (Fowler, "TechnicalDebtQuadrant",
  martinfowler.com/bliki/TechnicalDebtQuadrant.html): rules inferred from
  features are reckless-and-inadvertent by construction, because nobody
  decided them, they just fell out of whatever got built first.

**Chosen.** Plain Node 24 (`node:http`, `node:sqlite`, SSE), no framework, no
ORM, no second service; CLAUDE.md written from a claim fixed before the
server existed, so every rule traces to a clause of it.

**Cost.** No framework means no free routing, templating or build step — the
single-file server and hand-written client JS are the price. No ORM means
every query is hand-checked for the guard it needs, which is slower to write
than generating one, but is also the only way I'd trust an agent to extend it
without silently dropping a guard clause.
