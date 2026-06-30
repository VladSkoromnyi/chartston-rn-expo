/**
 * Autoscale (RESEARCH §6). Pure & Node-testable.
 * Fits the price band to the min-low / max-high of the visible bars, padded.
 */

import type { CandleView, PriceRange } from '../types';

/**
 * @param padding fraction of the raw range added above and below (default 10%,
 *   matching Lightweight Charts' default `scaleMargins`).
 */
export function autoScale(
  view: CandleView,
  fromIndex: number,
  toIndex: number,
  padding = 0.1
): PriceRange {
  const lo = Math.max(0, Math.floor(fromIndex));
  const hi = Math.min(view.length - 1, Math.ceil(toIndex));
  if (view.length === 0 || hi < lo) return { min: 0, max: 1 };

  const { highs, lows } = view;
  let min = Infinity;
  let max = -Infinity;
  for (let i = lo; i <= hi; i++) {
    const l = lows[i]!;
    const h = highs[i]!;
    if (l < min) min = l;
    if (h > max) max = h;
  }

  // Degenerate flat range — give it a sliver so it still renders.
  if (min === max) {
    const e = min === 0 ? 1 : Math.abs(min) * 0.01;
    min -= e;
    max += e;
  }

  const pad = (max - min) * padding;
  return { min: min - pad, max: max + pad };
}
