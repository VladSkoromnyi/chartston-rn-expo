/**
 * Candle geometry builder (PLAN §5.1, RESEARCH §1). Stage 1.
 *
 * Converts the visible candles into four Skia paths grouped by direction, so the
 * whole series draws in a handful of GPU calls (one `<Path>` per group) rather
 * than one node per bar:
 *   - bodies  = rect(open↔close)   (fill)
 *   - wicks   = line(low↔high)     (stroke)
 *
 * NOTE (Stage 2): for 10k+ candles under pan/zoom this is rebuilt per gesture
 * frame; the perf refinement swaps to a `useRectBuffer`/`useRSXformBuffer` typed-
 * array path on the UI thread. The grouping-by-direction shape stays the same.
 */

import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { indexToCenterX, priceToY } from '../core/coords';
import type { CandleView, PriceRange, Viewport } from '../types';
import type { PaneGeometry } from './geometry';

export interface CandleGeometry {
  upBodies: SkPath;
  downBodies: SkPath;
  upWicks: SkPath;
  downWicks: SkPath;
}

/** Body width as a fraction of bar spacing (leaves a gap between candles). */
const BODY_WIDTH_RATIO = 0.7;

export function buildCandleGeometry(
  view: CandleView,
  viewport: Viewport,
  range: PriceRange,
  geom: PaneGeometry
): CandleGeometry {
  const upBodies = Skia.Path.Make();
  const downBodies = Skia.Path.Make();
  const upWicks = Skia.Path.Make();
  const downWicks = Skia.Path.Make();

  const visible = geom.width / viewport.barSpacing;
  const start = Math.max(0, Math.floor(viewport.offset));
  const end = Math.min(view.length - 1, Math.ceil(viewport.offset + visible));
  const bodyWidth = Math.max(1, viewport.barSpacing * BODY_WIDTH_RATIO);
  const half = bodyWidth / 2;
  const log = viewport.logScale;

  for (let i = start; i <= end; i++) {
    const open = view.opens[i]!;
    const close = view.closes[i]!;
    const high = view.highs[i]!;
    const low = view.lows[i]!;
    const up = close >= open;

    const cx = indexToCenterX(i, viewport);
    const yHigh = priceToY(high, range, geom.height, log);
    const yLow = priceToY(low, range, geom.height, log);
    const yOpen = priceToY(open, range, geom.height, log);
    const yClose = priceToY(close, range, geom.height, log);
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
