/**
 * Per-frame scene data for `<Chart/>` (M5, split out of Chart.tsx): the layout,
 * autoscale and Skia geometry for one viewport, plus the crosshair readout.
 * Pure functions of their inputs — `<Chart/>` calls them from its redraw loop,
 * not from React render.
 */

import { Platform } from 'react-native';
import { createPicture } from '@shopify/react-native-skia';
import type { SkPath, SkPicture } from '@shopify/react-native-skia';
import type {
  ChartMarker,
  ChartStudiesConfig,
  ChartTheme,
  ChartType,
  ConnectionStatus,
  Drawing,
  PaneDrawContext,
  PaneStudyId,
  PriceLine,
  StudyDescriptor,
} from '../types';
import {
  formatAxisValue,
  formatPrice,
  formatTimeLabel,
  indexToCenterX,
  niceTicks,
  padRange,
  priceToY,
  seriesExtent,
  visibleRange,
  yToPrice,
} from '../core';
import type { BuiltinSeries, CandleColumns, StudyRun } from '../core';
import {
  buildAreaSeries,
  buildBarSeries,
  buildBaselineSeries,
  buildCandleGeometry,
  buildLinePath,
  buildLineSeries,
  buildSignedHistogram,
  buildVolumeHistogram,
  makePath,
} from '../render';

export const PRICE_AXIS_WIDTH = 56;
export const TIME_AXIS_HEIGHT = 24;
export const DEFAULT_BAR_SPACING = 8;
// Lazy history: page older bars when the left edge gets within EDGE_LOAD_BARS of
// the start; page size matches the initial backfill.
export const HISTORY_PAGE_SIZE = 500;
export const EDGE_LOAD_BARS = 30;
export const PRICE_TICK_COUNT = 5;
export const TIME_LABEL_MIN_PX = 64;
export const OVERLAY_SMA_COLOR = '#f0b90b';
export const OVERLAY_EMA_COLOR = '#3b82f6';
export const OVERLAY_BOLL_BAND_COLOR = '#787b86'; // upper/lower — muted grey
export const OVERLAY_BOLL_MID_COLOR = '#b2b5be'; // middle — lighter, thin
export const OVERLAY_VWAP_COLOR = '#e040fb'; // magenta/purple
export const LEGEND_STEP = 70;

// Sub-pane layout (Stage 7). Each active sub-pane gets a fixed slice below the
// price pane; the price pane keeps whatever is left (never below the minimum).
export const SUBPANE_HEIGHT = 96;
export const MIN_PRICE_PANE_HEIGHT = 120;
export const PANE_PADDING_Y = 6; // inset so series don't touch the separators

// Volume overlay (exchange-style): a faint histogram anchored to the bottom of
// the price pane and drawn behind the candles, capped at a fraction of the pane.
export const VOLUME_OVERLAY_FRACTION = 0.22;
export const VOLUME_OVERLAY_ALPHA = '4d'; // ~30% — subtle so the candles stay legible

// Hide an axis price label that lands within this many px of the live-price tag,
// so the tag (drawn on top) reads cleanly against the axis.
export const PRICE_LABEL_HIDE_GAP = 10;

export const MACD_COLOR = '#2962ff'; // macd line — blue
export const MACD_SIGNAL_COLOR = '#ff6d00'; // signal line — orange
export const MACD_HIST_UP_COLOR = '#26a69a';
export const MACD_HIST_DOWN_COLOR = '#ef5350';
export const RSI_COLOR = '#b388ff'; // rsi line — light purple
export const RSI_GUIDE_UPPER = 70;
export const RSI_GUIDE_LOWER = 30;

// Non-candlestick series (Stage 8).
export const SERIES_LINE_COLOR = '#2962ff'; // line/area stroke — a standard chart blue
export const SERIES_AREA_ALPHA = '22'; // ~13% fill under the line/baseline

// Markers / price lines (Stage 8).
export const MARKER_SIZE = 5;
export const MARKER_GAP = 8; // px between a bar's extreme and its marker
export const EMPTY_PRICE_LINES: PriceLine[] = [];
export const EMPTY_MARKERS: ChartMarker[] = [];
export const EMPTY_DRAWINGS: Drawing[] = [];
export const EMPTY_STUDIES: StudyDescriptor[] = [];
export const DRAWING_DEFAULT_COLOR = '#f0b90b';

// onViewportChange cadence — leading + trailing, so the resting viewport lands.
export const VIEWPORT_CHANGE_THROTTLE_MS = 100;

