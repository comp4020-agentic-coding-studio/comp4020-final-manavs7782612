### spec/concurrent-claim.md

GIVEN an open slot
WHEN two claims for different compliant drivers arrive within 50ms of each other
THEN exactly one claim succeeds
AND the losing claim receives a "slot no longer available" rejection within ~1s
AND both attempts appear in the audit log
