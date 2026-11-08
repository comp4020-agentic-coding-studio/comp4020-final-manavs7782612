// The table. Everything shown comes from the server's snapshot; the only thing
// this file decides is how it looks. User text only ever goes in via textContent.

// A 16x16 1-bit citizen, sitting. '#' is ink, 'o' is paper inside the outline.
const SPRITE = [
  "................",
  ".....######.....",
  "....#oooooo#....",
  "...#oooooooo#...",
  "...#oo#oo#oo#...",
  "...#oooooooo#...",
  "...#ooo##ooo#...",
  "....#oooooo#....",
  ".....######.....",
  "....#oooooo#....",
  "...#o#oooo#o#...",
  "..#oo#oooo#oo#..",
  "..##.#oooo#.##..",
  ".....######.....",
  ".....#.##.#.....",
  ".....##..##.....",
];
const NS = "http://www.w3.org/2000/svg";
function sprite() {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  SPRITE.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", 1); r.setAttribute("height", 1);
    if (ch === "o") r.setAttribute("class", "hole");
    svg.append(r);
  }));
  return svg;
}

const $ = (id) => document.getElementById(id);
let state = null;
let skew = 0; // server clock minus ours, so the countdown follows the server
const seatEls = new Map(); // citizen id -> element
let prev = { candidates: new Set(), presenterId: null, lastEvent: 0 };
// Rebuilding bills/feed is only safe when their content actually changed: both
// lists are append-only (CLAUDE.md "the record is permanent"), so a signature
// of their newest id + length is enough to tell. Rebuilding every tick (the
// server pushes a snapshot once a second even when nothing changed, to keep
// countdowns honest) would tear down and recreate the <li> nodes under a
// reader's cursor, cancelling any text selection mid-read.
let renderedBills = "";
let renderedFailedBills = "";
let renderedFeed = "";

async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);
  return out;
}

function showError(el, err) {
  el.textContent = err ? err.message : "";
}

function bubbleText(c, s) {
  const r = s.round;
  if (r && r.presenterId === c.id && r.phase === "bill") {
    return r.billText ? `“${r.billText}”` : "drafting a bill…";
  }
  if (r?.phase === "election" && r.candidates.some((k) => k.id === c.id)) return "I want to be Presenter!";
  if (r?.status === "voting" && r.voters.includes(c.id)) return "voted";
  return "";
}

function jump(el) {
  el.classList.remove("jump");
  void el.offsetWidth;
  el.classList.add("jump");
  setTimeout(() => el.classList.remove("jump"), 1100);
}

function renderTable(s) {
  const table = $("table");
  const here = new Set(s.citizens.map((c) => c.id));
  for (const [id, el] of seatEls) if (!here.has(id)) { el.remove(); seatEls.delete(id); }

  const r = s.round;
  const candidates = new Set(r?.phase === "election" ? r.candidates.map((k) => k.id) : []);
  const presenterId = r?.phase === "bill" ? r.presenterId : null;

  for (const c of s.citizens) {
    if (c.seat === null) continue;
    let el = seatEls.get(c.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "seat";
      const chair = document.createElement("div"); chair.className = "chair";
      const fig = document.createElement("div"); fig.className = "sprite"; fig.append(sprite());
      const bubble = document.createElement("div"); bubble.className = "bubble";
      const name = document.createElement("b"); const says = document.createElement("span");
      bubble.append(name, says);
      el.append(chair, fig, bubble);
      table.append(el);
      seatEls.set(c.id, el);
    }
    const angle = (c.seat / s.seats) * 2 * Math.PI - Math.PI / 2;
    el.style.left = `${50 + 38 * Math.cos(angle)}%`;
    el.style.top = `${54 + 38 * Math.sin(angle)}%`;
    el.querySelector("b").textContent = c.id === s.me ? `${c.name} (you)` : c.name;
    el.querySelector(".bubble span").textContent = bubbleText(c, s);
    el.classList.toggle("me", c.id === s.me);
    el.classList.toggle("candidate", candidates.has(c.id));
    el.classList.toggle("presenter", presenterId === c.id);
    if (candidates.has(c.id) && !prev.candidates.has(c.id)) jump(el);
  }

  // A bill passing makes its Presenter jump once they've sat back down.
  const latest = s.feed[0];
  if (latest && latest.id > prev.lastEvent && prev.lastEvent && latest.kind === "passed") {
    const winner = s.citizens.find((c) => c.name === latest.name);
    if (winner && seatEls.get(winner.id)) jump(seatEls.get(winner.id));
  }
  prev = { candidates, presenterId, lastEvent: latest?.id ?? prev.lastEvent };

  const standing = s.citizens.filter((c) => c.seat === null).map((c) => c.name);
  $("gallery").textContent = standing.length ? `In the gallery, waiting for a seat: ${standing.join(", ")}` : "";
  $("table-label").textContent = `${s.citizens.length} AT THE TABLE`;
}

