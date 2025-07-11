// static/js/main.js

console.log("✅ main.js loaded");

// We only need the main initialization function for the entire application.
import { initApp } from "./dom/index.js";

// DOM ready entry point
document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ DOM fully loaded");
  initApp();
});
