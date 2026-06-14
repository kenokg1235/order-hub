import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: Vite serves the UI and proxies /api to the Express server on :4000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,                       // expose on LAN for multi-user testing
    proxy: { "/api": "http://localhost:4000" },
  },
});
