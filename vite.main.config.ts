import { defineConfig } from "vite";

export default defineConfig({
  define: {
    __SIMBRIDGE_GITHUB_REPO__: JSON.stringify(process.env.SIMBRIDGE_GITHUB_REPO || "")
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ["electron"]
    }
  }
});
