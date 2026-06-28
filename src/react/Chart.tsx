/**
 * <Chart/> — the public component (PLAN §5.1).
 *
 * STAGE 3 adds, on top of the Stage-2 viewport/gestures:
 *  - a long-press crosshair (snap-to-index) with price/time axis labels,
 *  - a synchronized OHLCV legend (the hovered bar, or the latest bar when idle),
 *  - the last-price line, and
 *  - the `onCrosshairMove(bar, index)` callback.
 *
 * Geometry/axes/crosshair are rebuilt in JS memos driven by the gesture-mirrored
 * viewport; moving the candle rebuild fully onto the UI thread is a perf follow-up.
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
import type { Candle, ChartProps } from '../types';
import { DARK_THEME } from '../theme';
import {
  formatCompact,
  formatPrice,
  formatTimeLabel,
  indexToCenterX,
  initialViewport,
  niceTicks,
  priceToY,
  visibleRange,
  yToPrice,
} from '../core';
import { buildCandleGeometry } from '../render';
import type { CandleColumns } from '../render';
import { useChartGestures } from '../gestures';

const PRICE_AXIS_WIDTH = 56;
const TIME_AXIS_HEIGHT = 24;
const DEFAULT_BAR_SPACING = 8;
const PRICE_TICK_COUNT = 5;
const TIME_TICK_COUNT = 5;
const LEGEND_STEP = 70;

const FONT_FAMILY = Platform.select({
  ios: 'Helvetica',
  default: 'sans-serif',
}) as string;

const noop = () => {};

interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  up: boolean;
}

export function Chart(props: ChartProps): ReactElement {
  const {
    adapter,
    symbol,
    interval,
    theme: themeProp,
    style,
    onCrosshairMove,
  } = props;
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

  // Shared viewport + crosshair (mutated by gestures on the UI thread).
  const offset = useSharedValue(0);
  const barSpacing = useSharedValue(DEFAULT_BAR_SPACING);
  const dataLen = useSharedValue(0);
  const crosshairX = useSharedValue(-1);
  const crosshairY = useSharedValue(-1);

  // React-state mirrors that drive rendering.
  const [view, setView] = useState({
    offset: 0,
    barSpacing: DEFAULT_BAR_SPACING,
  });
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
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
          volumes: candles.map((c) => c.volume ?? 0),
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

  // Mirror viewport + crosshair shared values into React state.
  useAnimatedReaction(
    () => ({ o: offset.value, b: barSpacing.value }),
    (cur, prev) => {
      if (!prev || cur.o !== prev.o || cur.b !== prev.b) {
        runOnJS(setView)({ offset: cur.o, barSpacing: cur.b });
      }
    }
  );
  useAnimatedReaction(
    () => ({ x: crosshairX.value, y: crosshairY.value }),
    (cur, prev) => {
      if (prev && cur.x === prev.x && cur.y === prev.y) return;
      runOnJS(setPointer)(cur.x < 0 ? null : { x: cur.x, y: cur.y });
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
    const range = { min: lo - pad, max: hi + pad };

    const geometry = buildCandleGeometry(
      columns,
      start,
      end,
      view.offset,
      view.barSpacing,
      range.min,
      range.max,
      plotHeight,
      false
    );
    const priceTicks = niceTicks(range.min, range.max, PRICE_TICK_COUNT).map(
      (value) => ({
        label: formatPrice(value, symbol.pricePrecision),
        y: priceToY(value, range, plotHeight, false),
      })
    );
    const timeTicks: { label: string; x: number }[] = [];
    const stepIdx = Math.max(1, Math.floor((end - start) / TIME_TICK_COUNT));
    for (let i = start; i <= end; i += stepIdx) {
      timeTicks.push({
        label: formatTimeLabel(columns.times[i]!),
        x: indexToCenterX(i, viewport),
      });
    }

    const li = len - 1;
    const last: OHLCV = {
      open: columns.opens[li]!,
      high: columns.highs[li]!,
      low: columns.lows[li]!,
      close: columns.closes[li]!,
      volume: columns.volumes[li]!,
      up: columns.closes[li]! >= columns.opens[li]!,
    };
    return {
      geometry,
      priceTicks,
      timeTicks,
      range,
      last,
      lastY: priceToY(last.close, range, plotHeight, false),
    };
  }, [columns, view, plotWidth, plotHeight, symbol.pricePrecision]);

  // Crosshair info (snap to nearest bar on x; free price on y).
  const cross = useMemo(() => {
    if (!pointer || !frame || !columns) return null;
    const len = columns.opens.length;
    const index = Math.min(
      len - 1,
      Math.max(0, Math.round(pointer.x / view.barSpacing + view.offset))
    );
    return {
      index,
      x: (index - view.offset) * view.barSpacing + view.barSpacing / 2,
      y: pointer.y,
      price: yToPrice(pointer.y, frame.range, plotHeight, false),
      time: columns.times[index]!,
      ohlcv: {
        open: columns.opens[index]!,
        high: columns.highs[index]!,
        low: columns.lows[index]!,
        close: columns.closes[index]!,
        volume: columns.volumes[index]!,
        up: columns.closes[index]! >= columns.opens[index]!,
      } satisfies OHLCV,
    };
  }, [pointer, frame, columns, view, plotHeight]);

  // Fire the public crosshair callback.
  useEffect(() => {
    if (!onCrosshairMove) return;
    if (cross && columns) {
      const bar: Candle = {
        time: cross.time,
        open: cross.ohlcv.open,
        high: cross.ohlcv.high,
        low: cross.ohlcv.low,
        close: cross.ohlcv.close,
        volume: cross.ohlcv.volume,
      };
      onCrosshairMove(bar, cross.index);
    } else {
      onCrosshairMove(null, -1);
    }
  }, [cross, columns, onCrosshairMove]);

  const gesture = useChartGestures({
    offset,
    barSpacing,
    dataLen,
    plotWidth,
    crosshairX,
    crosshairY,
    onSettle: noop,
  });

  const clip = useMemo(
    () => Skia.XYWHRect(0, 0, Math.max(0, plotWidth), Math.max(0, plotHeight)),
    [plotWidth, plotHeight]
  );

  const legend: OHLCV | null = cross ? cross.ohlcv : (frame?.last ?? null);
  const legendSegments = legend
    ? [
        {
          k: 'O',
          v: formatPrice(legend.open, symbol.pricePrecision),
          c: theme.axisTextColor,
        },
        {
          k: 'H',
          v: formatPrice(legend.high, symbol.pricePrecision),
          c: theme.axisTextColor,
        },
        {
          k: 'L',
          v: formatPrice(legend.low, symbol.pricePrecision),
          c: theme.axisTextColor,
        },
        {
          k: 'C',
          v: formatPrice(legend.close, symbol.pricePrecision),
          c: legend.up ? theme.upColor : theme.downColor,
        },
        { k: 'V', v: formatCompact(legend.volume), c: theme.axisTextColor },
      ]
    : [];

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

            {/* Last-price line + tag */}
            {frame && (
              <Group>
                <Line
                  p1={vec(0, frame.lastY)}
                  p2={vec(plotWidth, frame.lastY)}
                  color={
                    frame.last.up
                      ? theme.lastPriceUpColor
                      : theme.lastPriceDownColor
                  }
                  strokeWidth={1}
                />
                <Rect
                  x={plotWidth}
                  y={frame.lastY - 8}
                  width={PRICE_AXIS_WIDTH}
                  height={16}
                  color={
                    frame.last.up
                      ? theme.lastPriceUpColor
                      : theme.lastPriceDownColor
                  }
                />
                {font && (
                  <Text
                    x={plotWidth + 4}
                    y={frame.lastY + 4}
                    text={formatPrice(frame.last.close, symbol.pricePrecision)}
                    font={font}
                    color={theme.crosshairLabelText}
                  />
                )}
              </Group>
            )}

            {/* Crosshair */}
            {cross && (
              <Group>
                <Line
                  p1={vec(cross.x, 0)}
                  p2={vec(cross.x, plotHeight)}
                  color={theme.crosshairColor}
                  strokeWidth={1}
                />
                <Line
                  p1={vec(0, cross.y)}
                  p2={vec(plotWidth, cross.y)}
                  color={theme.crosshairColor}
                  strokeWidth={1}
                />
                <Rect
                  x={plotWidth}
                  y={cross.y - 8}
                  width={PRICE_AXIS_WIDTH}
                  height={16}
                  color={theme.crosshairLabelBackground}
                />
                <Rect
                  x={cross.x - 24}
                  y={plotHeight}
                  width={48}
                  height={TIME_AXIS_HEIGHT}
                  color={theme.crosshairLabelBackground}
                />
                {font && (
                  <Text
                    x={plotWidth + 4}
                    y={cross.y + 4}
                    text={formatPrice(cross.price, symbol.pricePrecision)}
                    font={font}
                    color={theme.crosshairLabelText}
                  />
                )}
                {font && (
                  <Text
                    x={cross.x - 16}
                    y={plotHeight + 16}
                    text={formatTimeLabel(cross.time)}
                    font={font}
                    color={theme.crosshairLabelText}
                  />
                )}
              </Group>
            )}

            {/* Axis labels */}
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

            {/* OHLCV legend (top-left) */}
            {font &&
              legendSegments.map((seg, i) => (
                <Text
                  key={`leg-${i}`}
                  x={8 + i * LEGEND_STEP}
                  y={16}
                  text={`${seg.k} ${seg.v}`}
                  font={font}
                  color={seg.c}
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
