/**
 * `gestures/` — pan / pinch / momentum + long-press crosshair, as UI-thread
 * worklets (PLAN §5.1, §5.4).
 *
 * - quick drag        → pan (`offset`)
 * - pinch             → zoom (`barSpacing`, focal-anchored)
 * - flick             → momentum (`withDecay`)
 * - long-press + drag → crosshair (writes `crosshairX`/`crosshairY`; -1 = inactive)
 *
 * The crosshair pan only activates after a long press, so a normal drag still
 * pans; `Exclusive` gives the crosshair priority once the press is held.
 */

import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import type { ComposedGesture } from 'react-native-gesture-handler';
import { runOnJS, withDecay } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

const MIN_BAR_SPACING = 2;
const MAX_BAR_SPACING = 40;
/** Keep at least this fraction of a screen of candles in view when panning to the edges. */
const KEEP_VISIBLE_FRACTION = 0.25;
const CROSSHAIR_LONG_PRESS_MS = 250;

export interface UseChartGesturesParams {
  offset: SharedValue<number>;
  barSpacing: SharedValue<number>;
  dataLen: SharedValue<number>;
  plotWidth: number;
  crosshairX: SharedValue<number>;
  crosshairY: SharedValue<number>;
  /** Runs on JS when a pan/pinch settles — recompute autoscale + axes. */
  onSettle: () => void;
}

export function useChartGestures({
  offset,
  barSpacing,
  dataLen,
  plotWidth,
  crosshairX,
  crosshairY,
  onSettle,
}: UseChartGesturesParams): ComposedGesture {
  return useMemo(() => {
    const pan = Gesture.Pan()
      .onChange((e) => {
        'worklet';
        const visible = plotWidth / barSpacing.value;
        const maxOffset = Math.max(
          0,
          dataLen.value -
            Math.max(1, Math.floor(visible * KEEP_VISIBLE_FRACTION))
        );
        let next = offset.value - e.changeX / barSpacing.value;
        if (next < 0) next = 0;
        else if (next > maxOffset) next = maxOffset;
        offset.value = next;
      })
      .onEnd((e) => {
        'worklet';
        const visible = plotWidth / barSpacing.value;
        const maxOffset = Math.max(
          0,
          dataLen.value -
            Math.max(1, Math.floor(visible * KEEP_VISIBLE_FRACTION))
        );
        offset.value = withDecay(
          {
            velocity: -e.velocityX / barSpacing.value,
            deceleration: 0.997,
            clamp: [0, maxOffset],
          },
          () => {
            runOnJS(onSettle)();
          }
        );
      });

    const pinch = Gesture.Pinch()
      .onChange((e) => {
        'worklet';
        const focalIndex = offset.value + e.focalX / barSpacing.value;
        let next = barSpacing.value * e.scaleChange;
        if (next < MIN_BAR_SPACING) next = MIN_BAR_SPACING;
        else if (next > MAX_BAR_SPACING) next = MAX_BAR_SPACING;
        barSpacing.value = next;
        const visible = plotWidth / next;
        const maxOffset = Math.max(
          0,
          dataLen.value -
            Math.max(1, Math.floor(visible * KEEP_VISIBLE_FRACTION))
        );
        let off = focalIndex - e.focalX / next;
        if (off < 0) off = 0;
        else if (off > maxOffset) off = maxOffset;
        offset.value = off;
      })
      .onEnd(() => {
        'worklet';
        runOnJS(onSettle)();
      });

    const crosshair = Gesture.Pan()
      .activateAfterLongPress(CROSSHAIR_LONG_PRESS_MS)
      .onStart((e) => {
        'worklet';
        crosshairX.value = e.x;
        crosshairY.value = e.y;
      })
      .onChange((e) => {
        'worklet';
        crosshairX.value = e.x;
        crosshairY.value = e.y;
      })
      .onFinalize(() => {
        'worklet';
        crosshairX.value = -1;
        crosshairY.value = -1;
      });

    return Gesture.Simultaneous(pinch, Gesture.Exclusive(crosshair, pan));
  }, [
    offset,
    barSpacing,
    dataLen,
    plotWidth,
    crosshairX,
    crosshairY,
    onSettle,
  ]);
}
