// The handle has three positions: nearly full-map, summary, and details.
export function swipeSheet(position, dy) {
  if (dy < -24) return position === 'minimized' ? 'normal' : 'expanded';
  if (dy > 24) return position === 'expanded' ? 'normal' : 'minimized';
  return position;
}

export function tapSheet(position) {
  return position === 'normal' ? 'minimized' : 'normal';
}
