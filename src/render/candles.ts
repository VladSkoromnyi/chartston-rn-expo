/**
 * Candle geometry builder (PLAN §5.1, RESEARCH §1).
 *
 * Converts the visible `[start, end]` range into four Skia paths grouped by
 * direction, so the whole visible series draws in a handful of GPU calls:
 *   - bodies = rect(open↔close)  (fill)
 *   - wicks  = line(low↔high)    (stroke)
 *
 * Only the visible range is built (viewport clipping), so cost is bounded by
 * what's on screen (~hundreds of bars) regardless of total history. Inputs are
 * plain numbers/arrays (no class instances), so this can run either in a JS memo
 * (Stage 2) or — as a future perf pass — inside a UI-thread worklet.
 *
 * The price→y mapping is inlined here (mirrors `core/coords.priceToY`, the tested
 * reference) to keep the hot loop allocation-free.
 */

import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import type { CandleColumns } from '../core/columns';

export interface CandleGeometry {
  upBodies: SkPath;
  downBodies: SkPath;
  upWicks: SkPath;
  downWicks: SkPath;
}

/** Body width as a fraction of bar spacing (leaves a gap between candles). */
const BODY_WIDTH_RATIO = 0.7;

export function buildCandleGeometry(
  cols: CandleColumns,
  start: number,
  end: number,
  offset: number,
  barSpacing: number,
  rangeMin: number,
  rangeMax: number,
  height: number,
  logScale: boolean
): CandleGeometry {
  const upBodies = Skia.Path.Make();
  const downBodies = Skia.Path.Make();
  const upWicks = Skia.Path.Make();
  const downWicks = Skia.Path.Make();

  const bodyWidth = Math.max(1, barSpacing * BODY_WIDTH_RATIO);
  const half = bodyWidth / 2;
  const lmin = logScale ? Math.log(rangeMin) : 0;
  const lspan = logScale ? Math.log(rangeMax) - lmin : 1;
  const span = rangeMax - rangeMin || 1;

  for (let i = start; i <= end; i++) {
    const open = cols.opens[i]!;
    const close = cols.closes[i]!;
    const high = cols.highs[i]!;
    const low = cols.lows[i]!;
    const up = close >= open;
    const cx = (i - offset) * barSpacing + barSpacing / 2;

    const tHigh = logScale
      ? (Math.log(high) - lmin) / lspan
      : (high - rangeMin) / span;
    const tLow = logScale
      ? (Math.log(low) - lmin) / lspan
      : (low - rangeMin) / span;
    const tOpen = logScale
      ? (Math.log(open) - lmin) / lspan
      : (open - rangeMin) / span;
    const tClose = logScale
      ? (Math.log(close) - lmin) / lspan
      : (close - rangeMin) / span;
    const yHigh = height - tHigh * height;
    const yLow = height - tLow * height;
    const yOpen = height - tOpen * height;
    const yClose = height - tClose * height;
    const top = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(1, Math.abs(yClose - yOpen)); // min 1px so a doji is visible

    const bodies = up ? upBodies : downBodies;
    const wicks = up ? upWicks : downWicks;
    bodies.addRect(Skia.XYWHRect(cx - half, top, bodyWidth, bodyHeight));
    wicks.moveTo(cx, yHigh);
    wicks.lineTo(cx, yLow);
  }

  return { upBodies, downBodies, upWicks, downWicks };
}
