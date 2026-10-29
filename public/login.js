(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("login-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const role = $("role").value;
    const name = $("name").value.trim();
    const pin = $("pin").value.trim();
    const msg = $("msg");
    msg.textContent = "";

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, pin, role }),
      });
      if (!res.ok) {
        const info = await res.json().catch(() => ({}));
        msg.textContent = `Login failed: ${info.reason ?? res.status}`;
        msg.className = "alert";
        return;
      }
      window.location.href = role === "dispatcher" ? "/dispatcher/" : "/driver/";
    } catch {
      msg.textContent = "No connection: try again.";
      msg.className = "alert";
    }
  });
})();
