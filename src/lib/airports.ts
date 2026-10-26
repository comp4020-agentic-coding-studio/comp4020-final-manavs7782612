// The whole world: four Canberra town centres. x/y are kilometres from a point
// in the middle of the sector (x east, y north), projected flat from the real
// latitude/longitude; every pair is more than 8 km apart. Headings are compass
// degrees (0 = north, clockwise) and always a multiple of the turn step.
export const AIRPORTS = ["BEL", "WOD", "GUN", "MAJ"] as const;
export type Airport = (typeof AIRPORTS)[number];

export const AIRPORT_INFO: Record<
  Airport,
  { name: string; x: number; y: number; takeoffHeading: number }
> = {
  BEL: { name: "Belconnen", x: -4.9, y: 4.6, takeoffHeading: 135 },
  WOD: { name: "Woden", x: -3.1, y: -7.4, takeoffHeading: 15 },
  GUN: { name: "Gungahlin", x: 1.2, y: 10.5, takeoffHeading: 180 },
  MAJ: { name: "Majura", x: 6.8, y: -3.0, takeoffHeading: 285 },
};

export const SECTOR = { minX: -12, maxX: 14, minY: -14, maxY: 17 };

// km per second: three fixed steps, never a free number from a client
export const SPEEDS = [0.15, 0.3, 0.45] as const;
export const START_SPEED_STEP = 1;
export const TURN_STEP = 15;

export const VIEW_RADIUS_KM = 5;
export const CONFLICT_KM = 1.0;
export const LAND_KM = 0.5;

export const PHRASES = ["expedite", "reduce speed", "turn left", "turn right"] as const;
export type Phrase = (typeof PHRASES)[number];

export const isAirport = (v: unknown): v is Airport => AIRPORTS.includes(v as Airport);
export const isPhrase = (v: unknown): v is Phrase => PHRASES.includes(v as Phrase);
