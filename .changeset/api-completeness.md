---
'chartston': minor
---

API completeness (M3):

- **BREAKING:** the bottom-sheet selectors moved to the `chartston/ui` subpath, so the core `chartston` entry no longer depends on `@gorhom/bottom-sheet`. Update imports: `import { PeriodSelector, SymbolSelector, IndicatorMenu, ChartTypeSelector, ThemeSelector, SelectList } from 'chartston/ui'`.
- `studies` prop now renders custom `StudyDescriptor`s — overlays on the price axis, panes stacked after the built-ins with their own autoscale. `compute` gets its previous state while data only ticks/grows (incremental) and none after a snapshot / switch / history prepend; a throwing study is skipped. `PaneDrawContext` gains `startIndex` / `endIndex`.
- `logScale` prop — logarithmic price axis (candles, series, overlays, ticks, markers, drawings, price lines, crosshair).
- `onViewportChange` now fires (throttled ~100 ms with a trailing call) with `pinnedToNow`.
- Fix: the chart no longer pages in an extra chunk of older history on every load (lazy history fired before the initial live-edge positioning).
