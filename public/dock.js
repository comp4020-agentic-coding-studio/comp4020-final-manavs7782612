// Public, anonymous dock status. No login, no identity, fill counts only.
(() => {
  const $ = (id) => document.getElementById(id);

  function render(docks) {
    const node = $("docks");
    node.innerHTML = "";
    for (const dock of docks) {
      const row = document.createElement("div");
      row.className = "slot-card";
      const title = document.createElement("div");
      title.className = "slot-title";
      title.textContent = dock.name;
      const counts = document.createElement("div");
      counts.className = "row";
      counts.innerHTML = `
        <span class="badge open">${dock.openCount} open</span>
        <span class="badge locked">${dock.lockedCount} locked</span>
        <span class="badge completed">${dock.completedCount} completed</span>
      `;
      row.append(title, counts);
      node.appendChild(row);
    }
  }

  const source = new EventSource("/api/stream?role=consumer");
  source.addEventListener("open", () => ($("conn").textContent = "LIVE"));
  source.addEventListener("error", () => ($("conn").textContent = "RECONNECTING"));
  source.addEventListener("snapshot", (event) => {
    const snap = JSON.parse(event.data);
    $("conn").textContent = "LIVE";
    render(snap.docks);
  });
})();
