// static/js/dom/components/__stories__/filters-row.stories.js
import { renderFilterCell } from '../filter-cell.js';

export default { title: 'Table/FiltersRow' };

const columns = [
  { key: 'main', placeholder: 'Customer' },
  { key: 'peer', placeholder: 'Supplier' },
  { key: 'destination', placeholder: 'Destination' },
  { key: 'Min', placeholder: '≥' },
];

export const Default = () => {
  const cells = columns.map(col => renderFilterCell({ key: col.key, placeholder: col.placeholder, value: '' })).join('');
  return `<table class="results-display__table"><tfoot><tr id="column-filters-row" class="results-display__column-filters">${cells}</tr></tfoot></table>`;
};
