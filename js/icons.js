// Inline SVG icon set for entry types. Stored on a type as a key; unknown or empty keys
// render the placeholder. Stroke icons on a 24px grid, drawn in currentColor.
import { readableText } from './schema.js';

export const ICONS = {
  stethoscope: ['Stethoscope', '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v3a5 5 0 0 0 10 0v-3"/><circle cx="20" cy="10" r="2"/>'],
  calendar: ['Calendar', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h3v3H8z"/>'],
  document: ['Document', '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'],
  scale: ['Scale', '<path d="M12 4v16M7 20h10M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>'],
  box: ['Box', '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'],
  bandage: ['Bandage', '<rect x="1.5" y="8" width="21" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M10.5 10.5h.01M13.5 13.5h.01M10.5 13.5h.01M13.5 10.5h.01"/>'],
  radiation: ['Radiation', '<circle cx="12" cy="12" r="2"/><path d="M10.8 10.3 7.2 4.1a9 9 0 0 1 9.6 0l-3.6 6.2M14 12h7.2a9 9 0 0 1-4.8 8.3L12.8 14M10 12H2.8a9 9 0 0 0 4.8 8.3l3.6-6.3"/>'],
  'pulse-alert': ['Pulse alert', '<path d="M3 12h4l2-5 4 10 2-5h6"/>'],
  receipt: ['Receipt', '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h4"/>'],
  cone: ['Traffic cone', '<path d="M10 3h4l5 16H5z"/><path d="M7.5 11h9M6.3 15h11.4M3 21h18"/>'],
  heart: ['Heart', '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'],
  pill: ['Pill', '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7"/>'],
  syringe: ['Syringe', '<path d="M18 2l4 4M16 4l4 4M18 6l-9.5 9.5M14 4l6 6-9 9H5v-6z M9 11l2 2"/>'],
  flask: ['Lab flask', '<path d="M9 3h6M10 3v6l-5 10a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10"/>'],
  eye: ['Eye', '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'],
  tooth: ['Tooth', '<path d="M7 3C4 3 3 6 4 9l2 11c.3 1.3 2 1.3 2.3 0L9.5 14h5l1.2 6c.3 1.3 2 1.3 2.3 0l2-11c1-3 0-6-3-6-2 0-3 1-5 1S9 3 7 3z"/>'],
  phone: ['Phone', '<path d="M5 3h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>'],
  car: ['Car', '<path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4H3z M3 13h18"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>'],
  home: ['Home', '<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/>'],
  clipboard: ['Clipboard', '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 12h6M9 16h4"/>'],
  clock: ['Clock', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  mail: ['Mail', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'],
  money: ['Money', '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>'],
  bed: ['Bed', '<path d="M3 6v14M3 16h18v4M21 16v-4a3 3 0 0 0-3-3h-7v7"/><circle cx="7" cy="12" r="2"/>'],
  star: ['Star', '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'],
};
export const PLACEHOLDER = ['No icon chosen', '<rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 2.6"/><path d="M12 9v6M9 12h6"/>'];
export const ICON_KEYS = Object.keys(ICONS);
export const hasIcon = key => Object.hasOwn(ICONS, key || '');

export function iconSVG(key, label = '') {
  const [name, body] = hasIcon(key) ? ICONS[key] : PLACEHOLDER;
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  return `<svg class="icon" data-icon="${hasIcon(key) ? key : 'placeholder'}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${a11y}><title>${name}</title>${body}</svg>`;
}
/** The one way a type's icon + color is drawn (timeline, chips, forms, types page). */
export function typeBadge(type, size = 'md') {
  const color = /^#[0-9a-f]{6}$/i.test(type?.color || '') ? type.color : '#5c6674';
  return `<span class="type-icon size-${size}" style="--type-color:${color};--type-ink:${readableText(color)}">${iconSVG(type?.icon)}</span>`;
}
