import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error process types without @types/node
import process from "node:process";
import { jjBridgeMiddleware } from "./scripts/jj-bridge.mjs";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  plugins: [
    react(),
    {
      name: "jj-bridge",
      configureServer(server) {
        server.middlewares.use(jjBridgeMiddleware());
      },
    },
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || '127.0.0.1',
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