// Connection-status chip labels (Stage 8 "states"). The adapter emits the status.
export const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  open: 'Live',
  reconnecting: 'Reconnecting…',
  closed: 'Offline',
  error: 'Error',
};

export const DEFAULT_ACTIVE_STUDIES: ChartStudiesConfig = {
  overlays: ['sma', 'ema', 'bollinger', 'vwap', 'volume'],
  panes: ['rsi', 'macd'],
};

export type SubPaneId = PaneStudyId;

export const FONT_FAMILY = Platform.select({
  ios: 'Helvetica',
  default: 'sans-serif',
}) as string;

export const noop = () => {};

/** Append an 8-bit alpha (e.g. '4d') to a #RRGGBB hex; pass other colors through. */
export function withAlpha(color: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color + alpha : color;
}

/** Index of the bar whose open time is nearest `t` (binary search; times ascending). */
export function nearestIndexByTime(times: number[], t: number): number {
  const n = times.length;
  if (n === 0) return -1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (times[mid]! < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(times[lo - 1]! - t) <= Math.abs(times[lo]! - t)) {
    return lo - 1;
  }
  return lo;
}

/** Small filled triangle for arrow markers (apex up or down). */
export function trianglePath(
  cx: number,
  cy: number,
  size: number,
  up: boolean
): SkPath {
  const p = makePath();
  if (up) {
    p.moveTo(cx, cy - size);
    p.lineTo(cx - size, cy + size);
    p.lineTo(cx + size, cy + size);
  } else {
    p.moveTo(cx, cy + size);
    p.lineTo(cx - size, cy - size);
    p.lineTo(cx + size, cy - size);
  }
  p.close();
  return p.done();
}

export interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  up: boolean;
}

export interface PaneLine {
  path: SkPath;
  color: string;
  strokeWidth: number;
}
export interface PaneHistogram {
  path: SkPath;
  color: string;
}
export interface PaneGuide {
  y: number;
  color: string;
  dashed?: boolean;
}
export interface PaneLabel {
  text: string;
  y: number;
}
export interface SubPane {
  /** Built-in pane id, or `custom:<study id>`. */
  id: string;
  title: string;
  top: number;
  height: number;
  histograms: PaneHistogram[];
  lines: PaneLine[];
  guides: PaneGuide[];
  labels: PaneLabel[];
  /** A custom study's recorded `draw()` output (inner pane coords). */
  picture?: SkPicture | null;
}

/** One stacked sub-pane slot: a built-in study or a consumer `StudyDescriptor`. */
export type PaneSlot = { builtin: SubPaneId } | { custom: StudyRun };

/**
 * Record a custom study's imperative `draw()` into a Skia picture so it can sit in
 * the declarative scene graph. A throwing `draw` yields no picture (never a crash).
 */
export function recordStudy(
  run: StudyRun,
  ctx: Omit<PaneDrawContext, 'canvas'>
): SkPicture | null {
  try {
    return createPicture(
      (canvas) => run.descriptor.draw({ ...ctx, canvas }, run.state),
      { width: ctx.width, height: ctx.height }
    );
  } catch {
    return null;
  }
}

/**
 * A custom pane study: autoscale to its visible values (10% padding), record its
 * `draw()`, and label the visible max/min on the right axis. Inner y-space, as
 * {@link buildSubPane}.
 */
export function buildCustomPane(
  run: StudyRun,
  start: number,
  end: number,
  indexToX: (i: number) => number,
  width: number,
  top: number,
  height: number,
  inner: number,
  theme: ChartTheme
): SubPane {
  const ext = seriesExtent(run.state, start, end);
  const range = ext ? padRange(ext.min, ext.max, false) : { min: 0, max: 1 };
  const valueToY = (v: number): number => priceToY(v, range, inner, false);
  const picture = recordStudy(run, {
    width,
    height: inner,
    indexToX,
    valueToY,
    startIndex: start,
    endIndex: end,
    theme,
  });
  const labels: PaneLabel[] = ext
    ? [
        { text: formatAxisValue(ext.max), y: valueToY(ext.max) + 4 },
        { text: formatAxisValue(ext.min), y: valueToY(ext.min) + 4 },
      ]
    : [];
  return {
    id: `custom:${run.descriptor.id}`,
    title: run.descriptor.name,
    top,
    height,
    histograms: [],
    lines: [],
    guides: [],
    labels,
    picture,
  };
}

