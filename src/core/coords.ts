/**
 * Coordinate transforms (PLAN §5.4, RESEARCH §5–6). Pure & Node-testable.
 *
 *   x = (index - offset) * barSpacing            (+ the bar is centered at x + barSpacing/2)
 *   y is mapped from the visible price band [min,max] to pixel height, inverted
 *   (screen y grows downward, price grows upward), with optional log scale.
 *
 * `*ToX`/`xTo*` and `*ToY`/`yTo*` MUST be exact inverses — consumers rely on
 * them for overlays, markers, and drawing-tool anchoring.
 */

import type { PriceRange, Viewport } from '../types';

/** Left edge x (px) of the bar at `index`. */
export function indexToX(index: number, viewport: Viewport): number {
  return (index - viewport.offset) * viewport.barSpacing;
}

/** Center x (px) of the bar at `index` (where the wick is drawn). */
export function indexToCenterX(index: number, viewport: Viewport): number {
  return indexToX(index, viewport) + viewport.barSpacing / 2;
}

/** Fractional bar index at pixel x (inverse of {@link indexToX}). */
export function xToIndex(x: number, viewport: Viewport): number {
  return x / viewport.barSpacing + viewport.offset;
}

/**
 * Price -> y (px) within a pane of height `height`, given the visible price band.
 * Linear unless `logScale`, in which case prices are mapped in log space.
 */
export function priceToY(
  price: number,
  range: PriceRange,
  height: number,
  logScale = false
): number {
  if (logScale) {
    const lmin = Math.log(range.min);
    const lmax = Math.log(range.max);
    const t = (Math.log(price) - lmin) / (lmax - lmin);
    return height - t * height;
  }
  const t = (price - range.min) / (range.max - range.min);
  return height - t * height;
}

/** y (px) -> price (inverse of {@link priceToY}). */
export function yToPrice(
  y: number,
  range: PriceRange,
  height: number,
  logScale = false
): number {
  const t = (height - y) / height;
  if (logScale) {
    const lmin = Math.log(range.min);
    const lmax = Math.log(range.max);
    return Math.exp(lmin + t * (lmax - lmin));
  }
  return range.min + t * (range.max - range.min);
}

/** Number of whole bars that fit across `widthPx` at the current zoom. */
export function barsPerScreen(widthPx: number, viewport: Viewport): number {
  return widthPx / viewport.barSpacing;
}
