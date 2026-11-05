import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { MAX_STREAMS, MAX_STREAMS_PER_CITIZEN } from "./lib/config.ts";
import {
  Refused, citizenByToken, connect, declare, disconnect, ensureRound, join as joinTable,
  myVote, passedBills, propose, resetPresence, snapshot, sweep, version, vote,
} from "./lib/game.ts";
import { render } from "./lib/markdown.ts";

const PORT = Number(process.env.PORT ?? 8080);
const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC = join(ROOT, "public");
const COOKIE = "gcg";

resetPresence();

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
};

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function tokenOf(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (auth) return auth;
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === COOKIE) return v;
  }
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw new Refused(413, "too long");
  }
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new Refused(400, "send JSON");
  }
}

// ---------- the SSE room ----------

type Client = { res: ServerResponse; citizenId: number | null };
const clients = new Set<Client>();

function frame(c: Client, base: ReturnType<typeof snapshot>): string {
  return `data: ${JSON.stringify({ ...base, me: c.citizenId, myVote: c.citizenId ? myVote(c.citizenId) : null })}\n\n`;
}

function pushAll(): void {
  if (!clients.size) return;
  const base = snapshot();
  for (const c of clients) c.res.write(frame(c, base));
}

// One clock for the room: resolve whatever has expired, then push if anything
// moved (or once a second while a countdown is running, so clocks stay honest).
let seen = -1;
setInterval(() => {
  sweep();
  ensureRound();
  if (version !== seen || clients.size) {
    seen = version;
    pushAll();
  }
}, 1000).unref();

function stream(req: IncomingMessage, res: ServerResponse): void {
  const me = citizenByToken(tokenOf(req));
  const mine = me ? [...clients].filter((c) => c.citizenId === me.id).length : 0;
  if (clients.size >= MAX_STREAMS || mine >= MAX_STREAMS_PER_CITIZEN) return send(res, 503, { error: "too many open tabs" });
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
  const c: Client = { res, citizenId: me ? (me.id as number) : null };
  clients.add(c);
  if (c.citizenId) connect(c.citizenId);
  res.write(frame(c, snapshot()));
  pushAll();
  req.on("close", () => {
    clients.delete(c);
    if (c.citizenId) disconnect(c.citizenId);
    pushAll();
  });
}

// ---------- routes ----------

function readmePage(): string {
  const md = readFileSync(join(ROOT, "README.md"), "utf8");
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>About Group Chat Government</title><link rel="stylesheet" href="/style.css"></head>
<body class="doc"><main><p><a href="/">&larr; back to the table</a></p>${render(md)}</main></body></html>`;
}

async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  if (path === "/api/stream" && req.method === "GET") return stream(req, res);
  if (path === "/api/state" && req.method === "GET") {
    const me = citizenByToken(tokenOf(req));
    return send(res, 200, { ...snapshot(), me: me?.id ?? null, myVote: me ? myVote(me.id) : null });
  }
  if (path === "/api/bills" && req.method === "GET") return send(res, 200, passedBills());
  if (req.method !== "POST") return send(res, ["/api/stream", "/api/state", "/api/bills"].includes(path) ? 405 : 404, { error: "method not allowed" });

  if (!["/api/join", "/api/declare", "/api/vote", "/api/propose"].includes(path)) return send(res, 404, { error: "not found" });
  const b = await body(req);
  if (path === "/api/join") {
    const { token, id } = joinTable(b.name);
    res.setHeader("set-cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
    return send(res, 201, { id, token });
  }
  const me = citizenByToken(tokenOf(req));
  if (!me) throw new Refused(401, "join the table first");
  if (path === "/api/declare") declare(me.id);
  else if (path === "/api/vote") vote(me.id, b.choice);
  else propose(me.id, b.text);
  pushAll();
  send(res, 200, { ok: true });
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  try {
    if (path.startsWith("/api/")) return await api(req, res, path);
    if (path === "/readme" || path === "/readme/") {
      res.writeHead(200, { "content-type": TYPES[".html"] });
      return res.end(readmePage());
    }
    const file = normalize(join(PUBLIC, path === "/" ? "index.html" : path));
    if (!file.startsWith(PUBLIC)) return send(res, 404, { error: "not found" });
    const data = readFileSync(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch (err) {
    if (err instanceof Refused) return send(res, err.status, { error: err.message });
    if ((err as NodeJS.ErrnoException).code === "ENOENT" || (err as NodeJS.ErrnoException).code === "EISDIR") {
      return send(res, 404, { error: "not found" });
    }
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: "something broke" });
  }
}).listen(PORT, "0.0.0.0", () => console.log(`listening on :${PORT}`));
