/**
 * <Chart/> — the public component (PLAN §5.1).
 *
 * STAGE 3 adds, on top of the Stage-2 viewport/gestures:
 *  - a long-press crosshair (snap-to-index) with price/time axis labels,
 *  - a synchronized OHLCV legend (the hovered bar, or the latest bar when idle),
 *  - the last-price line, and
 *  - the `onCrosshairMove(bar, index)` callback.
 *
 * Geometry/axes/crosshair are rebuilt in JS memos driven by the gesture-mirrored
 * viewport; moving the candle rebuild fully onto the UI thread is a perf follow-up.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';
import {
  Canvas,
  Circle,
  Group,
  Line,
  Path,
  Rect,
  Skia,
  Text,
  matchFont,
  vec,
} from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import type {
  Candle,
  CandleUpdate,
  ChartMarker,
  ChartProps,
  ChartStudiesConfig,
  ConnectionStatus,
  Drawing,
  PaneStudyId,
  PriceLine,
} from '../types';
import { DARK_THEME } from '../theme';
import {
  bollinger,
  candlesToColumns,
  ema,
  formatCompact,
  formatPrice,
  formatTimeLabel,
  indexToCenterX,
  ingestColumns,
  initialViewport,
  macd,
  niceTicks,
  priceToY,
  rsi,
  sma,
  visibleRange,
  vwap,
  yToPrice,
} from '../core';
import type { CandleColumns } from '../core';
import {
  buildAreaSeries,
  buildBarSeries,
  buildBaselineSeries,
  buildCandleGeometry,
  buildLinePath,
  buildLineSeries,
  buildSignedHistogram,
  buildVolumeHistogram,
} from '../render';
import { useChartGestures } from '../gestures';

const PRICE_AXIS_WIDTH = 56;
const TIME_AXIS_HEIGHT = 24;
const DEFAULT_BAR_SPACING = 8;
const PRICE_TICK_COUNT = 5;
const TIME_LABEL_MIN_PX = 64;
const OVERLAY_SMA_COLOR = '#f0b90b';
const OVERLAY_EMA_COLOR = '#3b82f6';
const OVERLAY_BOLL_BAND_COLOR = '#787b86'; // upper/lower — muted grey
const OVERLAY_BOLL_MID_COLOR = '#b2b5be'; // middle — lighter, thin
const OVERLAY_VWAP_COLOR = '#e040fb'; // magenta/purple
const LEGEND_STEP = 70;

// Sub-pane layout (Stage 7). Each active sub-pane gets a fixed slice below the
// price pane; the price pane keeps whatever is left (never below the minimum).
const SUBPANE_HEIGHT = 96;
const MIN_PRICE_PANE_HEIGHT = 120;
const PANE_PADDING_Y = 6; // inset so series don't touch the separators

// Volume overlay (exchange-style): a faint histogram anchored to the bottom of
// the price pane and drawn behind the candles, capped at a fraction of the pane.
const VOLUME_OVERLAY_FRACTION = 0.22;
const VOLUME_OVERLAY_ALPHA = '4d'; // ~30% — subtle so the candles stay legible

// Hide an axis price label that lands within this many px of the live-price tag,
// so the tag (drawn on top) reads cleanly against the axis.
const PRICE_LABEL_HIDE_GAP = 10;

const MACD_COLOR = '#2962ff'; // macd line — blue
const MACD_SIGNAL_COLOR = '#ff6d00'; // signal line — orange
const MACD_HIST_UP_COLOR = '#26a69a';
const MACD_HIST_DOWN_COLOR = '#ef5350';
const RSI_COLOR = '#b388ff'; // rsi line — light purple
const RSI_GUIDE_UPPER = 70;
const RSI_GUIDE_LOWER = 30;

// Non-candlestick series (Stage 8).
const SERIES_LINE_COLOR = '#2962ff'; // line/area stroke — a standard chart blue
const SERIES_AREA_ALPHA = '22'; // ~13% fill under the line/baseline

// Markers / price lines (Stage 8).
const MARKER_SIZE = 5;
const MARKER_GAP = 8; // px between a bar's extreme and its marker
const EMPTY_PRICE_LINES: PriceLine[] = [];
const EMPTY_MARKERS: ChartMarker[] = [];
const EMPTY_DRAWINGS: Drawing[] = [];
const DRAWING_DEFAULT_COLOR = '#f0b90b';

// Connection-status chip labels (Stage 8 "states"). The adapter emits the status.
const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  open: 'Live',
  reconnecting: 'Reconnecting…',
  closed: 'Offline',
  error: 'Error',
};

const DEFAULT_ACTIVE_STUDIES: ChartStudiesConfig = {
  overlays: ['sma', 'ema', 'bollinger', 'vwap', 'volume'],
  panes: ['rsi', 'macd'],
};

type SubPaneId = PaneStudyId;

const FONT_FAMILY = Platform.select({
  ios: 'Helvetica',
  default: 'sans-serif',
}) as string;

const noop = () => {};

/** Append an 8-bit alpha (e.g. '4d') to a #RRGGBB hex; pass other colors through. */
function withAlpha(color: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color + alpha : color;
}

