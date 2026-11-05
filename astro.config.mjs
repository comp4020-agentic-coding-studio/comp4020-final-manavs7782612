import { defineConfig } from "astro/config";
import node from "@astrojs/node";

// Standalone Node server: one long-lived process holding the SSE connections
// and the SQLite handle, matching fly.toml's one machine / one volume.
//
// security.allowedDomains is required for the confirm routes' multipart
// bodies to work at all, on Fly and locally alike. Astro's Node adapter
// only trusts the Host / X-Forwarded-* headers against hostnames listed
// here; with nothing listed, every request's computed URL defaults to
// http://localhost (no port, no real scheme), so Astro's built-in
// checkOrigin CSRF guard (on by default, and required for any
// multipart/form-data body) would reject every real browser's Origin
// header as cross-site. fly.toml's own comment confirms the app sees
// plain http behind Fly's TLS-terminating proxy, which is why the fly.dev
// pattern below needs protocol: "https" — that's what lets Astro honour
// Fly's X-Forwarded-Proto instead of trusting the raw (http) socket.
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  security: {
    allowedDomains: [
      { hostname: "localhost", protocol: "http" },
      { hostname: "127.0.0.1", protocol: "http" },
      { hostname: "comp4020-final-manavs7782612.fly.dev", protocol: "https" },
    ],
  },
});
