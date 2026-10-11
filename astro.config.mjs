import { defineConfig } from "astro/config";
import node from "@astrojs/node";

// Standalone Node server: one long-lived process holding the SSE connections
// and the SQLite handle, matching fly.toml's one machine / one volume.
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
});
