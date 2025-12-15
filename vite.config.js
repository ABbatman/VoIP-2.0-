// vite.config.js
import { defineConfig } from "vite";
import manifest from "vite-plugin-manifest";
import { resolve } from "node:path";

export default defineConfig({
  // The root of our frontend assets
  root: "static",
  // Base public path - use './' for relative paths (subdirectory compatible)
  base: "./",

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
    // Use relative base path for production - critical for subdirectory deployment
    // e.g., domain.com/modules/voip/ will work correctly
    base: "./",
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
