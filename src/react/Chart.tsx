/**
 * <Chart/> — the public component (PLAN §5.1).
 *
 * STAGE 2 (viewport & gestures): the viewport (`offset`, `barSpacing`) lives in
 * Reanimated shared values and is mutated by pan/pinch on the UI thread; a
 * `useAnimatedReaction` mirrors it into React state, and the (viewport-clipped)
 * candle geometry + autoscale + axes are rebuilt in a JS memo. Clipping bounds the
 * per-frame cost to what's on screen.
 *
 * NOTE (perf follow-up): the rebuild currently runs on the JS thread per gesture
 * frame. Moving it fully onto the UI thread (worklet-built Skia paths) is a planned
 * optimization for the 60fps@10k target.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';
import {
  Canvas,
  Group,
  Line,
  Path,
  Rect,
  Skia,
  Text,
  matchFont,
  vec,
} from '@shopify/react-native-skia';
import type { ChartProps } from '../types';
import { DARK_THEME } from '../theme';
import {
  formatPrice,
  formatTimeLabel,
  indexToCenterX,
  initialViewport,
  niceTicks,
  priceToY,
  visibleRange,
} from '../core';
import { buildCandleGeometry } from '../render';
import type { CandleColumns } from '../render';
import { useChartGestures } from '../gestures';

const PRICE_AXIS_WIDTH = 56;
const TIME_AXIS_HEIGHT = 24;
const DEFAULT_BAR_SPACING = 8;
const PRICE_TICK_COUNT = 5;
const TIME_TICK_COUNT = 5;

const FONT_FAMILY = Platform.select({
  ios: 'Helvetica',
  default: 'sans-serif',
}) as string;

const noop = () => {};

export function Chart(props: ChartProps): ReactElement {
  const { adapter, symbol, interval, theme: themeProp, style } = props;
  const theme = themeProp ?? DARK_THEME;
  const font = useMemo(
    () => matchFont({ fontFamily: FONT_FAMILY, fontSize: theme.fontSize }),
    [theme.fontSize]
  );

  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const plotWidth = width - PRICE_AXIS_WIDTH;
  const plotHeight = height - TIME_AXIS_HEIGHT;

  const [columns, setColumns] = useState<CandleColumns | null>(null);

  // Shared viewport (mutated by gestures on the UI thread).
  const offset = useSharedValue(0);
  const barSpacing = useSharedValue(DEFAULT_BAR_SPACING);
  const dataLen = useSharedValue(0);
  // React-state mirror that drives rendering.
  const [view, setView] = useState({
    offset: 0,
    barSpacing: DEFAULT_BAR_SPACING,
  });
  const positioned = useRef(false);

  // Load history.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    adapter
      .fetchHistory({ symbol, interval, signal: controller.signal })
      .then((candles) => {
        if (cancelled) return;
        setColumns({
          times: candles.map((c) => c.time),
          opens: candles.map((c) => c.open),
          highs: candles.map((c) => c.high),
          lows: candles.map((c) => c.low),
          closes: candles.map((c) => c.close),
        });
        dataLen.value = candles.length;
        positioned.current = false;
      })
      .catch(() => {
        // TODO(stage-5): surface load errors via connection status.
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [adapter, symbol, interval, dataLen]);

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

  // Mirror the shared viewport into React state on every gesture frame.
  useAnimatedReaction(
    () => ({ o: offset.value, b: barSpacing.value }),
    (cur, prev) => {
      if (!prev || cur.o !== prev.o || cur.b !== prev.b) {
        runOnJS(setView)({ offset: cur.o, barSpacing: cur.b });
      }
    }
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize({ width: w, height: h });
  };

  // Rebuild geometry + autoscale + axis ticks (JS, viewport-clipped).
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
    const mn = lo - pad;
    const mx = hi + pad;
    const range = { min: mn, max: mx };

    const geometry = buildCandleGeometry(
      columns,
      start,
      end,
      view.offset,
      view.barSpacing,
      mn,
      mx,
      plotHeight,
      false
    );
    const priceTicks = niceTicks(mn, mx, PRICE_TICK_COUNT).map((value) => ({
      label: formatPrice(value, symbol.pricePrecision),
      y: priceToY(value, range, plotHeight, false),
    }));
    const timeTicks: { label: string; x: number }[] = [];
    const stepIdx = Math.max(1, Math.floor((end - start) / TIME_TICK_COUNT));
    for (let i = start; i <= end; i += stepIdx) {
      timeTicks.push({
        label: formatTimeLabel(columns.times[i]!),
        x: indexToCenterX(i, viewport),
      });
    }
    return { geometry, priceTicks, timeTicks };
  }, [columns, view, plotWidth, plotHeight, symbol.pricePrecision]);

  const gesture = useChartGestures({
    offset,
    barSpacing,
    dataLen,
    plotWidth,
    onSettle: noop,
  });

  const clip = useMemo(
    () => Skia.XYWHRect(0, 0, Math.max(0, plotWidth), Math.max(0, plotHeight)),
    [plotWidth, plotHeight]
  );

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

            {frame && (
              <Group clip={clip}>
                <Path
                  path={frame.geometry.upWicks}
                  color={theme.wickUpColor}
                  style="stroke"
                  strokeWidth={1}
                />
                <Path
                  path={frame.geometry.downWicks}
                  color={theme.wickDownColor}
                  style="stroke"
                  strokeWidth={1}
                />
                <Path path={frame.geometry.upBodies} color={theme.upColor} />
                <Path
                  path={frame.geometry.downBodies}
                  color={theme.downColor}
                />
                {theme.borderVisible && (
                  <>
                    <Path
                      path={frame.geometry.upBodies}
                      color={theme.borderUpColor}
                      style="stroke"
                      strokeWidth={1}
                    />
                    <Path
                      path={frame.geometry.downBodies}
                      color={theme.borderDownColor}
                      style="stroke"
                      strokeWidth={1}
                    />
                  </>
                )}
              </Group>
            )}

            {font &&
              frame?.priceTicks.map((t, i) => (
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
          </Canvas>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
