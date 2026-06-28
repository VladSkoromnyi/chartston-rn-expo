/**
 * `ui/` — generic controls (PLAN §6). Every "list of options" surface (intervals,
 * symbols, indicators, chart type, theme) is the SAME `SelectList → BottomSheet →
 * onSelect` primitive plus a thin config.
 *
 * Consumers must mount a `BottomSheetModalProvider` (from @gorhom/bottom-sheet)
 * above these, inside a `GestureHandlerRootView`.
 *
 * TODO(stage-7): IndicatorMenu (add/remove studies). TODO(stage-8): ChartTypeSelector,
 * ThemeSelector — also thin configs of SelectList.
 */

export * from './SelectList';
export * from './PeriodSelector';
export * from './SymbolSelector';
