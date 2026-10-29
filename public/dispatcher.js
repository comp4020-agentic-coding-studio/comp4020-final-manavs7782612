// Dispatcher board. Everything arrives over one live stream; buttons POST
// actions and the server decides what actually happened. Rendered with
// textContent only.
(() => {
  const $ = (id) => document.getElementById(id);
  const fmt = (iso) => new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });

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
        return false;
      }
      say("");
      return true;
    } catch {
      say("NO CONNECTION: your last action may not have gone through", true);
      return false;
    }
  }

  $("logout").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    window.location.href = "/";
  });

  let snap = null;

  function driverOptions(driverId) {
    if (!snap) return "";
    return snap.drivers
      .map((d) => `<option value="${d.id}" ${d.id === driverId ? "selected" : ""}>${d.name} (${d.hours_remaining.toFixed(2)}h)</option>`)
      .join("");
  }

  function renderBoard() {
    const board = $("board");
    board.innerHTML = "";
    if (!snap || snap.slots.length === 0) {
      $("no-slots").hidden = false;
      return;
    }
    $("no-slots").hidden = true;

    for (const slot of snap.slots) {
      const dock = snap.docks.find((d) => d.id === slot.dock_id);
      const driver = slot.driver_id ? snap.drivers.find((d) => d.id === slot.driver_id) : null;
      const card = document.createElement("div");
      card.className = "slot-card";

      const title = document.createElement("div");
      title.className = "slot-title";
      title.textContent = `${dock ? dock.name : "dock " + slot.dock_id} — ${fmt(slot.start_at)} (${slot.duration_min}min, +${slot.transit_buffer_min}min transit)`;
      card.appendChild(title);

      const status = document.createElement("div");
      status.className = "row";
      const badge = document.createElement("span");
      badge.className = `badge ${slot.status}`;
      badge.textContent = slot.status;
      status.appendChild(badge);
      if (driver) {
        const who = document.createElement("span");
        who.className = "dim";
        who.textContent = driver.name;
        status.appendChild(who);
      }
      card.appendChild(status);

      const controls = document.createElement("div");
      controls.className = "keys";

      if (slot.status === "open") {
        const select = document.createElement("select");
        select.innerHTML = driverOptions(null);
        const claim = document.createElement("button");
        claim.type = "button";
        claim.className = "go";
        claim.textContent = "Claim";
        claim.addEventListener("click", () => act("/api/claim", { slotId: slot.id, driverId: Number(select.value) }));
        controls.append(select, claim);
      } else if (slot.status === "locked") {
        const select = document.createElement("select");
        select.innerHTML = driverOptions(slot.driver_id);
        const reassign = document.createElement("button");
        reassign.type = "button";
        reassign.textContent = "Reassign";
        reassign.addEventListener("click", () => act("/api/reassign", { slotId: slot.id, driverId: Number(select.value) }));
        const complete = document.createElement("button");
        complete.type = "button";
        complete.className = "go";
        complete.textContent = "Complete";
        complete.addEventListener("click", () => act("/api/complete", { slotId: slot.id }));
        controls.append(select, reassign, complete);
      }
      card.appendChild(controls);
      board.appendChild(card);
    }
  }

  function renderEvents() {
    const node = $("events");
    node.innerHTML = "";
    if (!snap || !snap.events) return;
    for (const ev of snap.events) {
      const line = document.createElement("div");
      line.className = "event-line" + (ev.kind.endsWith("-rejected") ? " rejected" : "");
      const reason = ev.reason ? ` [${ev.reason}]` : "";
      line.textContent = `${new Date(ev.at).toLocaleTimeString()} ${ev.actor} ${ev.kind} slot=${ev.slot ?? "-"}${reason}`;
      node.appendChild(line);
    }
  }

  const source = new EventSource("/api/stream?role=dispatcher");
  source.addEventListener("open", () => ($("conn").textContent = "LIVE"));
  source.addEventListener("error", () => ($("conn").textContent = "RECONNECTING"));
  source.addEventListener("snapshot", (event) => {
    snap = JSON.parse(event.data);
    $("conn").textContent = "LIVE";
    $("who").textContent = `Docks: ${snap.docks.length} · Slots: ${snap.slots.length} · Drivers: ${snap.drivers.length}`;
    renderBoard();
    renderEvents();
  });
})();
