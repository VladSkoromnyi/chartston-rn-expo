/**
 * `gestures/` — Reanimated + Gesture Handler worklets (PLAN §5.1). All run on the
 * UI thread so the JS thread stays free.
 *
 * TODO(stage-2): compose pan -> `viewport.offset`, pinch -> `viewport.barSpacing`
 * (anchored on the focal bar), flick momentum, and long-press crosshair, mutating
 * the shared `viewport` value directly from worklets.
 */

import type { SharedValue } from 'react-native-reanimated';
import type { Viewport } from '../types';

export interface UseChartGesturesParams {
  /** Shared viewport mutated on the UI thread by the gestures. */
  viewport: SharedValue<Viewport>;
  /** Pane width in px (needed to clamp pan + anchor pinch). */
  width: number;
}

/**
 * Returns a composed `GestureType` to spread onto a `<GestureDetector>`.
 * Stubbed until Stage 2.
 */
export function useChartGestures(_params: UseChartGesturesParams): void {
  // TODO(stage-2)
}
