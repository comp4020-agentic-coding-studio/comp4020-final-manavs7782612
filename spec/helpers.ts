import { inject } from "vitest";

// Shared by the game specs: real citizens, joined over HTTP and seated by
// holding a live event stream, exactly as a browser tab would be.
export const baseUrl = inject("baseUrl");

export type Citizen = { id: number; token: string; name: string; close: () => void };

export async function call(path: string, token?: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(new URL(path, baseUrl), {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const unique = (): string => Math.random().toString(36).slice(2, 10);

export async function join(): Promise<Citizen> {
  const name = `t${unique()}`;
  const { status, json } = await call("/api/join", undefined, { name });
  if (status !== 201) throw new Error(`join failed: ${status} ${JSON.stringify(json)}`);
  const ctrl = new AbortController();
  const res = await fetch(new URL("/api/stream", baseUrl), {
    headers: { authorization: `Bearer ${json.token}` }, signal: ctrl.signal,
  });
  // drain in the background so the server never blocks on us
  (async () => { try { for await (const _ of res.body!) { /* keep the seat */ } } catch { /* closed */ } })();
  return { id: json.id, token: json.token, name, close: () => ctrl.abort() };
}

export const state = async (token?: string): Promise<any> => (await call("/api/state", token)).json;

export async function until<T>(what: string, check: () => Promise<T | undefined | false>, ms = 240_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

// A fresh election with enough time left to act in it. Waits out whatever
// round is running first.
export async function freshElection(): Promise<any> {
  const first = await state();
  return until("a fresh election", async () => {
    const s = await state();
    const r = s.round;
    const usable = r && r.phase === "election" && r.closesAt - s.now > Math.min(1500, s.windows.election * 0.6);
    return usable && (r.id !== first.round?.id || r.candidates.length === 0) ? r : false;
  });
}

export async function afterClose(roundId: number): Promise<any> {
  return until(`round ${roundId} to resolve`, async () => {
    const s = await state();
    return s.round && s.round.id !== roundId ? s : false;
  });
}
