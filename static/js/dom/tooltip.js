// static/js/dom/tooltip.js
// This module manages a single, reusable tooltip that displays PDD and ATime
// values when a user hovers over an ASR cell in the results table.

// A single, reusable tooltip element for the entire page.
// We keep a reference to it here so we don't have to query the DOM repeatedly.
let tooltipElement;

/**
 * Initializes the tooltip functionality.
 * This is the main entry point function for this module.
 */
export function initTooltips() {
  // Find the tooltip element in the DOM. It should be added in index.html.
  tooltipElement = document.getElementById("pdd-atime-tooltip");

  // Find the container for table rows.
  const tableBody = document.getElementById("tableBody");

  // If either the tooltip or the table body doesn't exist, we can't proceed.
  // Log a warning and exit gracefully.
  if (!tooltipElement || !tableBody) {
    console.warn(
      "Tooltip element or table body not found. Tooltips are disabled."
    );
    return;
  }

  // --- Event Delegation Setup ---
  // Instead of adding listeners to every cell, we add one set of listeners
  // to the parent (tableBody) and check where the event originated.
  // This is much more performant, especially for large tables.

  tableBody.addEventListener("mouseover", handleMouseOver);
  tableBody.addEventListener("mouseout", handleMouseOut);
  tableBody.addEventListener("mousemove", handleMouseMove);

  console.log("✅ Tooltips initialized.");
}

/**
 * Handles the 'mouseover' event on the table body.
 * It checks if the cursor is over an ASR cell and shows the tooltip if so.
 * @param {MouseEvent} event - The native mouseover event object.
 */
function handleMouseOver(event) {
  // `event.target` is the element the mouse first touched.
  // `.closest()` travels up the DOM tree to find the nearest parent `<td>`
  // that matches our specific selector for ASR cells.
  const asrCell = event.target.closest("td.asr-cell-hover");

  // If the mouse is not over a valid ASR cell, `asrCell` will be null.
  // In that case, we do nothing and exit the function.
  if (!asrCell) {
    return;
  }

  // Retrieve the PDD and ATime values from the cell's data attributes.
  // The '??' nullish coalescing operator provides a default value if the data is missing.
  const pdd = asrCell.dataset.pdd ?? "N/A";
  const atime = asrCell.dataset.atime ?? "N/A";

  // Format the text content for the tooltip.
  // The '\n' character creates a new line because the CSS has `white-space: pre;`.
  tooltipElement.textContent = `PDD: ${pdd}\nATime: ${atime}`;

  // Make the tooltip visible.
  tooltipElement.style.display = "block";
}

/**
 * Handles the 'mouseout' event on the table body.
 * It hides the tooltip when the mouse leaves an ASR cell (or the table).
 */
function handleMouseOut() {
  // Simply hide the tooltip. No need to check the target.
  // This is safe and ensures the tooltip disappears when the mouse leaves the table.
  tooltipElement.style.display = "none";
}

/**
 * Handles the 'mousemove' event on the table body.
 * It updates the tooltip's position to follow the mouse cursor.
 * @param {MouseEvent} event - The native mousemove event object.
 */
function handleMouseMove(event) {
  // We only need to update the position if the tooltip is currently visible.
  // This prevents unnecessary calculations when moving the mouse over other cells.
  if (tooltipElement.style.display === "block") {
    // Position the tooltip slightly below and to the right of the cursor
    // to prevent it from flickering by being under the cursor itself.
    const x = event.clientX + 15; // `clientX` is relative to the viewport.
    const y = event.clientY + 15; // `clientY` is relative to the viewport.

    // Update the CSS `left` and `top` properties.
    tooltipElement.style.left = `${x}px`;
    tooltipElement.style.top = `${y}px`;
  }
}