/** Index of the bar whose open time is nearest `t` (binary search; times ascending). */
function nearestIndexByTime(times: number[], t: number): number {
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
function trianglePath(
  cx: number,
  cy: number,
  size: number,
  up: boolean
): SkPath {
  const p = Skia.Path.Make();
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
  return p;
}

interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  up: boolean;
}

interface PaneLine {
  path: SkPath;
  color: string;
  strokeWidth: number;
}
interface PaneHistogram {
  path: SkPath;
  color: string;
}
interface PaneGuide {
  y: number;
  color: string;
  dashed?: boolean;
}
interface PaneLabel {
  text: string;
  y: number;
}
interface SubPane {
  id: SubPaneId;
  title: string;
  top: number;
  height: number;
  histograms: PaneHistogram[];
  lines: PaneLine[];
  guides: PaneGuide[];
  labels: PaneLabel[];
}

/** Price-pane series geometry — one variant per ChartType (Stage 8). */
type SeriesGeom =
  | { kind: 'candlestick'; geometry: ReturnType<typeof buildCandleGeometry> }
  | { kind: 'bar'; upBars: SkPath; downBars: SkPath }
  | { kind: 'line'; line: SkPath }
  | { kind: 'area'; line: SkPath; area: SkPath }
  | { kind: 'baseline'; line: SkPath; fill: SkPath; baselineY: number };

/** Computed studies bundle (the `studies` useMemo output). */
type StudiesBundle = {
  sma20: number[];
  ema50: number[];
  bollinger: { upper: number[]; lower: number[]; middle: number[] };
  vwap: number[];
  rsi14: number[];
  macd: { macd: number[]; signal: number[]; histogram: number[] };
};

/**
 * Build one sub-pane's render data (paths/guides/labels) against its own y-axis.
 * Everything is in INNER y-space (0 at the top of the usable area, `inner` at the
 * bottom); the caller draws the whole pane inside a group translated by
 * `top + PANE_PADDING_Y`, so the padding inset is applied once at the group.
 */
