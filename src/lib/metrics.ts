// Measured numbers the tower shows. Process memory only: they describe this
// run of the server, not the world, so losing them on restart loses nothing.
export const metrics = {
  tickMs: 0,
  worstTickMs: 0,
  hz: 0,
  denials: {} as Record<string, number>,
};
