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

/**
 * Pad a raw [lo, hi] band by `padding` of its span on each side. In log mode the
 * padding is applied in log space, so the margin looks the same top and bottom
 * on a log axis and `min` stays > 0. A flat band gets a 1-unit (linear) or ±1%
 * (log) sliver.
 */
export function padRange(
  lo: number,
  hi: number,
  logScale: boolean,
  padding = 0.1
): PriceRange {
  if (logScale && lo > 0) {
    let a = Math.log(lo);
    let b = Math.log(hi);
    if (a === b) {
      a -= 0.01;
      b += 0.01;
    }
    const pad = (b - a) * padding;
    return { min: Math.exp(a - pad), max: Math.exp(b + pad) };
  }
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * padding;
  return { min: lo - pad, max: hi + pad };
}
