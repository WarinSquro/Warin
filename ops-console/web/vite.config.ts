import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  publicDir: path.join(root, "public"),
  plugins: [react(), tailwindcss()],
  server: {
    port: 5191,
    proxy: {
      "/api/ops": {
        target: "http://127.0.0.1:9191",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
  },
});