function button(label, pressed, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.setAttribute("aria-pressed", String(pressed));
  b.addEventListener("click", async () => {
    try { showError($("action-error"), null); await onClick(); } catch (err) { showError($("action-error"), err); }
  });
  return b;
}

function nameOf(s, id) {
  return s.citizens.find((c) => c.id === id)?.name ?? "someone";
}

function renderControls(s) {
  const r = s.round;
  const actions = $("actions");
  actions.replaceChildren();
  $("bill").hidden = true;
  const proposing = r?.phase === "bill" && r.status === "drafting" && r.presenterId === s.me;
  $("propose-form").hidden = !proposing;

  if (!r) {
    $("phase-title").textContent = "Waiting for citizens…";
    $("phase-detail").textContent = "The table sits once someone is at it.";
    return;
  }
  const joined = s.me !== null;
  if (r.phase === "election") {
    $("phase-title").textContent = "Electing a Presenter";
    $("phase-detail").textContent = r.candidates.length
      ? "Vote for who presents the next bill. Most votes when the clock runs out wins."
      : "Nobody has stood yet. Anyone may.";
    if (joined && !r.candidates.some((k) => k.id === s.me)) {
      actions.append(button("I want to be the Bill Presenter", false, () => post("/api/declare")));
    }
    for (const k of r.candidates) {
      const label = `${k.name} - ${k.votes} vote${k.votes === 1 ? "" : "s"}`;
      actions.append(joined ? button(label, s.myVote === String(k.id), () => post("/api/vote", { choice: k.id })) : Object.assign(document.createElement("span"), { textContent: label }));
    }
  } else if (r.status === "drafting") {
    $("phase-title").textContent = `${nameOf(s, r.presenterId)} has the floor`;
    $("phase-detail").textContent = r.presenterId === s.me
      ? "Write the bill. If time runs out with nothing tabled, it fails."
      : "The Presenter is drafting. Wait for the bill.";
  } else {
    $("phase-title").textContent = `${nameOf(s, r.presenterId)} is presenting a bill`;
    $("bill").hidden = false;
    $("bill").textContent = r.billText;
    $("phase-detail").textContent = `Yea ${r.tally.yea} · Nay ${r.tally.nay}. More yeas than nays when the clock runs out and it passes.`;
    if (joined) {
      actions.append(
        button("Yea", s.myVote === "yea", () => post("/api/vote", { choice: "yea" })),
        button("Nay", s.myVote === "nay", () => post("/api/vote", { choice: "nay" })),
      );
    }
  }
}

function namesOrDash(list) {
  return list.length ? list.join(", ") : "-";
}