/** Price-pane series geometry — one variant per ChartType (Stage 8). */
export type SeriesGeom =
  | { kind: 'candlestick'; geometry: ReturnType<typeof buildCandleGeometry> }
  | { kind: 'bar'; upBars: SkPath; downBars: SkPath }
  | { kind: 'line'; line: SkPath }
  | { kind: 'area'; line: SkPath; area: SkPath }
  | { kind: 'baseline'; line: SkPath; fill: SkPath; baselineY: number };

/** Computed studies bundle (the `studies` useMemo output). */
export type StudiesBundle = BuiltinSeries;

/**
 * Build one sub-pane's render data (paths/guides/labels) against its own y-axis.
 * Everything is in INNER y-space (0 at the top of the usable area, `inner` at the
 * bottom); the caller draws the whole pane inside a group translated by
 * `top + PANE_PADDING_Y`, so the padding inset is applied once at the group.
 */
export function buildSubPane(
  id: SubPaneId,
  s: StudiesBundle,
  start: number,
  end: number,
  offset: number,
  barSpacing: number,
  top: number,
  height: number,
  inner: number
): SubPane {
  const histograms: PaneHistogram[] = [];
  const lines: PaneLine[] = [];
  const guides: PaneGuide[] = [];
  const labels: PaneLabel[] = [];
  let title = '';

  if (id === 'rsi') {
    title = 'RSI 14';
    // Fixed 0..100 axis.
    const valueToY = (v: number): number => inner - (v / 100) * inner;
    lines.push({
      path: buildLinePath(
        s.rsi14,
        start,
        end,
        offset,
        barSpacing,
        0,
        100,
        inner,
        false
      ),
      color: RSI_COLOR,
      strokeWidth: 1.5,
    });
    for (const g of [RSI_GUIDE_UPPER, 50, RSI_GUIDE_LOWER]) {
      guides.push({ y: valueToY(g), color: '#787b8688', dashed: g === 50 });
    }
    labels.push(
      { text: String(RSI_GUIDE_UPPER), y: valueToY(RSI_GUIDE_UPPER) + 4 },
      { text: String(RSI_GUIDE_LOWER), y: valueToY(RSI_GUIDE_LOWER) + 4 }
    );
  } else {
    title = 'MACD 12 26 9';
    // Symmetric axis around 0 over the visible window.
    let m = 0;
    for (let i = start; i <= end; i++) {
      const a = Math.abs(s.macd.macd[i]!);
      const b = Math.abs(s.macd.signal[i]!);
      const c = Math.abs(s.macd.histogram[i]!);
      if (Number.isFinite(a) && a > m) m = a;
      if (Number.isFinite(b) && b > m) m = b;
      if (Number.isFinite(c) && c > m) m = c;
    }
    if (m === 0) m = 1;
    const rMin = -m;
    const rMax = m;
    const { posBars, negBars, zeroY } = buildSignedHistogram(
      s.macd.histogram,
      start,
      end,
      offset,
      barSpacing,
      rMin,
      rMax,
      inner
    );
    histograms.push(
      { path: posBars, color: MACD_HIST_UP_COLOR + '99' },
      { path: negBars, color: MACD_HIST_DOWN_COLOR + '99' }
    );
    lines.push(
      {
        path: buildLinePath(
          s.macd.macd,
          start,
          end,
          offset,
          barSpacing,
          rMin,
          rMax,
          inner,
          false
        ),
        color: MACD_COLOR,
        strokeWidth: 1.25,
      },
      {
        path: buildLinePath(
          s.macd.signal,
          start,
          end,
          offset,
          barSpacing,
          rMin,
          rMax,
          inner,
          false
        ),
        color: MACD_SIGNAL_COLOR,
        strokeWidth: 1.25,
      }
    );
    guides.push({ y: zeroY, color: '#787b8866' });
    labels.push({ text: '0', y: zeroY + 4 });
  }

  return { id, title, top, height, histograms, lines, guides, labels };
}

/** Everything one frame depends on. */
export interface FrameInputs {
  columns: CandleColumns;
  view: { offset: number; barSpacing: number };
  plotWidth: number;
  plotHeight: number;
  logScale: boolean;
  studies: StudiesBundle | null;
  customRuns: Map<string, StudyRun> | null;
  activeStudies: ChartStudiesConfig;
  chartType: ChartType;
  theme: ChartTheme;
  pricePrecision: number;
  priceLines: PriceLine[];
  markers: ChartMarker[];
  drawings: Drawing[];
}

