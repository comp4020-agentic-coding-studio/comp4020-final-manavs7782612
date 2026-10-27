// Pilot page. Everything arrives over one live stream and is drawn with
// textContent only. Buttons send intents (turn, speed, request); the server
// decides where the plane is.
(() => {
  const world = JSON.parse(document.getElementById("world").textContent);
  const $ = (id) => document.getElementById(id);
  const FLYING = ["AIRBORNE", "REQ_LAND", "CLEARED_LAND"];
  const pad3 = (n) => String(Math.round(n)).padStart(3, "0");
  const set = (id, text) => {
    const node = $(id);
    if (node.textContent !== text) node.textContent = text;
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const bearing = (from, to) => (Math.round((Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI) + 360) % 360;

  const scope = Scope.create($("scope"), world, { rangeKm: world.view });
  scope.start();
  let snap = null;

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
        body: JSON.stringify(body ?? {}),
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

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-act]");
    if (!button) return;
    const kind = button.dataset.act;
    if (kind === "join") act("/api/pilot/join", { airport: $("start").value });
    else if (kind === "leave") act("/api/pilot/leave");
    else if (kind === "request-takeoff") act("/api/pilot/request-takeoff");
    else if (kind === "request-landing") act("/api/pilot/request-landing", { airport: $("land-at").value });
    else if (kind === "steer") {
      const body = {};
      if (button.dataset.turn) body.turn = Number(button.dataset.turn);
      if (button.dataset.speed) body.speed = Number(button.dataset.speed);
      act("/api/pilot/steer", body);
    }
  });

  // Game-style steering: WASD held keys are sampled on an interval close to
  // the 250 ms sim tick, so at most one steer request goes out per tick no
  // matter how many keys are held or how long. A/D turn, W/S change speed.
  const STEER_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
  const held = new Set();
  const typing = (target) => target.closest("input, select, textarea, button");

  window.addEventListener("keydown", (event) => {
    if (!STEER_KEYS.has(event.code)) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (typing(event.target)) return;
    held.add(event.code);
  });
  window.addEventListener("keyup", (event) => {
    held.delete(event.code);
  });
  window.addEventListener("blur", () => held.clear());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) held.clear();
  });

  setInterval(() => {
    if (held.size === 0) return;
    const me = snap && snap.me;
    if (!me || !FLYING.includes(me.status)) return;
    const body = {};
    if (held.has("KeyA") !== held.has("KeyD")) body.turn = held.has("KeyA") ? -1 : 1;
    if (held.has("KeyW") !== held.has("KeyS")) body.speed = held.has("KeyW") ? 1 : -1;
    if (body.turn !== undefined || body.speed !== undefined) act("/api/pilot/steer", body);
  }, 200);

  function describe(me) {
    const held = me.held ? " (ON HOLD: you were away)" : "";
    switch (me.status) {
      case "PARKED":
        return `PARKED at ${me.airport}`;
      case "REQ_TAKEOFF":
        return `WAITING FOR TOWER: takeoff from ${me.airport}`;
      case "AIRBORNE":
        return `AIRBORNE${held}`;
      case "REQ_LAND":
        return `WAITING FOR TOWER: landing at ${me.target}${held}`;
      case "CLEARED_LAND":
        return `CLEARED TO LAND at ${me.target}${held}`;
      default:
        return me.status;
    }
  }

  function nearestAirport(p) {
    let best = null;
    for (const code in world.airports) {
      const d = dist(p, world.airports[code]);
      if (!best || d < best.d) best = { code, d };
    }
    return best;
  }

  function render() {
    const me = snap.me;
    $("join-panel").hidden = !!me;
    $("flight-panel").hidden = !me;

    if (me) {
      set("strip-callsign", me.callsign);
      const status = $("strip-status");
      status.textContent = describe(me);
      status.className = me.status.startsWith("REQ_") ? "alert pending" : "";
      set("strip-heading", pad3(me.heading));
      set("strip-speed", `${Math.round(me.speed * 3600)} km/h`);
      const near = nearestAirport(me);
      set("strip-nearest", `${near.code} ${near.d.toFixed(1)} km`);
      set("strip-advisory", me.advisory ? me.advisory.toUpperCase() : "no advice");

      const flying = FLYING.includes(me.status);
      for (const b of document.querySelectorAll("[data-flying]")) b.disabled = !flying;
      $("btn-takeoff").disabled = me.status !== "PARKED";
      $("btn-landing").disabled = me.status !== "AIRBORNE";
      $("land-at").disabled = me.status !== "AIRBORNE";
      $("wasd-hint").hidden = !flying;
    }

    const others = me ? snap.planes.filter((p) => p.id !== me.id) : [];
    const mine = me ? me.id : null;
    const conflicts = snap.conflicts.filter(([a, b]) => a === mine || b === mine);
    const conflictNode = $("conflict");
    if (!me) {
      conflictNode.textContent = "Join to see traffic near you";
      conflictNode.className = "dim";
    } else if (conflicts.length > 0) {
      const parts = conflicts.map(([a, b]) => {
        const other = snap.planes.find((p) => p.id === (a === mine ? b : a));
        return other ? `${other.callsign} ${dist(me, other).toFixed(1)} km` : "traffic";
      });
      conflictNode.textContent = `CONFLICT: ${parts.join(", ")}: turn away`;
      conflictNode.className = "alert";
    } else {
      conflictNode.textContent = "CLEAR OF TRAFFIC";
      conflictNode.className = "dim";
    }

    const list = $("nearby");
    list.replaceChildren();
    for (const p of others) {
      const row = document.createElement("div");
      row.className = "row";
      row.textContent = `${p.callsign} ${p.status.replace("_", " ")} brg ${pad3(bearing(me, p))} ${dist(me, p).toFixed(1)} km hdg ${pad3(p.heading)}`;
      list.append(row);
    }
    if (me && others.length === 0) list.textContent = `Nobody within ${world.view} km.`;
    set("range-note", me ? `You only see planes within ${world.view} km of you.` : "");

    const runways = $("runways");
    runways.replaceChildren();
    for (const code in world.airports) {
      const holder = snap.runways[code];
      const row = document.createElement("div");
      row.className = "row";
      const plane = holder ? `CBR${holder}` : null;
      row.textContent = `${code} ${world.airports[code].name}: ${plane ? `BUSY (${plane} landing)` : "FREE"}`;
      if (plane) row.className = "row alert";
      runways.append(row);
    }
  }

  const source = new EventSource("/api/stream?role=pilot");
  source.onopen = () => {
    set("conn", "LIVE");
  };
  source.onerror = () => {
    set("conn", "RECONNECTING");
  };
  source.addEventListener("snapshot", (event) => {
    snap = JSON.parse(event.data);
    scope.update(snap);
    render();
  });
})();
