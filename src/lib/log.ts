// Server-side "who did what," one JSON line per event, to stdout --- captured
// by `flyctl logs` and persisted there past the process's own lifetime (and,
// unlike the request body, never something the client could spoof: userId
// here always comes from the identity cookie, same as the db write it
// describes). See decisions/0002-presence-identity-cookie.md.
export function logEvent(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...fields }));
}
