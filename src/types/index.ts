/**
 * Chartston public type surface — the single source of truth (PLAN.md §7).
 *
 * Derived from how real exchanges and TradingView Lightweight Charts shape data
 * (see RESEARCH.md). A consumer can wire Chartston to *any* feed by implementing
 * one small adapter interface ({@link MarketFeedAdapter}) and, optionally, custom
 * studies ({@link StudyDescriptor}).
 *
 * TIME-UNIT CONVENTION (loud, on purpose): internal canonical time is epoch
 * **MILLISECONDS, UTC**. Lightweight Charts uses seconds; Binance uses ms.
 * Adapters convert at the edges — never leak a non-ms time into the core.
 */

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
// Type-only import: erased at runtime, so `core/` stays runnable in plain Node.
import type { SkCanvas } from '@shopify/react-native-skia';

// ----------------------------------------------------------------------------
// Time & price
// ----------------------------------------------------------------------------

/** Epoch milliseconds, UTC. The one true time unit inside Chartston. */
export type Millis = number;

/** Where an indicator reads its input value from a bar. */
export type PriceSource =
  'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4';

// ----------------------------------------------------------------------------
// Candle
// ----------------------------------------------------------------------------

/** One OHLC(V) bar. `time` is the bar OPEN time (UTC, ms). */
export interface Candle {
  time: Millis;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * A read-only, index-addressable view over the internal candle buffer.
 * `at()` returns a *copy* for ergonomics; the `Float64Array` accessors are the
 * zero-allocation hot path for indicator/render loops.
 */
export interface CandleView {
  readonly length: number;
  at(i: number): Candle;
  timeAt(i: number): Millis;
  // Typed-array columns for hot loops (aligned; index 0..length-1):
  readonly times: Float64Array;
  readonly opens: Float64Array;
  readonly highs: Float64Array;
  readonly lows: Float64Array;
  readonly closes: Float64Array;
  readonly volumes: Float64Array;
}

// ----------------------------------------------------------------------------
// Live updates (mirrors Lightweight Charts setData/update semantics; RESEARCH §4)
// ----------------------------------------------------------------------------

export type CandleUpdate =
  | { type: 'snapshot'; candles: Candle[] } // full reset (history / symbol switch)
  | { type: 'append'; candle: Candle } //      a NEW interval opened
  | { type: 'patch'; candle: Candle }; //       the ACTIVE bar mutated in place

// ----------------------------------------------------------------------------
// Intervals
// ----------------------------------------------------------------------------

export type Interval =
  | '1s'
  | '5s'
  | '15s'
  | '30s'
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'
  | '1M';

export interface IntervalMeta {
  interval: Interval;
  /** Nominal duration in ms. NOTE: `1M` is calendar-variable — this is an approximation; use interval math for boundaries. */
  ms: number;
  label: string;
}

// ----------------------------------------------------------------------------
// Symbol
// ----------------------------------------------------------------------------

export interface SymbolInfo {
  id: string; //             'BTCUSDT'
  base: string; //           'BTC'
  quote: string; //          'USDT'
  exchange?: string; //      'binance'
  displayName?: string; //   'BTC / USDT'
  pricePrecision: number; // decimals for price formatting
  qtyPrecision: number; //   decimals for volume/qty
  type?: 'spot' | 'perp' | 'futures' | 'stock' | 'forex';
}

// ----------------------------------------------------------------------------
// Feed adapter — THE extensibility seam (RESEARCH §13)
// ----------------------------------------------------------------------------

export type ConnectionStatus =
  'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

export interface FetchHistoryRequest {
  symbol: SymbolInfo;
  interval: Interval;
  limit?: number;
  /** Page backwards from this time (exclusive upper bound), for lazy history. */
  endTime?: Millis;
  signal?: AbortSignal;
}

export interface SubscribeRequest {
  symbol: SymbolInfo;
  interval: Interval;
  onUpdate: (u: CandleUpdate) => void;
  onStatus?: (s: ConnectionStatus) => void;
}

export interface MarketFeedAdapter {
  name: string;
  /** Historical backfill (REST). Must honor `signal` for cancellation. */
  fetchHistory(req: FetchHistoryRequest): Promise<Candle[]>;
  /** Live stream (WS). Returns an unsubscribe fn; emits {@link CandleUpdate}. */
  subscribe(req: SubscribeRequest): () => void;
}

// ----------------------------------------------------------------------------
// Viewport & scale (RESEARCH §5–6)
// ----------------------------------------------------------------------------

export interface Viewport {
  /** Left-most visible candle index (fractional ok — matches LWC logical range). */
  offset: number;
  /** Pixels per candle (pinch-zoom target). */
  barSpacing: number;
  /** Empty space reserved at the live (right) edge, in px. */
  rightPadding: number;
  /** When true, appending a new bar advances the view to keep "now" visible. */
  pinnedToNow: boolean;
  /** Logarithmic price axis. */
  logScale: boolean;
}

/** The min/max price band currently mapped to the pane height (autoscale output). */
export interface PriceRange {
  min: number;
  max: number;
}

// ----------------------------------------------------------------------------
// Studies / indicators (RESEARCH §9–10)
// ----------------------------------------------------------------------------

export type StudyInputs = Record<string, number | string>;

/**
 * Incremental study state. `series` holds output arrays aligned to candle
 * indices (one entry per named output line, e.g. MACD has macd/signal/hist).
 * `scratch` carries running accumulators (EMA value, Wilder avgGain, …) so a
 * `patch`/`append` recomputes only the tail, not the whole window.
 */
export interface StudyState {
  series: Record<string, Float64Array>;
  scratch: Record<string, number>;
  /** Highest candle index already incorporated into `series`. */
  lastIndex: number;
}

/** Drawing surface handed to a study's `draw()` (Skia layer). */
export interface PaneDrawContext {
  canvas: SkCanvas;
  width: number;
  height: number;
  indexToX: (index: number) => number;
  valueToY: (value: number) => number;
  theme: ChartTheme;
}

/**
 * A study described declaratively so a consumer can ship their own.
 * `compute` is pure & incremental; `draw` paints `state` onto a pane.
 */
export interface StudyDescriptor<S extends StudyState = StudyState> {
  id: string;
  kind: 'overlay' | 'pane';
  name: string; // 'RSI', 'MACD', …
  inputs: StudyInputs; // periods, source, …
  compute(candles: CandleView, prev?: S): S;
  draw(ctx: PaneDrawContext, state: S): void;
}

// ----------------------------------------------------------------------------
// Built-in studies (Stage 7) — the batteries-included indicators <Chart/> draws
// natively, toggled via the IndicatorMenu. (The declarative StudyDescriptor API
// above is the extensibility seam for custom studies; this is the curated set.)
// ----------------------------------------------------------------------------

/**
 * Built-in overlays drawn on the price pane. `volume` is a faint histogram
 * anchored to the bottom of the price pane, behind the candles (TradingView-style);
 * the others are line series.
 */
export type OverlayStudyId = 'sma' | 'ema' | 'bollinger' | 'vwap' | 'volume';

/** Built-in studies drawn in their own stacked sub-pane below the price pane. */
export type PaneStudyId = 'rsi' | 'macd';

export type BuiltinStudyId = OverlayStudyId | PaneStudyId;

/**
 * Which built-in studies are active. Overlays render on the price pane; panes
 * render as stacked sub-panes (in the order listed) sharing the x-axis.
 */
export interface ChartStudiesConfig {
  overlays: OverlayStudyId[];
  panes: PaneStudyId[];
}

// ----------------------------------------------------------------------------
// Theme (color model from RESEARCH §1 — up/down/border/wick set separately)
// ----------------------------------------------------------------------------

export interface ChartTheme {
  name?: string;
  background: string;
  // Candles:
  upColor: string;
  downColor: string;
  borderUpColor: string;
  borderDownColor: string;
  wickUpColor: string;
  wickDownColor: string;
  borderVisible: boolean;
  wickVisible: boolean;
  // Grid / axes / text:
  gridColor: string;
  axisLineColor: string;
  axisTextColor: string;
  fontSize: number;
  // Crosshair:
  crosshairColor: string;
  crosshairLabelBackground: string;
  crosshairLabelText: string;
  // Last-price line:
  lastPriceUpColor: string;
  lastPriceDownColor: string;
  // Panes:
  paneSeparatorColor: string;
}

// ----------------------------------------------------------------------------
// Generic UI primitive — SelectList → BottomSheet → onSelect (PLAN §6.1)
// ----------------------------------------------------------------------------

export interface SelectOption<T = unknown> {
  id: string;
  label: string;
  value: T;
  sublabel?: string; //  e.g. full symbol name, study description
  icon?: ReactNode;
  group?: string; //     optional section grouping
  disabled?: boolean;
}

export interface SelectListProps<T> {
  title?: string;
  options: SelectOption<T>[];
  selectedId?: string;
  /** Ids to mark selected in multi-select mode (checkmark per row). */
  selectedIds?: string[];
  searchable?: boolean; //                          symbols list -> true
  /** Keep the sheet open after a tap (multi-select). Defaults to true (close). */
  closeOnSelect?: boolean;
  onSelect: (option: SelectOption<T>) => void; //   <-- interactivity contract
  renderRow?: (o: SelectOption<T>) => ReactNode; //  override for custom rows
  snapPoints?: (string | number)[];
}

// ----------------------------------------------------------------------------
// Public chart props
// ----------------------------------------------------------------------------

export type ChartType = 'candlestick' | 'line' | 'area' | 'bar' | 'baseline';

/** A horizontal price line drawn across the price pane with a right-axis tag. */
export interface PriceLine {
  price: number;
  color?: string;
  /** Right-axis tag text; defaults to the formatted price. */
  title?: string;
  /** `dashed` is reserved; currently rendered solid. */
  lineStyle?: 'solid' | 'dashed';
  lineWidth?: number;
}

/** A marker anchored to a bar (matched by open time), drawn above/below the bar. */
export interface ChartMarker {
  /** Bar open time (ms); snapped to the nearest visible bar. */
  time: number;
  position?: 'aboveBar' | 'belowBar' | 'inBar';
  shape?: 'circle' | 'arrowUp' | 'arrowDown' | 'square';
  color?: string;
  /** Optional text drawn beside the marker. */
  text?: string;
}

/** A point in data coordinates (bar open time + price) so drawings track pan/zoom. */
export interface DrawingPoint {
  time: number;
  price: number;
}

/** A user drawing: a horizontal price level, or a trend line between two points. */
export type Drawing =
  | { kind: 'horizontal'; price: number; color?: string }
  | { kind: 'trend'; a: DrawingPoint; b: DrawingPoint; color?: string };

export interface ChartProps {
  symbol: SymbolInfo;
  interval: Interval;
  adapter: MarketFeedAdapter;
  /** Custom declarative studies (extensibility seam). */
  studies?: StudyDescriptor[];
  /** Built-in studies to draw (overlays + sub-panes); see {@link ChartStudiesConfig}. */
  activeStudies?: ChartStudiesConfig;
  theme?: ChartTheme;
  chartType?: ChartType;
  /** Horizontal price lines (alerts/entries) drawn across the price pane. */
  priceLines?: PriceLine[];
  /** Markers anchored to bars, matched by open time. */
  markers?: ChartMarker[];
  /** Trend + horizontal line drawings in data coords (persist them per-symbol). */
  drawings?: Drawing[];
  style?: StyleProp<ViewStyle>;
  onCrosshairMove?: (bar: Candle | null, index: number) => void;
  onViewportChange?: (v: Viewport) => void;
}
