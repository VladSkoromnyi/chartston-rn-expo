/**
 * Histogram path builders for sub-panes (Stage 7): volume bars and the MACD
 * histogram. Like the candle/line builders, only the visible `[start, end]`
 * range is built and the value→y mapping is inlined so the loop stays
 * allocation-free. Paths are returned relative to the pane's own top-left
 * origin (y=0 at the pane top); the caller translates the group into place.
 */

import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';

/** Bar width as a fraction of bar spacing (matches the candle body ratio). */
const BAR_WIDTH_RATIO = 0.7;

/**
 * Volume-style histogram: every bar grows up from the pane baseline (y=height).
 * `up[i]` routes bar `i` into the up- or down-coloured path so both draw in two
 * GPU calls. `rangeMax` is the top of the value axis (baseline is value 0).
 */
export function buildVolumeHistogram(
  values: number[],
  up: boolean[],
  start: number,
  end: number,
  offset: number,
  barSpacing: number,
  rangeMax: number,
  height: number
): { upBars: SkPath; downBars: SkPath } {
  const upBars = Skia.Path.Make();
  const downBars = Skia.Path.Make();
  const barWidth = Math.max(1, barSpacing * BAR_WIDTH_RATIO);
  const half = barWidth / 2;
  const span = rangeMax || 1;
  for (let i = start; i <= end; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v) || v <= 0) continue;
    const cx = (i - offset) * barSpacing + barSpacing / 2;
    const h = Math.max(1, (v / span) * height);
    const top = height - h;
    (up[i] ? upBars : downBars).addRect(
      Skia.XYWHRect(cx - half, top, barWidth, h)
    );
  }
  return { upBars, downBars };
}

/**
 * Signed histogram around a zero baseline (MACD). Positive values draw above the
 * zero line, negative below. The axis is `[rangeMin, rangeMax]`; `zeroY` is
 * derived from that range so the baseline lands wherever 0 maps to.
 */
export function buildSignedHistogram(
  values: number[],
  start: number,
  end: number,
  offset: number,
  barSpacing: number,
  rangeMin: number,
  rangeMax: number,
  height: number
): { posBars: SkPath; negBars: SkPath; zeroY: number } {
  const posBars = Skia.Path.Make();
  const negBars = Skia.Path.Make();
  const barWidth = Math.max(1, barSpacing * BAR_WIDTH_RATIO);
  const half = barWidth / 2;
  const span = rangeMax - rangeMin || 1;
  const valueToY = (v: number): number =>
    height - ((v - rangeMin) / span) * height;
  const zeroY = valueToY(0);
  for (let i = start; i <= end; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    const cx = (i - offset) * barSpacing + barSpacing / 2;
    const y = valueToY(v);
    const top = Math.min(y, zeroY);
    const h = Math.max(1, Math.abs(y - zeroY));
    (v >= 0 ? posBars : negBars).addRect(
      Skia.XYWHRect(cx - half, top, barWidth, h)
    );
  }
  return { posBars, negBars, zeroY };
}