export function buildFrame(inputs: FrameInputs) {
  const {
    columns,
    view,
    plotWidth,
    plotHeight,
    logScale,
    studies,
    customRuns,
    activeStudies,
    chartType,
    theme,
    priceLines,
    markers,
    drawings,
  } = inputs;
  const symbol = { pricePrecision: inputs.pricePrecision };
  if (plotWidth <= 0 || plotHeight <= 0) return null;
  const len = columns.opens.length;
  if (len === 0) return null;

  const viewport = {
    offset: view.offset,
    barSpacing: view.barSpacing,
    rightPadding: 0,
    pinnedToNow: true,
    logScale,
  };
  const { start, end } = visibleRange(viewport, plotWidth, len);
  const centerX = (i: number): number => indexToCenterX(i, viewport);

  // --- Vertical pane layout: price pane on top, sub-panes stacked below,
  // all sharing the x-axis. Each sub-pane gets a fixed slice; the price pane
  // takes the remainder (never below MIN_PRICE_PANE_HEIGHT). Built-in panes
  // come first, then custom pane studies in `studies` order.
  const customOverlayRuns: StudyRun[] = [];
  const customPaneRuns: StudyRun[] = [];
  for (const run of customRuns?.values() ?? []) {
    (run.descriptor.kind === 'pane' ? customPaneRuns : customOverlayRuns).push(
      run
    );
  }
  const maxSubPanes = Math.max(
    0,
    Math.floor((plotHeight - MIN_PRICE_PANE_HEIGHT) / SUBPANE_HEIGHT)
  );
  const paneSlots: PaneSlot[] = [
    ...(studies ? activeStudies.panes : []).map((id) => ({ builtin: id })),
    ...customPaneRuns.map((run) => ({ custom: run })),
  ].slice(0, maxSubPanes);
  const subPanesTotal = paneSlots.length * SUBPANE_HEIGHT;
  const pricePaneHeight = plotHeight - subPanesTotal;

  // --- Price pane autoscale (visible high/low + 10% padding). Log scale only
  // applies while every visible price is > 0.
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = start; i <= end; i++) {
    const l = columns.lows[i]!;
    const h = columns.highs[i]!;
    if (l < lo) lo = l;
    if (h > hi) hi = h;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const log = logScale && lo > 0;
  const range = padRange(lo, hi, log);

  // Price-pane series — candles by default; line/area/bar/baseline per chartType.
  const seriesMap = {
    offset: view.offset,
    barSpacing: view.barSpacing,
    rangeMin: range.min,
    rangeMax: range.max,
    height: pricePaneHeight,
    logScale: log,
  };
  let series: SeriesGeom;
  if (chartType === 'line') {
    series = {
      kind: 'line',
      line: buildLineSeries(columns.closes, start, end, seriesMap),
    };
  } else if (chartType === 'area') {
    series = {
      kind: 'area',
      ...buildAreaSeries(columns.closes, start, end, seriesMap),
    };
  } else if (chartType === 'bar') {
    series = {
      kind: 'bar',
      ...buildBarSeries(columns, start, end, seriesMap),
    };
  } else if (chartType === 'baseline') {
    const baseline = Number.isFinite(columns.closes[start]!)
      ? columns.closes[start]!
      : (range.min + range.max) / 2;
    series = {
      kind: 'baseline',
      ...buildBaselineSeries(columns.closes, start, end, seriesMap, baseline),
    };
  } else {
    series = {
      kind: 'candlestick',
      geometry: buildCandleGeometry(
        columns,
        start,
        end,
        view.offset,
        view.barSpacing,
        range.min,
        range.max,
        pricePaneHeight,
        log
      ),
    };
  }
  // Helper: an overlay line series mapped against the price-pane range.
  const overlayLine = (
    values: number[],
    color: string,
    strokeWidth = 1.5
  ): { path: SkPath; color: string; strokeWidth: number } => ({
    path: buildLinePath(
      values,
      start,
      end,
      view.offset,
      view.barSpacing,
      range.min,
      range.max,
      pricePaneHeight,
      log
    ),
    color,
    strokeWidth,
  });
  const ov = studies ? new Set(activeStudies.overlays) : new Set();
  const overlays: { path: SkPath; color: string; strokeWidth: number }[] = [];
  if (studies) {
    // Bollinger first so the SMA/EMA/VWAP lines sit on top of the band.
    if (ov.has('bollinger')) {
      overlays.push(
        overlayLine(studies.bollinger.upper, OVERLAY_BOLL_BAND_COLOR, 1),
        overlayLine(studies.bollinger.lower, OVERLAY_BOLL_BAND_COLOR, 1),
        overlayLine(studies.bollinger.middle, OVERLAY_BOLL_MID_COLOR, 1)
      );
    }
    if (ov.has('sma'))
      overlays.push(overlayLine(studies.sma20, OVERLAY_SMA_COLOR));
    if (ov.has('ema'))
      overlays.push(overlayLine(studies.ema50, OVERLAY_EMA_COLOR));
    if (ov.has('vwap'))
      overlays.push(overlayLine(studies.vwap, OVERLAY_VWAP_COLOR));
  }
  // Custom overlay studies — drawn against the price axis, above built-ins.
  const pricePaneCtx = {
    width: plotWidth,
    height: pricePaneHeight,
    indexToX: centerX,
    valueToY: (v: number): number => priceToY(v, range, pricePaneHeight, log),
    startIndex: start,
    endIndex: end,
    theme,
  };
  const customOverlays: SkPicture[] = [];
  for (const run of customOverlayRuns) {
    const pic = recordStudy(run, pricePaneCtx);
    if (pic) customOverlays.push(pic);
  }
  // Volume overlay — a faint bottom-anchored histogram behind the candles
  // (exchange-style), capped at VOLUME_OVERLAY_FRACTION of the price pane.
  let volume: { upBars: SkPath; downBars: SkPath } | null = null;
  if (studies && ov.has('volume')) {
    let maxV = 0;
    for (let i = start; i <= end; i++) {
      const v = columns.volumes[i]!;
      if (v > maxV) maxV = v;
    }
    if (maxV > 0) {
      volume = buildVolumeHistogram(
        columns.volumes,
        (i) => columns.closes[i]! >= columns.opens[i]!,
        start,
        end,
        view.offset,
        view.barSpacing,
        maxV / VOLUME_OVERLAY_FRACTION,
        pricePaneHeight
      );
    }
  }
  const priceTicks = niceTicks(range.min, range.max, PRICE_TICK_COUNT)
    .map((value) => ({
      label: formatPrice(value, symbol.pricePrecision),
      y: priceToY(value, range, pricePaneHeight, log),
    }))
    .filter((t) => t.y >= 0 && t.y <= pricePaneHeight);
  // Space time labels by pixels (not candle count) and align to step multiples,
  // so they don't overlap when zoomed in or jitter while panning; clip to the plot.
  const timeTicks: { label: string; x: number }[] = [];
  const stepIdx = Math.max(1, Math.ceil(TIME_LABEL_MIN_PX / view.barSpacing));
  for (let i = Math.ceil(start / stepIdx) * stepIdx; i <= end; i += stepIdx) {
    const x = indexToCenterX(i, viewport);
    if (x >= 0 && x <= plotWidth) {
      timeTicks.push({ label: formatTimeLabel(columns.times[i]!), x });
    }
  }

  // --- Build each active sub-pane (own y-origin + own autoscale).
  const subPanes = paneSlots.map((slot, p) => {
    const top = pricePaneHeight + p * SUBPANE_HEIGHT;
    const h = SUBPANE_HEIGHT;
    const inner = Math.max(1, h - PANE_PADDING_Y * 2);
    if ('custom' in slot) {
      return buildCustomPane(
        slot.custom,
        start,
        end,
        centerX,
        plotWidth,
        top,
        h,
        inner,
        theme
      );
    }
    // Built-in slots only exist when `studies` is computed (see paneSlots).
    return buildSubPane(
      slot.builtin,
      studies!,
      start,
      end,
      view.offset,
      view.barSpacing,
      top,
      h,
      inner
    );
  });

  const li = len - 1;
  const last: OHLCV = {
    open: columns.opens[li]!,
    high: columns.highs[li]!,
    low: columns.lows[li]!,
    close: columns.closes[li]!,
    volume: columns.volumes[li]!,
    up: columns.closes[li]! >= columns.opens[li]!,
  };
  // Price lines (declarative) — map to y; keep those inside the price pane.
  const priceLineGeoms = priceLines
    .map((pl) => ({
      y: priceToY(pl.price, range, pricePaneHeight, log),
      line: pl,
      title: pl.title ?? formatPrice(pl.price, symbol.pricePrecision),
    }))
    .filter((g) => g.y >= 0 && g.y <= pricePaneHeight);

  // Markers (declarative) — snap each to the nearest visible bar by open time.
  const markerGeoms: {
    x: number;
    y: number;
    shape: NonNullable<ChartMarker['shape']>;
    path: SkPath | null;
    color?: string;
    text?: string;
  }[] = [];
  for (const mk of markers) {
    let idx = -1;
    let best = Infinity;
    for (let i = start; i <= end; i++) {
      const d = Math.abs(columns.times[i]! - mk.time);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    if (idx < 0) continue;
    const mx = indexToCenterX(idx, viewport);
    if (mx < 0 || mx > plotWidth) continue;
    const pos = mk.position ?? 'aboveBar';
    const my =
      pos === 'belowBar'
        ? priceToY(columns.lows[idx]!, range, pricePaneHeight, log) + MARKER_GAP
        : pos === 'inBar'
          ? priceToY(columns.closes[idx]!, range, pricePaneHeight, log)
          : priceToY(columns.highs[idx]!, range, pricePaneHeight, log) -
            MARKER_GAP;
    const shape = mk.shape ?? 'circle';
    const path =
      shape === 'arrowUp'
        ? trianglePath(mx, my, MARKER_SIZE, true)
        : shape === 'arrowDown'
          ? trianglePath(mx, my, MARKER_SIZE, false)
          : null;
    markerGeoms.push({
      x: mx,
      y: my,
      shape,
      path,
      color: mk.color,
      text: mk.text,
    });
  }

  // Drawings (declarative, data-coord) — mapped to screen so they track pan/zoom.
  const drawingGeoms: (
    | { kind: 'h'; y: number; color: string }
    | {
        kind: 't';
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        color: string;
      }
  )[] = [];
  for (const d of drawings) {
    const color = d.color ?? DRAWING_DEFAULT_COLOR;
    if (d.kind === 'horizontal') {
      const y = priceToY(d.price, range, pricePaneHeight, log);
      if (y >= 0 && y <= pricePaneHeight) {
        drawingGeoms.push({ kind: 'h', y, color });
      }
    } else {
      const ia = nearestIndexByTime(columns.times, d.a.time);
      const ib = nearestIndexByTime(columns.times, d.b.time);
      if (ia < 0 || ib < 0) continue;
      drawingGeoms.push({
        kind: 't',
        x1: indexToCenterX(ia, viewport),
        y1: priceToY(d.a.price, range, pricePaneHeight, log),
        x2: indexToCenterX(ib, viewport),
        y2: priceToY(d.b.price, range, pricePaneHeight, log),
        color,
      });
    }
  }

  return {
    series,
    overlays,
    volume,
    priceLineGeoms,
    markerGeoms,
    drawingGeoms,
    priceTicks,
    timeTicks,
    range,
    last,
    pricePaneHeight,
    subPanes,
    customOverlays,
    log,
    lastY: priceToY(last.close, range, pricePaneHeight, log),
  };
}

export type Frame = NonNullable<ReturnType<typeof buildFrame>>;

/**
 * Crosshair readout: snap to the nearest bar on x, free price on y. The price
 * maps against the price pane; the vertical line spans every pane.
 */
export function buildCross(
  pointer: { x: number; y: number } | null,
  frame: Frame | null,
  columns: CandleColumns | null,
  view: { offset: number; barSpacing: number }
) {
  if (!pointer || !frame || !columns) return null;
  const len = columns.opens.length;
  const index = Math.min(
    len - 1,
    Math.max(0, Math.round(pointer.x / view.barSpacing + view.offset))
  );
  // Only show the horizontal price line/tag when the pointer is in the price pane.
  const inPricePane = pointer.y <= frame.pricePaneHeight;
  return {
    index,
    x: (index - view.offset) * view.barSpacing + view.barSpacing / 2,
    y: pointer.y,
    inPricePane,
    price: yToPrice(
      Math.min(pointer.y, frame.pricePaneHeight),
      frame.range,
      frame.pricePaneHeight,
      frame.log
    ),
    time: columns.times[index]!,
    ohlcv: {
      open: columns.opens[index]!,
      high: columns.highs[index]!,
      low: columns.lows[index]!,
      close: columns.closes[index]!,
      volume: columns.volumes[index]!,
      up: columns.closes[index]! >= columns.opens[index]!,
    } satisfies OHLCV,
  };
}

export type Cross = NonNullable<ReturnType<typeof buildCross>>;
