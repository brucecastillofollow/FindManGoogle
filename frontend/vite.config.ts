import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy = {
  "/api": { target: "http://localhost:3001", changeOrigin: true },
} as const;

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind IPv4 loopback so http://localhost:5173 is consistent on Windows (avoids ::1-only / odd resolver behavior).
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: apiProxy,
  },
});
