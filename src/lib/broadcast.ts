// One in-memory set of open SSE streams. Enough because fly.toml pins this
// app to a single machine; a second process would need a shared broadcaster.
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();

export function subscribe(controller: ReadableStreamDefaultController<Uint8Array>): void {
  clients.add(controller);
}

export function unsubscribe(controller: ReadableStreamDefaultController<Uint8Array>): void {
  clients.delete(controller);
}

export function broadcastCount(count: number): void {
  const chunk = encoder.encode(`event: count\ndata: ${count}\n\n`);
  for (const controller of clients) {
    try {
      controller.enqueue(chunk);
    } catch {
      clients.delete(controller);
    }
  }
}
