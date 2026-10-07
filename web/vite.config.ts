import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@offer-compare/engine": path.resolve(__dirname, "../packages/engine/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
});
