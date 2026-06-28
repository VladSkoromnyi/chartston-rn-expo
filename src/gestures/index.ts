/**
 * `gestures/` — pan / pinch / momentum as UI-thread worklets (PLAN §5.1, §5.4).
 *
 * Gestures mutate the shared `offset` (pan) and `barSpacing` (pinch, focal-anchored)
 * directly on the UI thread; the chart's derived candle geometry reacts without
 * touching the JS thread. `onSettle` runs on JS when a gesture finishes (incl. after
 * momentum) to recompute autoscale + axis ticks.
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

export interface UseChartGesturesParams {
  offset: SharedValue<number>;
  barSpacing: SharedValue<number>;
  dataLen: SharedValue<number>;
  plotWidth: number;
  /** Runs on JS when a gesture settles — recompute autoscale + axes. */
  onSettle: () => void;
}

export function useChartGestures({
  offset,
  barSpacing,
  dataLen,
  plotWidth,
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
        // Keep the focal bar pinned under the fingers.
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

    return Gesture.Simultaneous(pan, pinch);
  }, [offset, barSpacing, dataLen, plotWidth, onSettle]);
}
