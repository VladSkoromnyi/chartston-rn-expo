/**
 * Series geometry for the non-candlestick chart types (Stage 8): line, area, bar
 * (OHLC), and baseline. Each maps the visible [start,end] values against the
 * price-pane range — the same coordinate space as the candle geometry — so overlays
 * and the crosshair line up. Mapping is inlined to keep the loops allocation-free.
 */

import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import type { CandleColumns } from '../core';

/** OHLC tick length as a fraction of bar spacing (each side of the high–low line). */
const BAR_TICK_RATIO = 0.35;

/** Price→y / index→x mapping shared by the series builders. */
export interface SeriesMap {
  offset: number;
  barSpacing: number;
  rangeMin: number;
  rangeMax: number;
  height: number;
  logScale: boolean;
}

function yMapper(m: SeriesMap): (v: number) => number {
  const span = m.rangeMax - m.rangeMin || 1;
  const lmin = m.logScale ? Math.log(m.rangeMin) : 0;
  const lspan = m.logScale ? Math.log(m.rangeMax) - lmin : 1;
  return (v: number): number => {
    const t = m.logScale
      ? (Math.log(v) - lmin) / lspan
      : (v - m.rangeMin) / span;
    return m.height - t * m.height;
  };
}

function centerX(i: number, m: SeriesMap): number {
  return (i - m.offset) * m.barSpacing + m.barSpacing / 2;
}

/** Closing-price polyline. A non-finite value breaks the line. */
export function buildLineSeries(
  closes: number[],
  start: number,
  end: number,
  m: SeriesMap
): SkPath {
  const path = Skia.Path.Make();
  const y = yMapper(m);
  let pen = false;
  for (let i = start; i <= end; i++) {
    const v = closes[i]!;
    if (!Number.isFinite(v)) {
      pen = false;
      continue;
    }
    const x = centerX(i, m);
    if (pen) path.lineTo(x, y(v));
    else {
      path.moveTo(x, y(v));
      pen = true;
    }
  }
  return path;
}

/** First/last finite x positions in the window (to anchor closing fills). */
function xExtent(
  closes: number[],
  start: number,
  end: number,
  m: SeriesMap
): { firstX: number; lastX: number } | null {
  let firstX: number | null = null;
  let lastX = 0;
  for (let i = start; i <= end; i++) {
    if (Number.isFinite(closes[i]!)) {
      const x = centerX(i, m);
      if (firstX === null) firstX = x;
      lastX = x;
    }
  }
  return firstX === null ? null : { firstX, lastX };
}

/** Area series: the close polyline plus a filled region down to the pane bottom. */
export function buildAreaSeries(
  closes: number[],
  start: number,
  end: number,
  m: SeriesMap
): { line: SkPath; area: SkPath } {
  const line = buildLineSeries(closes, start, end, m);
  const area = line.copy();
  const ext = xExtent(closes, start, end, m);
  if (ext) {
    area.lineTo(ext.lastX, m.height);
    area.lineTo(ext.firstX, m.height);
    area.close();
  }
  return { line, area };
}

/**
 * Baseline series: the close polyline plus a fill between the line and a baseline
 * price. The fill/line are returned whole; the caller clips above/below `baselineY`
 * to colour each side (two-tone baseline look).
 */
export function buildBaselineSeries(
  closes: number[],
  start: number,
  end: number,
  m: SeriesMap,
  baseline: number
): { line: SkPath; fill: SkPath; baselineY: number } {
  const baselineY = yMapper(m)(baseline);
  const line = buildLineSeries(closes, start, end, m);
  const fill = line.copy();
  const ext = xExtent(closes, start, end, m);
  if (ext) {
    fill.lineTo(ext.lastX, baselineY);
    fill.lineTo(ext.firstX, baselineY);
    fill.close();
  }
  return { line, fill, baselineY };
}

/** OHLC bar series: a high–low vertical with a left (open) and right (close) tick. */
export function buildBarSeries(
  cols: CandleColumns,
  start: number,
  end: number,
  m: SeriesMap
): { upBars: SkPath; downBars: SkPath } {
  const upBars = Skia.Path.Make();
  const downBars = Skia.Path.Make();
  const y = yMapper(m);
  const tick = Math.max(1, m.barSpacing * BAR_TICK_RATIO);
  for (let i = start; i <= end; i++) {
    const c = cols.closes[i]!;
    if (!Number.isFinite(c)) continue;
    const o = cols.opens[i]!;
    const x = centerX(i, m);
    const p = c >= o ? upBars : downBars;
    p.moveTo(x, y(cols.highs[i]!));
    p.lineTo(x, y(cols.lows[i]!));
    const yo = y(o);
    p.moveTo(x - tick, yo);
    p.lineTo(x, yo);
    const yc = y(c);
    p.moveTo(x, yc);
    p.lineTo(x + tick, yc);
  }
  return { upBars, downBars };
}
