// Server-side "who did what," one JSON line per event, to stdout --- captured
// by `flyctl logs` and persisted there past the process's own lifetime. The
// actor is always a hash of the identity cookie (or "system"), never anything
// a request body claimed. See decisions/0003-server-authoritative-steering.md.
export function logEvent(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...fields }));
}
