# chartston

## 0.3.0

### Minor Changes

- 9ac4381: API completeness (M3):

  - **BREAKING:** the bottom-sheet selectors moved to the `chartston/ui` subpath, so the core `chartston` entry no longer depends on `@gorhom/bottom-sheet`. Update imports: `import { PeriodSelector, SymbolSelector, IndicatorMenu, ChartTypeSelector, ThemeSelector, SelectList } from 'chartston/ui'`.
  - `studies` prop now renders custom `StudyDescriptor`s — overlays on the price axis, panes stacked after the built-ins with their own autoscale. `compute` gets its previous state while data only ticks/grows (incremental) and none after a snapshot / switch / history prepend; a throwing study is skipped. `PaneDrawContext` gains `startIndex` / `endIndex`.
  - `logScale` prop — logarithmic price axis (candles, series, overlays, ticks, markers, drawings, price lines, crosshair).
  - `onViewportChange` now fires (throttled ~100 ms with a trailing call) with `pinnedToNow`.
  - Fix: the chart no longer pages in an extra chunk of older history on every load (lazy history fired before the initial live-edge positioning).

- 86b61e6: Performance (M5) — the JS-thread cost of a live tick no longer grows with the dataset:

  - Built-in studies are incremental (`BuiltinStudies`): a live tick recomputes only the last bar instead of every indicator over the whole series (results match the full calculators to 1e-9). Stress screen, 50k 1s candles + a 16 ms feed with every study on: JS thread 14 → 61 fps, worst stall ~140 → ~31 ms; at 10k: 35 → 60 fps (iOS Simulator, debug build).
  - Rendering moved off React: the canvas shows one SkPicture held in a shared value; gestures, the crosshair and live ticks feed a single per-frame `redraw()` (frame geometry + imperative scene recording) with no React render. Panning at 10k/50k with every study on: JS thread steady at 60–61 fps, worst stall ≤ 30 ms, 0 dropped UI frames (was 23–51 fps with 85–370 ms stalls). `onCrosshairMove` now fires when the hovered bar or its live values change (not on every pointer pixel).
  - Fix: the volume overlay no longer allocates a sparse array spanning the whole dataset every frame.
  - Live updates write the column arrays in place (no per-frame O(n) copy); change detection for incremental consumers uses `markColumns` / `ColumnsMark`, and `studyNeedsReset` now takes a mark.
  - Skia path building moved to `SkPathBuilder` where available (no more `SkPath.moveTo/lineTo/addRect` deprecation warnings), falling back to `SkPath` on older Skia 2.x.

- cf978c6: Streaming robustness (M4):

  - Reconnect gap fill: after the feed reports a drop (`reconnecting` / `error` / `closed`), the next `open` re-fetches the latest page and merges it by time — bars missed while down are inserted even when live bars already landed past the gap, and closed bars get their final REST values. If the outage outlasted a page, the data is replaced and the view re-fits. Works with any `MarketFeedAdapter` that reports status.
  - Live updates are coalesced: a frame's worth of ticks is applied in one pass (≤ one re-render per animation frame), with the same time-keyed patch/append/drop contract.
  - New pure core helpers `applyUpdates` and `mergeRecent`, covered by a Binance-format replay fixture.

### Patch Changes

- 723bcde: - Fix: the loading / empty / error overlays used `StyleSheet.absoluteFillObject`, which no longer exists in React Native 0.85 — they're now positioned explicitly.
  - `<Chart/>`'s root view has `testID="chartston-chart"` for consumers' tests.

## 0.2.0

### Minor Changes

- 41513ae: Initial public preview. GPU candlestick chart for React Native / Expo (New Architecture, Skia + Reanimated):

  - Chart types: candlestick, bar (OHLC), line, area, baseline.
  - Pan / pinch-to-zoom (focal-anchored) / flick momentum on UI-thread worklets.
  - Long-press crosshair with snap-to-bar, OHLCV legend, and last-price tag.
  - Live streaming via a pluggable `MarketFeedAdapter` (snapshot / append / patch); Binance reference adapter included.
  - Built-in studies (SMA, EMA, WMA, Bollinger, RSI, MACD, ATR, Stochastic, VWAP) as price-pane overlays + volume-behind-candles + RSI/MACD oscillator panes.
  - Declarative markers, price lines, and trend / horizontal drawings (data-coord, track pan & zoom).
  - Dark / light theming, chart-type / indicator / symbol / period selectors, and loading / empty / error / connection states.

- Lazy historical data — scrolling back toward the start now pages in older candles via the adapter's `endTime`, prepending them and keeping the viewport in place (seam-deduped). Plus: the live-price right-axis tag clamps inside the price pane instead of spilling past the edge when the latest price is outside the visible range.
