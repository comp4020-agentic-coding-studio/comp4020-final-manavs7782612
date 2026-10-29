// Driver view: own slots plus the open slots they're compliant for. Entirely
// read-only — a driver can't claim for themselves (CLAUDE.md: the
// dispatcher claims).
(() => {
  const $ = (id) => document.getElementById(id);
  const fmt = (iso) => new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });

  $("logout").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    window.location.href = "/";
  });

  function card(slot) {
    const el = document.createElement("div");
    el.className = "slot-card";
    const title = document.createElement("div");
    title.className = "slot-title";
    title.textContent = `${fmt(slot.start_at)} (${slot.duration_min}min, +${slot.transit_buffer_min}min transit)`;
    const badge = document.createElement("span");
    badge.className = `badge ${slot.status}`;
    badge.textContent = slot.status;
    el.append(title, badge);
    return el;
  }

  function render(list, slots, emptyId) {
    list.innerHTML = "";
    $(emptyId).hidden = slots.length > 0;
    for (const slot of slots) list.appendChild(card(slot));
  }

  const source = new EventSource("/api/stream?role=driver");
  source.addEventListener("open", () => ($("conn").textContent = "LIVE"));
  source.addEventListener("error", () => ($("conn").textContent = "RECONNECTING"));
  source.addEventListener("snapshot", (event) => {
    const snap = JSON.parse(event.data);
    $("conn").textContent = "LIVE";
    render($("mine"), snap.mySlots, "no-mine");
    render($("open"), snap.openCompliant, "no-open");
  });
})();
