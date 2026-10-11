// Real-time client: an EventSource keeps the big number in sync with every
// other open tab, with no reload. The +/- buttons never read or send the
// count themselves — only a direction — so this tab can't stomp on a change
// another tab just made (decisions/0001-apply-deltas-not-counts.md).
const countEl = document.getElementById("count");
const statusEl = document.getElementById("status");
const minusBtn = document.getElementById("minus");
const plusBtn = document.getElementById("plus");

function setStatus(text) {
  statusEl.textContent = text;
}

function connect() {
  const source = new EventSource("/api/tally/stream");
  source.addEventListener("count", (event) => {
    if (countEl.textContent === event.data) return;
    countEl.textContent = event.data;
    countEl.classList.remove("pulse");
    // restart the animation even if it's already mid-pulse from a prior update
    void countEl.offsetWidth;
    countEl.classList.add("pulse");
    setTimeout(() => countEl.classList.remove("pulse"), 350);
  });
  source.addEventListener("error", () => {
    setStatus("reconnecting…");
  });
  source.addEventListener("open", () => {
    setStatus("");
  });
  return source;
}

connect();

async function send(delta) {
  minusBtn.disabled = true;
  plusBtn.disabled = true;
  try {
    const res = await fetch("/api/tally", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delta }),
    });
    if (!res.ok) {
      setStatus("that didn't go through — try again");
    }
  } catch {
    setStatus("offline — try again");
  } finally {
    minusBtn.disabled = false;
    plusBtn.disabled = false;
  }
}

minusBtn.addEventListener("click", () => send(-1));
plusBtn.addEventListener("click", () => send(1));
