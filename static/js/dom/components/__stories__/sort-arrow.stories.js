// static/js/dom/components/__stories__/sort-arrow.stories.js
import { renderSortArrow } from '../sort-arrow.js';

export default { title: 'Components/SortArrow' };

// pass only state classes; component adds base 'sort-arrow' itself
export const Default = () => renderSortArrow({ key: 'Min', className: 'active up' });
