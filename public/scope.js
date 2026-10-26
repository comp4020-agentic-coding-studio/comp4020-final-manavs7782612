// The radar scope: one inline SVG, drawn in kilometres (north up). It is a
// glance aid: everything it shows is also listed as text on the page.
// Textual content goes in via textContent only.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(NS, tag);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FLYING = ["AIRBORNE", "REQ_LAND", "CLEARED_LAND"];

  // world: { sector, airports }; opts.rangeKm draws a visibility ring round "me"
  function create(svg, world, opts = {}) {
    const { sector, airports } = world;
    svg.setAttribute(
      "viewBox",
      `${sector.minX} ${-sector.maxY} ${sector.maxX - sector.minX} ${sector.maxY - sector.minY}`,
    );
    svg.setAttribute("class", "scope");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Radar scope of the Canberra sector. The same information is listed as text.");

    svg.append(
      el("rect", {
        class: "sector",
        x: sector.minX,
        y: -sector.maxY,
        width: sector.maxX - sector.minX,
        height: sector.maxY - sector.minY,
      }),
    );
    for (const code in airports) {
      const a = airports[code];
      svg.append(
        el("rect", { class: "airport", x: a.x - 0.35, y: -a.y - 0.35, width: 0.7, height: 0.7 }),
        el("text", { x: a.x + 0.6, y: -a.y + 0.3 }, code),
      );
    }
    const live = el("g", {});
    svg.append(live);

    let snap = null;
    let receivedAt = 0;

    function draw(now) {
      live.replaceChildren();
      if (!snap) return;
      const dt = Math.min(0.5, (now - receivedAt) / 1000);
      const me = snap.me;
      const at = new Map();
      for (const p of snap.planes) {
        const moving = FLYING.includes(p.status) && !p.held;
        const rad = (p.heading * Math.PI) / 180;
        at.set(p.id, {
          x: p.x + (moving ? Math.sin(rad) * p.speed * dt : 0),
          y: p.y + (moving ? Math.cos(rad) * p.speed * dt : 0),
        });
      }
      if (me && opts.rangeKm && at.has(me.id)) {
        const c = at.get(me.id);
        live.append(el("circle", { class: "ring", cx: c.x, cy: -c.y, r: opts.rangeKm }));
      }
      const inConflict = new Set();
      for (const [a, b] of snap.conflicts) {
        inConflict.add(a);
        inConflict.add(b);
      }
      for (const p of snap.planes) {
        const pos = at.get(p.id);
        const mine = me && p.id === me.id;
        if (!FLYING.includes(p.status)) continue;
        const rad = (p.heading * Math.PI) / 180;
        live.append(
          el("line", {
            class: "heading",
            x1: pos.x,
            y1: -pos.y,
            x2: pos.x + Math.sin(rad) * 1.1,
            y2: -(pos.y + Math.cos(rad) * 1.1),
          }),
          el("circle", { class: mine ? "blip me" : "blip", cx: pos.x, cy: -pos.y, r: 0.32 }),
        );
        if (inConflict.has(p.id)) {
          live.append(el("circle", { class: "conflict", cx: pos.x, cy: -pos.y, r: 0.9 }));
        }
        live.append(
          el(
            "text",
            {
              class: inConflict.has(p.id) ? "conflict-tag" : mine ? "tag me" : "tag",
              x: pos.x + 0.6,
              y: -pos.y - 0.5,
            },
            inConflict.has(p.id) ? `${p.callsign} CONFLICT` : p.callsign,
          ),
        );
      }
    }

    function frame(now) {
      draw(now);
      requestAnimationFrame(frame);
    }

    return {
      update(next) {
        snap = next;
        receivedAt = performance.now();
        draw(receivedAt);
      },
      start() {
        if (!reduced) requestAnimationFrame(frame);
      },
    };
  }

  window.Scope = { create };
})();
