/**
 * Polyline path builder for overlay / pane line series (Stage 7). Viewport-clipped;
 * `NaN` warmup values break the line so the indicator starts where it's defined.
 */

import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';

export function buildLinePath(
  values: number[],
  start: number,
  end: number,
  offset: number,
  barSpacing: number,
  rangeMin: number,
  rangeMax: number,
  height: number,
  logScale: boolean
): SkPath {
  const path = Skia.Path.Make();
  const span = rangeMax - rangeMin || 1;
  const lmin = logScale ? Math.log(rangeMin) : 0;
  const lspan = logScale ? Math.log(rangeMax) - lmin : 1;
  let pen = false;
  for (let i = start; i <= end; i++) {
    const v = values[i]!;
    if (Number.isNaN(v)) {
      pen = false;
      continue;
    }
    const cx = (i - offset) * barSpacing + barSpacing / 2;
    const t = logScale ? (Math.log(v) - lmin) / lspan : (v - rangeMin) / span;
    const y = height - t * height;
    if (pen) {
      path.lineTo(cx, y);
    } else {
      path.moveTo(cx, y);
      pen = true;
    }
  }
  return path;
}
