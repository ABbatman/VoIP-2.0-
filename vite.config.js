// vite.config.js
import { defineConfig } from "vite";
import manifest from "vite-plugin-manifest";
import { resolve } from "node:path";

export default defineConfig({
  // The root of our frontend assets
  root: "static",
  // Base public path is '/' during development
  base: "/",

  server: {
    // --- THIS IS THE KEY ---
    // Enable CORS for all origins.
    cors: true,

    port: 5173,
    strictPort: true,
  },

  build: {
    // Output directory relative to the project root
    outDir: "../static/dist",
    // We need to set the base path for production build
    base: "/static/",
    manifest: true,
    rollupOptions: {
      // Input path relative to the `root` option
      input: {
        // Use absolute path to avoid resolution issues during dependency scanning
        main: resolve(process.cwd(), "static/js/main.js"),
      },
    },
  },

  plugins: [manifest()],
});
