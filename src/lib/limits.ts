// Steering rate limit: a token bucket per cookie, in memory. It stops one tab
// hammering the server; it is NOT what bounds abuse, because a cookie costs
// nothing to mint. The global caps (planes, streams) do that.
const CAPACITY = 10;
const REFILL_PER_SECOND = 10;

const buckets = new Map<string, { tokens: number; at: number }>();

export function allowSteer(uid: string, now = performance.now()): boolean {
  const bucket = buckets.get(uid) ?? { tokens: CAPACITY, at: now };
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + ((now - bucket.at) / 1000) * REFILL_PER_SECOND);
  bucket.at = now;
  buckets.set(uid, bucket);
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export function sweepLimiter(now = performance.now()): void {
  for (const [uid, bucket] of buckets) {
    if (now - bucket.at > 60_000) buckets.delete(uid);
  }
}
