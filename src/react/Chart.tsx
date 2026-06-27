/**
 * <Chart/> — the public component (PLAN §5.1).
 *
 * STAGE 1 (static render): loads history from the adapter into a `CandleStore`,
 * autoscales the visible price band, and draws candles (body + wick, up/down/
 * border colors), grid, axis lines, and `SkFont` price/time axis labels. Live
 * streaming + gestures arrive in later stages.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import {
  Canvas,
  Line,
  Path,
  Rect,
  Text,
  matchFont,
  vec,
} from '@shopify/react-native-skia';
import type { CandleView, ChartProps } from '../types';
import { DARK_THEME } from '../theme';
import {
  CandleStore,
  autoScale,
  formatPrice,
  formatTimeLabel,
  indexToCenterX,
  initialViewport,
  niceTicks,
  priceToY,
  visibleRange,
} from '../core';
import { buildCandleGeometry } from '../render';

const PRICE_AXIS_WIDTH = 56;
const TIME_AXIS_HEIGHT = 24;
const PRICE_TICK_COUNT = 5;
const TIME_TICK_COUNT = 5;

const FONT_FAMILY = Platform.select({
  ios: 'Helvetica',
  default: 'sans-serif',
}) as string;

export function Chart(props: ChartProps): ReactElement {
  const { adapter, symbol, interval, theme: themeProp, style } = props;
  const theme = themeProp ?? DARK_THEME;

  const font = useMemo(
    () => matchFont({ fontFamily: FONT_FAMILY, fontSize: theme.fontSize }),
    [theme.fontSize]
  );

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [store] = useState(() => new CandleStore());
  const [view, setView] = useState<CandleView | null>(null);

  // Static history load (Stage 1). Stage 5 adds the live WS merge on top.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    adapter
      .fetchHistory({ symbol, interval, signal: controller.signal })
      .then((candles) => {
        if (cancelled) return;
        store.apply({ type: 'snapshot', candles });
        setView(store.view());
      })
      .catch(() => {
        // TODO(stage-5): surface load errors via connection status.
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [adapter, symbol, interval, store]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const { width, height } = size;
  const plotWidth = width - PRICE_AXIS_WIDTH;
  const plotHeight = height - TIME_AXIS_HEIGHT;

  const frame = useMemo(() => {
    if (plotWidth <= 0 || plotHeight <= 0 || !view || view.length === 0) {
      return null;
    }
    const viewport = initialViewport(view.length, plotWidth);
    const { start, end } = visibleRange(viewport, plotWidth, view.length);
    const range = autoScale(view, start, end);
    const geometry = buildCandleGeometry(view, viewport, range, {
      width: plotWidth,
      height: plotHeight,
    });
    const priceTicks = niceTicks(range.min, range.max, PRICE_TICK_COUNT).map(
      (value) => ({
        label: formatPrice(value, symbol.pricePrecision),
        y: priceToY(value, range, plotHeight, viewport.logScale),
      })
    );
    const timeTicks: { label: string; x: number }[] = [];
    const step = Math.max(1, Math.floor((end - start) / TIME_TICK_COUNT));
    for (let i = start; i <= end; i += step) {
      timeTicks.push({
        label: formatTimeLabel(view.timeAt(i)),
        x: indexToCenterX(i, viewport),
      });
    }
    return { geometry, priceTicks, timeTicks };
  }, [view, plotWidth, plotHeight, symbol.pricePrecision]);

  return (
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
            <>
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
              <Path path={frame.geometry.downBodies} color={theme.downColor} />
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
            </>
          )}

          {font &&
            frame?.priceTicks.map((t, i) => (
              <Text
                key={`plabel-${i}`}
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
                key={`tlabel-${i}`}
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
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