// Shared by Bills Passed and Bills Failed: same shape (`passedBills`/
// `failedBills` both return `{billNo, text, presenter, yea, nay, resolvedAt,
// yeaNames, nayNames}`), just a different outcome word. A silent Presenter's
// round never reaches either list - `text` is never null here.
function renderBillList(listEl, noneEl, bills, outcome) {
  const li = (b) => {
    const el = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = b.text ?? "(no bill was ever tabled)";
    const meta = document.createElement("small");
    meta.textContent = `#${b.billNo} · presented by ${b.presenter} · ${outcome} ${b.yea}–${b.nay} · ${new Date(b.resolvedAt).toLocaleString()}`;
    const votes = document.createElement("div");
    votes.className = "roll-call";
    const yea = document.createElement("div"); yea.className = "yea";
    yea.append(Object.assign(document.createElement("b"), { textContent: "Yea" }), document.createTextNode(` ${namesOrDash(b.yeaNames)}`));
    const nay = document.createElement("div"); nay.className = "nay";
    nay.append(Object.assign(document.createElement("b"), { textContent: "Nay" }), document.createTextNode(` ${namesOrDash(b.nayNames)}`));
    votes.append(yea, nay);
    el.append(text, meta, votes);
    return el;
  };
  listEl.replaceChildren(...bills.map(li));
  noneEl.hidden = bills.length > 0;
}

function renderRecord(s) {
  // Both lists only ever grow (bills/events are append-only, never edited),
  // so the newest id plus the length uniquely identifies what's shown. Skip
  // the rebuild when that hasn't moved, so a selection survives the snapshot
  // the server pushes every second regardless of whether anything changed.
  const billsSig = `${s.bills.length}:${s.bills[0]?.billNo ?? ""}`;
  if (billsSig !== renderedBills) {
    renderedBills = billsSig;
    renderBillList($("bills"), $("no-bills"), s.bills, "passed");
  }

  const failedSig = `${s.failedBills.length}:${s.failedBills[0]?.billNo ?? ""}`;
  if (failedSig !== renderedFailedBills) {
    renderedFailedBills = failedSig;
    renderBillList($("failed-bills"), $("no-failed-bills"), s.failedBills, "failed");
  }

  const say = {
    joined: (e) => `${e.name} joined the republic`,
    election_opened: () => "An election opened",
    declared: (e) => `${e.name} stood for Presenter`,
    no_candidates: () => "Nobody stood; the election lapsed",
    elected: (e) => `${e.name} was elected Presenter ${e.detail}`,
    drafting: (e) => `${e.name} took the floor`,
    proposed: (e) => `${e.name} tabled #${e.billNo}: “${e.detail}”`,
    passed: (e) => `${e.name}'s bill #${e.billNo} PASSED ${e.detail}`,
    failed: (e) => `${e.name}'s bill #${e.billNo} failed ${e.detail}`,
    silent: (e) => `${e.name} said nothing; the bill failed`,
  };
  const feedSig = `${s.feed.length}:${s.feed[0]?.id ?? ""}`;
  if (feedSig !== renderedFeed) {
    renderedFeed = feedSig;
    $("feed").replaceChildren(...s.feed.map((e) => {
      const li = document.createElement("li");
      li.textContent = `${new Date(e.at).toLocaleTimeString()}  ${(say[e.kind] ?? (() => e.kind))(e)}`;
      return li;
    }));
  }
}

function tick() {
  const r = state?.round;
  if (!r) { $("countdown").textContent = ""; return; }
  const left = Math.max(0, Math.ceil((r.closesAt - (Date.now() + skew)) / 1000));
  $("countdown").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}
setInterval(tick, 250);

function apply(s) {
  state = s;
  skew = s.now - Date.now();
  $("join").hidden = s.me !== null;
  renderTable(s);
  renderControls(s);
  renderRecord(s);
  tick();
}

let source;
function listen() {
  source?.close();
  source = new EventSource("/api/stream");
  source.onmessage = (m) => apply(JSON.parse(m.data));
}

$("join-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    showError($("join-error"), null);
    await post("/api/join", { name: $("join-name").value });
    listen(); // reconnect so the server seats us
  } catch (err) { showError($("join-error"), err); }
});

$("propose-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    showError($("action-error"), null);
    await post("/api/propose", { text: $("bill-text").value });
    $("bill-text").value = "";
  } catch (err) { showError($("action-error"), err); }
});

listen();
