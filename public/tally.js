// Real-time client: an EventSource keeps the big number in sync with every
// other open tab, with no reload. The toggle button never reads or sends the
// count itself --- only "I'm here" / "I'm leaving" for the identity the
// server's own cookie already knows, so this tab can only ever change its
// own presence (decisions/0002-presence-identity-cookie.md).
const countEl = document.getElementById("count");
const statusEl = document.getElementById("status");
const toggleBtn = document.getElementById("toggle");
const myStatusEl = document.getElementById("my-status");

function setStatus(text) {
  statusEl.textContent = text;
}

function connect() {
  const source = new EventSource("/api/presence/stream");
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

function render(here) {
  toggleBtn.dataset.here = here ? "1" : "0";
  toggleBtn.textContent = here ? "I'm leaving" : "I'm here";
  myStatusEl.textContent = here ? "here" : "not here";
}

async function toggle() {
  const here = toggleBtn.dataset.here === "1";
  toggleBtn.disabled = true;
  try {
    const res = await fetch("/api/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ present: !here }),
    });
    if (!res.ok) {
      setStatus("that didn't go through — try again");
      return;
    }
    const data = await res.json();
    render(data.present);
  } catch {
    setStatus("offline — try again");
  } finally {
    toggleBtn.disabled = false;
  }
}

toggleBtn.addEventListener("click", toggle);
