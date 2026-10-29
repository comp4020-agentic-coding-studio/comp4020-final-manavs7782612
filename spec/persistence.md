### spec/persistence.md

GIVEN a locked slot and its audit trail
WHEN the app restarts (simulated redeploy / idle sleep-wake)
THEN the slot's lock state and full audit history are unchanged
