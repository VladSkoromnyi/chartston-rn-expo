/**
 * `ui/` — generic controls (PLAN §6). Every "list of options" surface (intervals,
 * symbols, indicators, chart type, theme) is the SAME primitive below plus a thin
 * config.
 *
 * TODO(stage-6): wire `SelectList` to @gorhom/bottom-sheet (trigger -> sheet ->
 * data list -> onSelect -> close), with optional search + section grouping. Then
 * PeriodSelector / SymbolSelector / IndicatorMenu / ChartTypeSelector / ThemeSelector
 * are each just a configuration of it.
 */

import type { ReactElement } from 'react';
import type { SelectListProps } from '../types';

/** The core primitive: trigger -> BottomSheet -> list -> `onSelect` (PLAN §6.1). */
export function SelectList<T>(_props: SelectListProps<T>): ReactElement | null {
  // TODO(stage-6)
  return null;
}
