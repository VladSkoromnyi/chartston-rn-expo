/**
 * <Chart/> — the public component (PLAN §5.1).
 *
 * STAGE 1 (static render): loads history from the adapter into a `CandleStore`,
 * autoscales the visible price band, and draws candles (body + wick, up/down/
 * border colors) plus grid + axis lines. Live streaming, gestures, crosshair and
 * axis text labels arrive in later stages.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Canvas, Line, Path, Rect, vec } from '@shopify/react-native-skia';
import type { CandleView, ChartProps } from '../types';
import { DARK_THEME } from '../theme';
import { CandleStore, autoScale, initialViewport, visibleRange } from '../core';
import { buildCandleGeometry } from '../render';

const PRICE_AXIS_WIDTH = 56;
const TIME_AXIS_HEIGHT = 24;
const GRID_ROWS = 5;

export function Chart(props: ChartProps): ReactElement {
  const { adapter, symbol, interval, theme: themeProp, style } = props;
  const theme = themeProp ?? DARK_THEME;

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

  const scene = useMemo(() => {
    if (plotWidth <= 0 || plotHeight <= 0 || !view || view.length === 0) {
      return null;
    }
    const viewport = initialViewport(view.length, plotWidth);
    const { start, end } = visibleRange(viewport, plotWidth, view.length);
    const range = autoScale(view, start, end);
    return buildCandleGeometry(view, viewport, range, {
      width: plotWidth,
      height: plotHeight,
    });
  }, [view, plotWidth, plotHeight]);

  const gridYs = Array.from(
    { length: GRID_ROWS - 1 },
    (_, i) => ((i + 1) * plotHeight) / GRID_ROWS
  );

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
          {gridYs.map((y, i) => (
            <Line
              key={`grid-${i}`}
              p1={vec(0, y)}
              p2={vec(plotWidth, y)}
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
          {scene && (
            <>
              <Path
                path={scene.upWicks}
                color={theme.wickUpColor}
                style="stroke"
                strokeWidth={1}
              />
              <Path
                path={scene.downWicks}
                color={theme.wickDownColor}
                style="stroke"
                strokeWidth={1}
              />
              <Path path={scene.upBodies} color={theme.upColor} />
              <Path path={scene.downBodies} color={theme.downColor} />
              {theme.borderVisible && (
                <>
                  <Path
                    path={scene.upBodies}
                    color={theme.borderUpColor}
                    style="stroke"
                    strokeWidth={1}
                  />
                  <Path
                    path={scene.downBodies}
                    color={theme.borderDownColor}
                    style="stroke"
                    strokeWidth={1}
                  />
                </>
              )}
            </>
          )}
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
