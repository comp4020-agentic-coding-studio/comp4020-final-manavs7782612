# Process overview

<!-- DRAFT by Claude, for Manav to rewrite. -->

On 2026-11-05 I abandoned the previous concept (ComplyLogic, a Chain of
Responsibility compliance tracker) and restarted as Group Chat Government, a
multiplayer voting game. The plan I wrote with Claude set one narrow, testable
claim first (README "What good means here") and the harness rules in CLAUDE.md
follow from it, one rule per part of the claim.

Stack: Node 24 with no dependencies — `node:http`, `node:sqlite` and server-sent
events. The guarded-write and SSE-room patterns carry over from the earlier
project; the framework didn't, because the app is one page and a JSON API.

Design judgements are recorded in `decisions/`; the spec in `spec/` checks each
rule against the running app.
