import { CONFLICT_KM, SECTOR } from "./airports";

export type Status = "PARKED" | "REQ_TAKEOFF" | "AIRBORNE" | "REQ_LAND" | "CLEARED_LAND";

export const isFlying = (status: string): boolean =>
  status === "AIRBORNE" || status === "REQ_LAND" || status === "CLEARED_LAND";

export interface Point {
  x: number;
  y: number;
}

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

// Constant heading and speed, clamped to the sector. Heading is compass
// degrees: 0 is north (+y), 90 is east (+x).
export function advance(p: Point, headingDeg: number, speedKmS: number, dt: number): Point {
  const rad = (headingDeg * Math.PI) / 180;
  return {
    x: Math.min(SECTOR.maxX, Math.max(SECTOR.minX, p.x + Math.sin(rad) * speedKmS * dt)),
    y: Math.min(SECTOR.maxY, Math.max(SECTOR.minY, p.y + Math.cos(rad) * speedKmS * dt)),
  };
}

export const onEdge = (p: Point): boolean =>
  p.x <= SECTOR.minX || p.x >= SECTOR.maxX || p.y <= SECTOR.minY || p.y >= SECTOR.maxY;

// Two flying planes closer than CONFLICT_KM. Derived each time from positions,
// never stored; ids are returned low-first so a pair has one spelling.
export function computeConflicts(
  planes: { id: number; x: number; y: number; status: string }[],
): [number, number][] {
  const flying = planes.filter((p) => isFlying(p.status));
  const pairs: [number, number][] = [];
  for (let i = 0; i < flying.length; i++) {
    for (let j = i + 1; j < flying.length; j++) {
      if (distance(flying[i], flying[j]) < CONFLICT_KM) {
        pairs.push([Math.min(flying[i].id, flying[j].id), Math.max(flying[i].id, flying[j].id)]);
      }
    }
  }
  return pairs;
}
