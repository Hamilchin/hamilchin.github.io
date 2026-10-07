// A small stroke icon set, drawn on a 20-unit grid.

const P = {
  play: '<path d="M6.5 4.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L7.4 4.3a.6.6 0 0 0-.9.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M5.5 4.5h3v11h-3zM11.5 4.5h3v11h-3z" fill="currentColor" stroke="none"/>',
  step: '<path d="M5 5.2v9.6a.5.5 0 0 0 .8.4l6.9-4.8a.5.5 0 0 0 0-.8L5.8 4.8a.5.5 0 0 0-.8.4z" fill="currentColor" stroke="none"/><path d="M15 4.5v11"/>',
  back: '<path d="M15 5.2v9.6a.5.5 0 0 1-.8.4l-6.9-4.8a.5.5 0 0 1 0-.8l6.9-4.8a.5.5 0 0 1 .8.4z" fill="currentColor" stroke="none"/><path d="M5 4.5v11"/>',
  undo: '<path d="M4.5 10a5.5 5.5 0 1 0 1.8-4.1"/><path d="M4.2 3.6v3.1h3.1"/>',
  dice: '<rect x="3.75" y="3.75" width="12.5" height="12.5" rx="1"/><path d="M6.4 6.4h1.8v1.8H6.4zM11.8 6.4h1.8v1.8h-1.8zM9.1 9.1h1.8v1.8H9.1zM6.4 11.8h1.8v1.8H6.4zM11.8 11.8h1.8v1.8h-1.8z" fill="currentColor" stroke="none"/>',
  save: '<path d="M5.75 3.75h8.5v12.5L10 12.75l-4.25 3.5z"/>',
  shuffle: '<path d="M3.5 6h2.6c3.8 0 4 8 7.8 8h2.6"/><path d="M3.5 14h2.6c1.4 0 2.2-1 2.9-2.3M11.1 8.3c.7-1.3 1.5-2.3 2.8-2.3h2.6"/><path d="m14.5 4 2 2-2 2M14.5 12l2 2-2 2"/>',
  expand: '<path d="M4 8V4h4M12 4h4v4M16 12v4h-4M8 16H4v-4"/>',
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  minus: '<path d="M4.5 10h11"/>',
  close: '<path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/>',
  left: '<path d="m12 5-5 5 5 5"/>',
  right: '<path d="m8 5 5 5-5 5"/>',
  down: '<path d="m5 8 5 5 5-5"/>',
};

export function icon(name, size = 18) {
  return `<svg class="icon icon-${name}" viewBox="0 0 20 20" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${P[name]}</svg>`;
}

/** Turn glyphs for the ant editor: one per turn, drawn as a path leaving the cell. */
const TURN_PATHS = [
  '<path d="M10 16V4.8"/><path d="m6.4 8.2 3.6-3.6 3.6 3.6"/>', // N: straight on
  '<path d="M6 16v-4.4a4.6 4.6 0 0 1 4.6-4.6h4.9"/><path d="m12.4 3.8 3.3 3.2-3.3 3.2"/>', // R
  '<path d="M7 16V8.6a3 3 0 0 1 6 0v6.6"/><path d="m9.8 12.3 3.2 3.3 3.2-3.3"/>', // U
  '<path d="M14 16v-4.4A4.6 4.6 0 0 0 9.4 7H4.5"/><path d="M7.6 3.8 4.3 7l3.3 3.2"/>', // L
];

export function turnIcon(turn, size = 20) {
  return `<svg class="turn" viewBox="0 0 20 20" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TURN_PATHS[turn]}</svg>`;
}
