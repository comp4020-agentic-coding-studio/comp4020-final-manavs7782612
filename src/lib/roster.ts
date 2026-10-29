// The whole cast, fixed in source: no signup, no accounts system. Small
// enough to hand-author and to demonstrate the compliance gate immediately
// (a couple of drivers start with hours too low for most slots).
export interface DispatcherSeed {
  id: number;
  name: string;
  pin: string;
}

export interface DriverSeed {
  id: number;
  name: string;
  pin: string;
  hoursRemaining: number;
}

export interface DockSeed {
  id: number;
  name: string;
}

export const DISPATCHERS: DispatcherSeed[] = [
  { id: 1, name: "Priya", pin: "1234" },
  { id: 2, name: "Wayne", pin: "2345" },
  { id: 3, name: "Fatima", pin: "3456" },
  { id: 4, name: "Doug", pin: "4567" },
];

export const DRIVERS: DriverSeed[] = [
  { id: 1, name: "Callum", pin: "1111", hoursRemaining: 9.5 },
  { id: 2, name: "Renee", pin: "2222", hoursRemaining: 7 },
  { id: 3, name: "Tane", pin: "3333", hoursRemaining: 0.75 }, // seeded low: demonstrates compliance-block immediately
  { id: 4, name: "Ingrid", pin: "4444", hoursRemaining: 4.25 },
  { id: 5, name: "Marcus", pin: "5555", hoursRemaining: 11 },
  { id: 6, name: "Yusuf", pin: "6666", hoursRemaining: 1.5 }, // seeded low: a second near-threshold case
  { id: 7, name: "Bridget", pin: "7777", hoursRemaining: 6.25 },
  { id: 8, name: "Soo-ah", pin: "8888", hoursRemaining: 10 },
];

export const DOCKS: DockSeed[] = [
  { id: 1, name: "Dock A — Eastern Creek" },
  { id: 2, name: "Dock B — Eastern Creek" },
  { id: 3, name: "Dock C — Wetherill Park" },
];

export type Role = "dispatcher" | "driver";

export function findPerson(
  name: string,
  pin: string,
  role: Role,
): DispatcherSeed | DriverSeed | undefined {
  const pool: (DispatcherSeed | DriverSeed)[] = role === "dispatcher" ? DISPATCHERS : DRIVERS;
  return pool.find((p) => p.name === name && p.pin === pin);
}
