// Tower page. The stream sends a full snapshot about four times a second, so
// rows that hold buttons are kept and updated in place: rebuilding them would
// replace a button between mouse-down and mouse-up and swallow the click.
// Everything is drawn with textContent only.
(() => {
  const world = JSON.parse(document.getElementById("world").textContent);
  const $ = (id) => document.getElementById(id);
  const FLYING = ["AIRBORNE", "REQ_LAND", "CLEARED_LAND"];
  const pad3 = (n) => String(Math.round(n)).padStart(3, "0");
  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

  const scope = Scope.create($("scope"), world, {});
  scope.start();

  function say(text, alert) {
    const node = $("msg");
    node.textContent = text;
    node.className = alert ? "alert" : "";
  }

  async function act(path, body) {
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const info = await res.json().catch(() => ({}));
        say(`REFUSED: ${info.reason ?? res.status}`, true);
        return;
      }
      say("");
    } catch {
      say("NO CONNECTION: your last action may not have gone through", true);
    }
  }

  // Keep one element per key, in order, updating rather than recreating.
  function sync(container, items, keyOf, make, update) {
    const existing = new Map([...container.children].map((c) => [c.dataset.key, c]));
    const ordered = [];
    for (const item of items) {
      const key = String(keyOf(item));
      let row = existing.get(key);
      if (!row) {
        row = make(item);
        row.dataset.key = key;
      }
      existing.delete(key);
      update(row, item);
      ordered.push(row);
    }
    for (const stale of existing.values()) stale.remove();
    ordered.forEach((row, i) => {
      if (container.children[i] !== row) container.insertBefore(row, container.children[i] ?? null);
    });
  }

  function button(label, act, extra = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "small";
    b.textContent = label;
    b.dataset.act = act;
    for (const k in extra) b.dataset[k] = extra[k];
    return b;
  }

  const requests = $("requests");
  const board = $("board");

  for (const container of [requests, board]) {
    container.addEventListener("click", (event) => {
      const b = event.target.closest("button[data-act]");
      if (!b || b.disabled) return;
      const id = Number(b.closest("[data-key]").dataset.key);
      if (b.dataset.act === "clear") {
        const status = b.closest("[data-key]").dataset.status;
        act(status === "REQ_TAKEOFF" ? "/api/tower/clear-takeoff" : "/api/tower/clear-landing", { id });
      } else if (b.dataset.act === "deny") act("/api/tower/deny", { id });
      else if (b.dataset.act === "advise") act("/api/tower/advise", { id, phrase: b.dataset.phrase });
    });
  }

  function makeRequest() {
    const row = document.createElement("div");
    row.className = "row";
    const text = document.createElement("span");
    text.className = "grow alert pending";
    row.append(text, button("Clear", "clear"), button("Deny", "deny"));
    return row;
  }

  function makeStrip() {
    const row = document.createElement("div");
    row.className = "row";
    const text = document.createElement("span");
    text.className = "grow";
    const advice = document.createElement("span");
    advice.className = "dim";
    row.append(text, advice);
    for (const phrase of world.phrases) row.append(button(phrase, "advise", { phrase }));
    return row;
  }

  function render(snap) {
    const meId = snap.me ? snap.me.id : null;
    const planes = snap.planes;

    const pending = planes.filter((p) => p.status === "REQ_TAKEOFF" || p.status === "REQ_LAND");
    $("no-requests").hidden = pending.length > 0;
    sync(requests, pending, (p) => p.id, makeRequest, (row, p) => {
      row.dataset.status = p.status;
      const where = p.status === "REQ_TAKEOFF" ? `takeoff ${p.airport}` : `landing ${p.target}`;
      const mine = p.id === meId;
      setText(row.children[0], `WAITING ${p.callsign} ${where}${mine ? " (yours: you can't clear it)" : ""}`);
      for (const b of row.querySelectorAll("button")) b.disabled = mine;
    });

    $("no-planes").hidden = planes.length > 0;
    sync(board, planes, (p) => p.id, makeStrip, (row, p) => {
      const flying = FLYING.includes(p.status);
      const mine = p.id === meId;
      const where = p.airport ?? (p.target ? `to ${p.target}` : "");
      const motion = flying ? ` hdg ${pad3(p.heading)} ${Math.round(p.speed * 3600)} km/h` : "";
      const held = p.held ? " ON HOLD" : "";
      setText(row.children[0], `${p.callsign} ${p.status.replace("_", " ")} ${where}${motion}${held}${mine ? " (you)" : ""}`);
      setText(row.children[1], p.advisory ? `told: ${p.advisory}` : "");
      for (const b of row.querySelectorAll("button")) {
        b.hidden = !flying;
        b.disabled = mine;
      }
    });

    const byId = new Map(planes.map((p) => [p.id, p]));
    const conflicts = $("conflicts");
    if (snap.conflicts.length === 0) {
      conflicts.textContent = "none";
      conflicts.className = "dim";
    } else {
      conflicts.replaceChildren();
      conflicts.className = "";
      for (const [a, b] of snap.conflicts) {
        const pa = byId.get(a);
        const pb = byId.get(b);
        const row = document.createElement("div");
        row.className = "row alert";
        const km = pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y).toFixed(1) : "?";
        row.textContent = `CONFLICT ${pa ? pa.callsign : a} and ${pb ? pb.callsign : b}: ${km} km apart`;
        conflicts.append(row);
      }
    }

    const runways = $("runways");
    runways.replaceChildren();
    for (const code in world.airports) {
      const holder = snap.runways[code];
      const row = document.createElement("div");
      row.className = holder ? "row alert" : "row";
      row.textContent = `${code} ${world.airports[code].name}: ${holder ? `BUSY (CBR${holder} landing)` : "FREE"}`;
      runways.append(row);
    }

    const m = snap.metrics;
    if (m) {
      const denials = Object.entries(m.denials).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
      $("metrics").textContent = [
        `tick ${m.hz} Hz, last ${m.tickMs} ms, worst ${m.worstTickMs} ms`,
        `a plane moves at most ${m.stalenessKm} km between updates`,
        `connected: ${m.clients.pilot} pilot, ${m.clients.tower} tower`,
        `refusals since boot: ${denials}`,
      ].join("\n");
      $("metrics").style.whiteSpace = "pre-line";
    }

    const events = $("events");
    events.replaceChildren();
    for (const e of snap.events ?? []) {
      const row = document.createElement("div");
      row.className = "row";
      const time = new Date(e.at).toLocaleTimeString("en-AU");
      row.textContent = `${time} ${e.actor} ${e.role} ${e.kind}${e.plane ? ` CBR${e.plane}` : ""}${e.detail ? ` ${e.detail}` : ""}`;
      events.append(row);
    }
  }

  const source = new EventSource("/api/stream?role=tower");
  source.onopen = () => setText($("conn"), "LIVE");
  source.onerror = () => setText($("conn"), "RECONNECTING");
  source.addEventListener("snapshot", (event) => {
    const snap = JSON.parse(event.data);
    scope.update(snap);
    render(snap);
  });
})();
