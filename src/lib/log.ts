// Server-side "who did what," one JSON line per event, to stdout --- captured
// by `flyctl logs` and persisted there past the process's own lifetime.
export function logEvent(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...fields }));
}
