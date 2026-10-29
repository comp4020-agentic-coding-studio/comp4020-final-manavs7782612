### spec/audit-immutability.md

GIVEN an existing audit log entry
WHEN any authenticated role attempts to PATCH or DELETE it directly via the API
THEN the request is rejected regardless of role
