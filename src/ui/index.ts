/**
 * `ui/` — generic controls (PLAN §6). Every "list of options" surface (intervals,
 * symbols, indicators, chart type, theme) is the SAME `SelectList → BottomSheet →
 * onSelect` primitive plus a thin config.
 *
 * Consumers must mount a `BottomSheetModalProvider` (from @gorhom/bottom-sheet)
 * above these, inside a `GestureHandlerRootView`.
 *
 * Stage 8 adds ThemeSelector; ChartTypeSelector is the remaining thin SelectList config.
 */

export * from './SelectList';
export * from './PeriodSelector';
export * from './SymbolSelector';
export * from './IndicatorMenu';
export * from './ThemeSelector';
