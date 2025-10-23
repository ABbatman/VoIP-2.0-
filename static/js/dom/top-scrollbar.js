// static/js/dom/top-scrollbar.js

/**
 * Updates the width and visibility of the top scrollbar based on the main table's state.
 */
export function updateTopScrollbar() {
  const topScrollbarContainer = document.getElementById(
    "top-scrollbar-container"
  );
  const topScrollContent = document.getElementById("top-scrollbar-content");
  const tableWrapper = document.querySelector(
    ".results-display__table-wrapper"
  );

  if (!topScrollbarContainer || !topScrollContent || !tableWrapper) {
    return; // Exit if elements are not on the page
  }

  const table = tableWrapper.querySelector("table");
  if (!table) {
    // If table is not present, ensure scrollbar is hidden
    topScrollbarContainer.classList.add("is-hidden");
    return;
  }

  const scrollWidth = table.scrollWidth;
  const clientWidth = tableWrapper.clientWidth;

  // Set the fake content width to match the real table's scrollable width
  topScrollContent.style.width = scrollWidth + "px";

  // Show the top scrollbar ONLY if the table is actually wider than its container
  if (scrollWidth > clientWidth) {
    topScrollbarContainer.classList.remove("is-hidden");
  } else {
    topScrollbarContainer.classList.add("is-hidden");
  }
}

/**
 * Initializes two-way scroll synchronization and resize listeners.
 */
export function initTopScrollbar() {
  const topScrollbarContainer = document.getElementById(
    "top-scrollbar-container"
  );
  const tableWrapper = document.querySelector(
    ".results-display__table-wrapper"
  );

  if (!topScrollbarContainer || !tableWrapper) {
    console.warn("Top scrollbar elements not found. Sync disabled.");
    return;
  }

  // Update on window resize
  window.addEventListener("resize", updateTopScrollbar);

  // Two-way scroll synchronization
  let isSyncing = false;
  const syncScroll = (source, target) => {
    if (isSyncing) return;
    isSyncing = true;
    target.scrollLeft = source.scrollLeft;
    // Use requestAnimationFrame to prevent race conditions
    requestAnimationFrame(() => {
      isSyncing = false;
    });
  };

  topScrollbarContainer.addEventListener("scroll", () =>
    syncScroll(topScrollbarContainer, tableWrapper)
  );
  tableWrapper.addEventListener("scroll", () =>
    syncScroll(tableWrapper, topScrollbarContainer)
  );

  console.log("✅ Top scrollbar event listeners initialized.");
}
