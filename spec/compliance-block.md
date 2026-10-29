### spec/compliance-block.md

GIVEN a driver with 1 hour of legal driving time remaining
WHEN a dispatcher claims a 3-hour slot for that driver
THEN the claim is rejected with a specific reason code (not a generic error)
AND no slot-locked record is written
AND a rejection entry is written to the audit log
