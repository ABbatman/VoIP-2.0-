// static/js/dom/components/__stories__/header-cell.stories.js
import { renderHeaderCellString } from '../header-cell.js';

export default { title: 'Table/HeaderCell' };

const columns = [
  { key: 'main', label: (rev) => rev ? 'Supplier' : 'Customer' },
  { key: 'ACD', label: () => 'ACD' },
];

export const Default = () => {
  const th1 = renderHeaderCellString({ col: columns[0], reverse: false });
  const th2 = renderHeaderCellString({ col: columns[1], reverse: false });
  return `<table class="results-display__table"><thead><tr>${th1}${th2}</tr></thead></table>`;
};

// reverse mode example (Customer/Supplier swapped)
export const Reverse = () => {
  const th1 = renderHeaderCellString({ col: columns[0], reverse: true });
  const th2 = renderHeaderCellString({ col: columns[1], reverse: true });
  return `<table class="results-display__table"><thead><tr>${th1}${th2}</tr></thead></table>`;
};

// Y-columns on/off visualization note: icon state depends on tableState.areYColumnsVisible()
export const WithYToggle = () => {
  const th = renderHeaderCellString({ col: columns[0], reverse: false });
  return `<table class="results-display__table"><thead><tr>${th}</tr></thead></table>`;
};
