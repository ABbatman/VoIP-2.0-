// static/js/dom/components/__stories__/button.stories.js
import { renderButton } from '../button.js';

export default { title: 'Components/Button' };

export const Default = () => renderButton({ className: 'btn', text: 'Button' });
