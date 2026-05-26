import path from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  root: path.resolve(__dirname, "src/renderer"),
  publicDir: path.resolve(__dirname, "public"),
  build: {
    sourcemap: true,
    outDir: path.resolve(__dirname, ".vite/renderer/main_window"),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
