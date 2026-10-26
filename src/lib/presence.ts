// Who is connected right now. Process memory on purpose: this is not plane
// state, and it must reset on boot. A wake from a Fly auto-stop closes every
// stream, so anything measured against wall-clock time would make every owner
// look like they left. Absence is measured against uptime instead: an owner we
// have never seen this run counts from bootAt.
export const HOLD_AFTER_MS = 60_000;

const bootAt = Date.now();
const connections = new Map<string, number>();
const lastSeen = new Map<string, number>();

export function connect(uid: string): void {
  connections.set(uid, (connections.get(uid) ?? 0) + 1);
  lastSeen.set(uid, Date.now());
}

export function disconnect(uid: string): void {
  const open = (connections.get(uid) ?? 1) - 1;
  if (open <= 0) connections.delete(uid);
  else connections.set(uid, open);
  lastSeen.set(uid, Date.now());
}

export function isHeld(uid: string, now: number): boolean {
  if (connections.has(uid)) return false;
  return now - (lastSeen.get(uid) ?? bootAt) > HOLD_AFTER_MS;
}

// Forget owners who left a while ago, so cookies minted and dropped in bulk
// can't grow this map without bound. Forgetting is safe: an unknown owner
// falls back to bootAt, which is no later than anything swept here.
export function sweep(now: number): void {
  for (const [uid, at] of lastSeen) {
    if (!connections.has(uid) && now - at > 10 * 60_000) lastSeen.delete(uid);
  }
}