function buildSubPane(
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

export function Chart(props: ChartProps): ReactElement {
  const {
    adapter,
    symbol,
    interval,
    theme: themeProp,
    style,
    onCrosshairMove,
    activeStudies = DEFAULT_ACTIVE_STUDIES,
    chartType = 'candlestick',
    priceLines = EMPTY_PRICE_LINES,
    markers = EMPTY_MARKERS,
    drawings = EMPTY_DRAWINGS,
  } = props;
  const theme = themeProp ?? DARK_THEME;
  const font = useMemo(
    () => matchFont({ fontFamily: FONT_FAMILY, fontSize: theme.fontSize }),
    [theme.fontSize]
  );

  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const plotWidth = width - PRICE_AXIS_WIDTH;
  const plotHeight = height - TIME_AXIS_HEIGHT;
  const plotWidthRef = useRef(0);
  plotWidthRef.current = plotWidth;

  const [columns, setColumns] = useState<CandleColumns | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Shared viewport + crosshair (mutated by gestures on the UI thread).
  const offset = useSharedValue(0);
  const barSpacing = useSharedValue(DEFAULT_BAR_SPACING);
  const dataLen = useSharedValue(0);
  const crosshairX = useSharedValue(-1);
  const crosshairY = useSharedValue(-1);

  // React-state mirrors that drive rendering.
  const [view, setView] = useState({
    offset: 0,
    barSpacing: DEFAULT_BAR_SPACING,
  });
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const positioned = useRef(false);
  const lastTimeRef = useRef(-Infinity);

  // Apply a live update (Stage 4–5). Time-keyed so backfill↔live merges correctly:
  // a bar whose open time matches the last bar patches it; a newer one appends.
  const applyUpdate = useCallback(
    (u: CandleUpdate) => {
      if (u.type === 'snapshot') {
        setColumns(candlesToColumns(u.candles));
        dataLen.value = u.candles.length;
        lastTimeRef.current =
          u.candles.length > 0
            ? u.candles[u.candles.length - 1]!.time
            : -Infinity;
        positioned.current = false;
        return;
      }
      const c = u.candle;
      const last = lastTimeRef.current;
      let action: 'patch' | 'append';
      if (c.time > last) action = 'append';
      else if (c.time === last) action = 'patch';
      else return; // out of order — ignore
      if (action === 'append') {
        const prevLen = dataLen.value;
        const newLen = prevLen + 1;
        dataLen.value = newLen;
        lastTimeRef.current = c.time;
        // Advance the view if it was pinned to the live edge.
        const bs = barSpacing.value;
        const visible = bs > 0 ? plotWidthRef.current / bs : 0;
        const wasPinned = offset.value + visible >= prevLen - 1;
        if (wasPinned && plotWidthRef.current > 0) {
          offset.value = Math.max(0, newLen - Math.floor(visible));
        }
      }
      setColumns((prev) => (prev ? ingestColumns(prev, action, c) : prev));
    },
    [dataLen, offset, barSpacing]
  );

  // Load history, then subscribe for live patch/append updates.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const controller = new AbortController();
    setLoadError(false);
    setStatus('connecting');
    adapter
      .fetchHistory({ symbol, interval, signal: controller.signal })
      .then((candles) => {
        if (cancelled) return;
        setColumns(candlesToColumns(candles));
        dataLen.value = candles.length;
        lastTimeRef.current =
          candles.length > 0 ? candles[candles.length - 1]!.time : -Infinity;
        positioned.current = false;
        unsubscribe = adapter.subscribe({
          symbol,
          interval,
          onUpdate: (u) => {
            if (!cancelled) applyUpdate(u);
          },
          onStatus: (s) => {
            if (!cancelled) setStatus(s);
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
      unsubscribe?.();
    };
  }, [adapter, symbol, interval, dataLen, applyUpdate, reloadKey]);

  // Position at the live edge once data + size are known.
  useEffect(() => {
    if (!columns || plotWidth <= 0 || columns.opens.length === 0) return;
    if (positioned.current) return;
    const init = initialViewport(
      columns.opens.length,
      plotWidth,
      DEFAULT_BAR_SPACING
    );
    offset.value = init.offset;
    barSpacing.value = init.barSpacing;
    setView({ offset: init.offset, barSpacing: init.barSpacing });
    positioned.current = true;
  }, [columns, plotWidth, offset, barSpacing]);

  // Mirror viewport + crosshair shared values into React state.
  useAnimatedReaction(
    () => ({ o: offset.value, b: barSpacing.value }),
    (cur, prev) => {
      if (!prev || cur.o !== prev.o || cur.b !== prev.b) {
        runOnJS(setView)({ offset: cur.o, barSpacing: cur.b });
      }
    }
  );
  useAnimatedReaction(
    () => ({ x: crosshairX.value, y: crosshairY.value }),
    (cur, prev) => {
      if (prev && cur.x === prev.x && cur.y === prev.y) return;
      runOnJS(setPointer)(cur.x < 0 ? null : { x: cur.x, y: cur.y });
    }
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize({ width: w, height: h });
  };

  // Rebuild geometry + autoscale + axis ticks (JS, viewport-clipped).
  // Overlay studies — computed on data change only, not per pan frame.
  const studies = useMemo(() => {
    if (!columns || columns.closes.length === 0) return null;
    return {
      sma20: sma(columns.closes, 20),
      ema50: ema(columns.closes, 50),
      bollinger: bollinger(columns.closes, 20, 2),
      vwap: vwap(
        columns.highs,
        columns.lows,
        columns.closes,
        columns.volumes,
        columns.times
      ),
      rsi14: rsi(columns.closes, 14),
      macd: macd(columns.closes, 12, 26, 9),
    };
  }, [columns]);

  const frame = useMemo(() => {
    if (!columns || plotWidth <= 0 || plotHeight <= 0) return null;
    const len = columns.opens.length;
    if (len === 0) return null;

    const viewport = {
      offset: view.offset,
      barSpacing: view.barSpacing,
      rightPadding: 0,
      pinnedToNow: true,
      logScale: false,
    };
    const { start, end } = visibleRange(viewport, plotWidth, len);

    // --- Vertical pane layout: price pane on top, sub-panes stacked below,
    // all sharing the x-axis. Each sub-pane gets a fixed slice; the price pane
    // takes the remainder (never below MIN_PRICE_PANE_HEIGHT).
    const activePaneIds: SubPaneId[] = studies ? activeStudies.panes : [];
    const maxSubPanes = Math.max(
      0,
      Math.floor((plotHeight - MIN_PRICE_PANE_HEIGHT) / SUBPANE_HEIGHT)
    );
    const paneIds = activePaneIds.slice(0, maxSubPanes);
    const subPanesTotal = paneIds.length * SUBPANE_HEIGHT;
    const pricePaneHeight = plotHeight - subPanesTotal;

    // --- Price pane autoscale (visible high/low + 10% padding).
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = start; i <= end; i++) {
      const l = columns.lows[i]!;
      const h = columns.highs[i]!;
      if (l < lo) lo = l;
      if (h > hi) hi = h;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.1;
    const range = { min: lo - pad, max: hi + pad };

    // Price-pane series — candles by default; line/area/bar/baseline per chartType.
    const seriesMap = {
      offset: view.offset,
      barSpacing: view.barSpacing,
      rangeMin: range.min,
      rangeMax: range.max,
      height: pricePaneHeight,
      logScale: false,
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
          false
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
        false
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
    // Volume overlay — a faint bottom-anchored histogram behind the candles
    // (exchange-style), capped at VOLUME_OVERLAY_FRACTION of the price pane.
    let volume: { upBars: SkPath; downBars: SkPath } | null = null;
    if (studies && ov.has('volume')) {
      let maxV = 0;
      const up: boolean[] = [];
      for (let i = start; i <= end; i++) {
        const v = columns.volumes[i]!;
        if (v > maxV) maxV = v;
        up[i] = columns.closes[i]! >= columns.opens[i]!;
      }
      if (maxV > 0) {
        volume = buildVolumeHistogram(
          columns.volumes,
          up,
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
        y: priceToY(value, range, pricePaneHeight, false),
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
    const subPanes = studies
      ? paneIds.map((id, p) => {
          const top = pricePaneHeight + p * SUBPANE_HEIGHT;
          const h = SUBPANE_HEIGHT;
          const inner = Math.max(1, h - PANE_PADDING_Y * 2);
          return buildSubPane(
            id,
            studies,
            start,
            end,
            view.offset,
            view.barSpacing,
            top,
            h,
            inner
          );
        })
      : [];

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
        y: priceToY(pl.price, range, pricePaneHeight, false),
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
          ? priceToY(columns.lows[idx]!, range, pricePaneHeight, false) +
            MARKER_GAP
          : pos === 'inBar'
            ? priceToY(columns.closes[idx]!, range, pricePaneHeight, false)
            : priceToY(columns.highs[idx]!, range, pricePaneHeight, false) -
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
        const y = priceToY(d.price, range, pricePaneHeight, false);
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
          y1: priceToY(d.a.price, range, pricePaneHeight, false),
          x2: indexToCenterX(ib, viewport),
          y2: priceToY(d.b.price, range, pricePaneHeight, false),
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
      lastY: priceToY(last.close, range, pricePaneHeight, false),
    };
  }, [
    columns,
    view,
    plotWidth,
    plotHeight,
    symbol.pricePrecision,
    studies,
    activeStudies,
    chartType,
    priceLines,
    markers,
    drawings,
  ]);

  // Crosshair info (snap to nearest bar on x; free price on y). The price readout
  // maps against the price pane; the vertical line spans every pane.
  const cross = useMemo(() => {
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
        false
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
  }, [pointer, frame, columns, view]);

  // Fire the public crosshair callback.
  useEffect(() => {
    if (!onCrosshairMove) return;
    if (cross && columns) {
      const bar: Candle = {
        time: cross.time,
        open: cross.ohlcv.open,
        high: cross.ohlcv.high,
        low: cross.ohlcv.low,
        close: cross.ohlcv.close,
        volume: cross.ohlcv.volume,
      };
      onCrosshairMove(bar, cross.index);
    } else {
      onCrosshairMove(null, -1);
    }
  }, [cross, columns, onCrosshairMove]);

  const gesture = useChartGestures({
    offset,
    barSpacing,
    dataLen,
    plotWidth,
    crosshairX,
    crosshairY,
    onSettle: noop,
  });

  const legend: OHLCV | null = cross ? cross.ohlcv : (frame?.last ?? null);
  const legendSegments = legend
    ? [
        {
          k: 'O',
          v: formatPrice(legend.open, symbol.pricePrecision),
          c: theme.axisTextColor,
        },
        {
          k: 'H',
          v: formatPrice(legend.high, symbol.pricePrecision),
          c: theme.axisTextColor,
        },
        {
          k: 'L',
          v: formatPrice(legend.low, symbol.pricePrecision),
          c: theme.axisTextColor,
        },
        {
          k: 'C',
          v: formatPrice(legend.close, symbol.pricePrecision),
          c: legend.up ? theme.upColor : theme.downColor,
        },
        { k: 'V', v: formatCompact(legend.volume), c: theme.axisTextColor },
      ]
    : [];

  const lastY = frame ? frame.lastY : Number.NEGATIVE_INFINITY;
  // Keep the live-price tag inside the price pane even when the latest price is
  // outside the visible (auto-scaled) range — it pins to the top/bottom edge.
  const lastTagY = frame
    ? Math.max(8, Math.min(frame.pricePaneHeight - 8, frame.lastY))
    : 0;
  const statusLabel = STATUS_LABEL[status];
  const statusDotColor =
    status === 'open'
      ? theme.upColor
      : status === 'connecting' || status === 'reconnecting'
        ? '#f0b90b'
        : status === 'error' || status === 'closed'
          ? theme.downColor
          : theme.axisTextColor;

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.fill, style]} onLayout={onLayout}>
        {width > 0 && height > 0 && (
          <Canvas style={styles.fill}>
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              color={theme.background}
            />

            {frame?.priceTicks.map((t, i) => (
              <Line
                key={`grid-${i}`}
                p1={vec(0, t.y)}
                p2={vec(plotWidth, t.y)}
                color={theme.gridColor}
                strokeWidth={1}
              />
            ))}
            {/* Right axis line (spans every pane) + time-axis top border. */}
            <Line
              p1={vec(plotWidth, 0)}
              p2={vec(plotWidth, plotHeight)}
              color={theme.axisLineColor}
              strokeWidth={1}
            />
            <Line
              p1={vec(0, plotHeight)}
              p2={vec(plotWidth, plotHeight)}
              color={theme.axisLineColor}
              strokeWidth={1}
            />

            {/* Sub-pane separators (drawn before series so series sit on top). */}
            {frame?.subPanes.map((p) => (
              <Line
                key={`sep-${p.id}`}
                p1={vec(0, p.top)}
                p2={vec(plotWidth, p.top)}
                color={theme.paneSeparatorColor}
                strokeWidth={1}
              />
            ))}

            {frame && (
              <Group
                clip={Skia.XYWHRect(
                  0,
                  0,
                  Math.max(0, plotWidth),
                  Math.max(0, frame.pricePaneHeight)
                )}
              >
                {/* Volume overlay — behind the candles, anchored to the pane bottom. */}
                {frame.volume && (
                  <>
                    <Path
                      path={frame.volume.upBars}
                      color={withAlpha(theme.upColor, VOLUME_OVERLAY_ALPHA)}
                    />
                    <Path
                      path={frame.volume.downBars}
                      color={withAlpha(theme.downColor, VOLUME_OVERLAY_ALPHA)}
                    />
                  </>
                )}
                {frame.series.kind === 'candlestick' && (
                  <>
                    <Path
                      path={frame.series.geometry.upWicks}
                      color={theme.wickUpColor}
                      style="stroke"
                      strokeWidth={1}
                    />
                    <Path
                      path={frame.series.geometry.downWicks}
                      color={theme.wickDownColor}
                      style="stroke"
                      strokeWidth={1}
                    />
                    <Path
                      path={frame.series.geometry.upBodies}
                      color={theme.upColor}
                    />
                    <Path
                      path={frame.series.geometry.downBodies}
                      color={theme.downColor}
                    />
                    {theme.borderVisible && (
                      <>
                        <Path
                          path={frame.series.geometry.upBodies}
                          color={theme.borderUpColor}
                          style="stroke"
                          strokeWidth={1}
                        />
                        <Path
                          path={frame.series.geometry.downBodies}
                          color={theme.borderDownColor}
                          style="stroke"
                          strokeWidth={1}
                        />
                      </>
                    )}
                  </>
                )}
                {frame.series.kind === 'bar' && (
                  <>
                    <Path
                      path={frame.series.upBars}
                      color={theme.upColor}
                      style="stroke"
                      strokeWidth={1.25}
                    />
                    <Path
                      path={frame.series.downBars}
                      color={theme.downColor}
                      style="stroke"
                      strokeWidth={1.25}
                    />
                  </>
                )}
                {frame.series.kind === 'line' && (
                  <Path
                    path={frame.series.line}
                    color={SERIES_LINE_COLOR}
                    style="stroke"
                    strokeWidth={2}
                  />
                )}
                {frame.series.kind === 'area' && (
                  <>
                    <Path
                      path={frame.series.area}
                      color={withAlpha(SERIES_LINE_COLOR, SERIES_AREA_ALPHA)}
                    />
                    <Path
                      path={frame.series.line}
                      color={SERIES_LINE_COLOR}
                      style="stroke"
                      strokeWidth={2}
                    />
                  </>
                )}
                {frame.series.kind === 'baseline' && (
                  <>
                    <Group
                      clip={Skia.XYWHRect(
                        0,
                        0,
                        Math.max(0, plotWidth),
                        Math.max(0, frame.series.baselineY)
                      )}
                    >
                      <Path
                        path={frame.series.fill}
                        color={withAlpha(theme.upColor, SERIES_AREA_ALPHA)}
                      />
                      <Path
                        path={frame.series.line}
                        color={theme.upColor}
                        style="stroke"
                        strokeWidth={2}
                      />
                    </Group>
                    <Group
                      clip={Skia.XYWHRect(
                        0,
                        frame.series.baselineY,
                        Math.max(0, plotWidth),
                        Math.max(
                          0,
                          frame.pricePaneHeight - frame.series.baselineY
                        )
                      )}
                    >
                      <Path
                        path={frame.series.fill}
                        color={withAlpha(theme.downColor, SERIES_AREA_ALPHA)}
                      />
                      <Path
                        path={frame.series.line}
                        color={theme.downColor}
                        style="stroke"
                        strokeWidth={2}
                      />
                    </Group>
                    <Line
                      p1={vec(0, frame.series.baselineY)}
                      p2={vec(plotWidth, frame.series.baselineY)}
                      color={theme.axisLineColor}
                      strokeWidth={1}
                    />
                  </>
                )}
                {frame.overlays.map((ov, i) => (
                  <Path
                    key={`ov-${i}`}
                    path={ov.path}
                    color={ov.color}
                    style="stroke"
                    strokeWidth={ov.strokeWidth}
                  />
                ))}
              </Group>
            )}

            {/* Sub-panes (Volume / RSI / MACD): each translated to its y-origin,
                clipped to its inner area, with its own series + guides + labels. */}
            {frame?.subPanes.map((p) => (
              <Group
                key={`pane-${p.id}`}
                transform={[{ translateY: p.top + PANE_PADDING_Y }]}
              >
                <Group
                  clip={Skia.XYWHRect(
                    0,
                    0,
                    Math.max(0, plotWidth),
                    Math.max(0, p.height - PANE_PADDING_Y * 2)
                  )}
                >
                  {p.guides.map((g, i) => (
                    <Line
                      key={`g-${i}`}
                      p1={vec(0, g.y)}
                      p2={vec(plotWidth, g.y)}
                      color={g.color}
                      strokeWidth={1}
                    />
                  ))}
                  {p.histograms.map((h, i) => (
                    <Path key={`h-${i}`} path={h.path} color={h.color} />
                  ))}
                  {p.lines.map((l, i) => (
                    <Path
                      key={`l-${i}`}
                      path={l.path}
                      color={l.color}
                      style="stroke"
                      strokeWidth={l.strokeWidth}
                    />
                  ))}
                </Group>
                {/* Pane title (top-left) + right-axis value labels. */}
                {font && (
                  <Text
                    x={6}
                    y={12}
                    text={p.title}
                    font={font}
                    color={theme.axisTextColor}
                  />
                )}
                {font &&
                  p.labels.map((lb, i) => (
                    <Text
                      key={`pv-${i}`}
                      x={plotWidth + 4}
                      y={lb.y}
                      text={lb.text}
                      font={font}
                      color={theme.axisTextColor}
                    />
                  ))}
              </Group>
            ))}

            {/* Axis labels — drawn before the live-price tag + crosshair so those
                dynamic tags paint on top (crosshair top-most). The price label
                nearest the live-price tag is hidden so the tag reads cleanly. */}
            {font &&
              frame?.priceTicks
                .filter((t) => Math.abs(t.y - lastY) >= PRICE_LABEL_HIDE_GAP)
                .map((t, i) => (
                  <Text
                    key={`pl-${i}`}
                    x={plotWidth + 4}
                    y={t.y + 4}
                    text={t.label}
                    font={font}
                    color={theme.axisTextColor}
                  />
                ))}
            {font &&
              frame?.timeTicks.map((t, i) => (
                <Text
                  key={`tl-${i}`}
                  x={t.x - 16}
                  y={plotHeight + 16}
                  text={t.label}
                  font={font}
                  color={theme.axisTextColor}
                />
              ))}

            {/* Price lines (declarative) — over the series, under the live tag. */}
            {frame?.priceLineGeoms.map((g, i) => (
              <Group key={`pln-${i}`}>
                <Line
                  p1={vec(0, g.y)}
                  p2={vec(plotWidth, g.y)}
                  color={g.line.color ?? theme.crosshairColor}
                  strokeWidth={g.line.lineWidth ?? 1}
                />
                <Rect
                  x={plotWidth}
                  y={g.y - 8}
                  width={PRICE_AXIS_WIDTH}
                  height={16}
                  color={g.line.color ?? theme.crosshairColor}
                />
                {font && (
                  <Text
                    x={plotWidth + 4}
                    y={g.y + 4}
                    text={g.title}
                    font={font}
                    color={theme.crosshairLabelText}
                  />
                )}
              </Group>
            ))}

            {/* Markers (declarative) — anchored to bars, clipped to the price pane. */}
            {frame && frame.markerGeoms.length > 0 && (
              <Group
                clip={Skia.XYWHRect(
                  0,
                  0,
                  Math.max(0, plotWidth),
                  Math.max(0, frame.pricePaneHeight)
                )}
              >
                {frame.markerGeoms.map((m, i) => {
                  const c = m.color ?? theme.crosshairColor;
                  return (
                    <Group key={`mk-${i}`}>
                      {m.shape === 'circle' && (
                        <Circle cx={m.x} cy={m.y} r={MARKER_SIZE} color={c} />
                      )}
                      {m.shape === 'square' && (
                        <Rect
                          x={m.x - MARKER_SIZE}
                          y={m.y - MARKER_SIZE}
                          width={MARKER_SIZE * 2}
                          height={MARKER_SIZE * 2}
                          color={c}
                        />
                      )}
                      {m.path && <Path path={m.path} color={c} />}
                      {font && m.text && (
                        <Text
                          x={m.x + MARKER_SIZE + 2}
                          y={m.y + 3}
                          text={m.text}
                          font={font}
                          color={c}
                        />
                      )}
                    </Group>
                  );
                })}
              </Group>
            )}

            {/* Drawings (declarative, data-coord) — clipped to the price pane. */}
            {frame && frame.drawingGeoms.length > 0 && (
              <Group
                clip={Skia.XYWHRect(
                  0,
                  0,
                  Math.max(0, plotWidth),
                  Math.max(0, frame.pricePaneHeight)
                )}
              >
                {frame.drawingGeoms.map((d, i) =>
                  d.kind === 'h' ? (
                    <Line
                      key={`dr-${i}`}
                      p1={vec(0, d.y)}
                      p2={vec(plotWidth, d.y)}
                      color={d.color}
                      strokeWidth={1.5}
                    />
                  ) : (
                    <Line
                      key={`dr-${i}`}
                      p1={vec(d.x1, d.y1)}
                      p2={vec(d.x2, d.y2)}
                      color={d.color}
                      strokeWidth={1.5}
                    />
                  )
                )}
              </Group>
            )}

            {/* Last-price line + tag — tag is clamped inside the price pane; the
                line is hidden when the latest price is outside the visible range. */}
            {frame && (
              <Group>
                {frame.lastY >= 0 && frame.lastY <= frame.pricePaneHeight && (
                  <Line
                    p1={vec(0, frame.lastY)}
                    p2={vec(plotWidth, frame.lastY)}
                    color={
                      frame.last.up
                        ? theme.lastPriceUpColor
                        : theme.lastPriceDownColor
                    }
                    strokeWidth={1}
                  />
                )}
                <Rect
                  x={plotWidth}
                  y={lastTagY - 8}
                  width={PRICE_AXIS_WIDTH}
                  height={16}
                  color={
                    frame.last.up
                      ? theme.lastPriceUpColor
                      : theme.lastPriceDownColor
                  }
                />
                {font && (
                  <Text
                    x={plotWidth + 4}
                    y={lastTagY + 4}
                    text={formatPrice(frame.last.close, symbol.pricePrecision)}
                    font={font}
                    color={theme.crosshairLabelText}
                  />
                )}
              </Group>
            )}

            {/* Crosshair — vertical line spans every pane; the horizontal price
                line/tag only show while the pointer is over the price pane. */}
            {cross && (
              <Group>
                <Line
                  p1={vec(cross.x, 0)}
                  p2={vec(cross.x, plotHeight)}
                  color={theme.crosshairColor}
                  strokeWidth={1}
                />
                {cross.inPricePane && (
                  <>
                    <Line
                      p1={vec(0, cross.y)}
                      p2={vec(plotWidth, cross.y)}
                      color={theme.crosshairColor}
                      strokeWidth={1}
                    />
                    <Rect
                      x={plotWidth}
                      y={cross.y - 8}
                      width={PRICE_AXIS_WIDTH}
                      height={16}
                      color={theme.crosshairLabelBackground}
                    />
                    {font && (
                      <Text
                        x={plotWidth + 4}
                        y={cross.y + 4}
                        text={formatPrice(cross.price, symbol.pricePrecision)}
                        font={font}
                        color={theme.crosshairLabelText}
                      />
                    )}
                  </>
                )}
                <Rect
                  x={cross.x - 24}
                  y={plotHeight}
                  width={48}
                  height={TIME_AXIS_HEIGHT}
                  color={theme.crosshairLabelBackground}
                />
                {font && (
                  <Text
                    x={cross.x - 16}
                    y={plotHeight + 16}
                    text={formatTimeLabel(cross.time)}
                    font={font}
                    color={theme.crosshairLabelText}
                  />
                )}
              </Group>
            )}

            {/* OHLCV legend (top-left) */}
            {font &&
              legendSegments.map((seg, i) => (
                <Text
                  key={`leg-${i}`}
                  x={8 + i * LEGEND_STEP}
                  y={16}
                  text={`${seg.k} ${seg.v}`}
                  font={font}
                  color={seg.c}
                />
              ))}
          </Canvas>
        )}

        {/* Connection-status chip (sits just left of the price axis). */}
        {columns && columns.opens.length > 0 && (
          <View
            style={[styles.statusChip, { right: PRICE_AXIS_WIDTH + 8 }]}
            pointerEvents="none"
          >
            <View
              style={[styles.statusDot, { backgroundColor: statusDotColor }]}
            />
            <RNText style={[styles.statusText, { color: theme.axisTextColor }]}>
              {statusLabel}
            </RNText>
          </View>
        )}

        {/* States: error (with retry) / loading / empty. */}
        {loadError ? (
          <View style={styles.overlay} pointerEvents="box-none">
            <RNText
              style={[styles.overlayText, { color: theme.axisTextColor }]}
            >
              Couldn&apos;t load {symbol.displayName}.
            </RNText>
            <Pressable
              onPress={() => setReloadKey((k) => k + 1)}
              style={[styles.retryBtn, { borderColor: theme.axisLineColor }]}
            >
              <RNText
                style={[styles.retryText, { color: theme.crosshairLabelText }]}
              >
                Retry
              </RNText>
            </Pressable>
          </View>
        ) : !columns ? (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color={theme.axisTextColor} />
            <RNText
              style={[styles.overlayText, { color: theme.axisTextColor }]}
            >
              Loading…
            </RNText>
          </View>
        ) : columns.opens.length === 0 ? (
          <View style={styles.overlay} pointerEvents="none">
            <RNText
              style={[styles.overlayText, { color: theme.axisTextColor }]}
            >
              No data
            </RNText>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  overlayText: { fontSize: 14, fontWeight: '500' },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
  },
  retryText: { fontSize: 13, fontWeight: '600' },
  statusChip: {
    position: 'absolute',
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
});
