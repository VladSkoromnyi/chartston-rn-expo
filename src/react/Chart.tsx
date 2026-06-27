/**
 * <Chart/> — the public component (PLAN §5.1).
 *
 * STAGE 0 PLACEHOLDER: renders an empty Skia canvas with a price (right) axis, a
 * time (bottom) axis, and faint gridlines, so the harness can mount it. It does
 * NOT yet subscribe to the feed or draw candles — that arrives in Stages 1–5,
 * wired through `useChart` + the `render`/`gestures` layers.
 */

import { useState } from 'react';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Canvas, Line, Rect, vec } from '@shopify/react-native-skia';
import type { ChartProps } from '../types';
import { DARK_THEME } from '../theme';

const PRICE_AXIS_WIDTH = 56;
const TIME_AXIS_HEIGHT = 24;
const GRID_ROWS = 5;

export function Chart(props: ChartProps): ReactElement {
  const theme = props.theme ?? DARK_THEME;
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const { width, height } = size;
  const plotWidth = width - PRICE_AXIS_WIDTH;
  const plotHeight = height - TIME_AXIS_HEIGHT;
  const gridYs = Array.from(
    { length: GRID_ROWS - 1 },
    (_, i) => ((i + 1) * plotHeight) / GRID_ROWS
  );

  return (
    <View style={[styles.fill, props.style]} onLayout={onLayout}>
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
          {/* price (right) axis */}
          <Line
            p1={vec(plotWidth, 0)}
            p2={vec(plotWidth, plotHeight)}
            color={theme.axisLineColor}
            strokeWidth={1}
          />
          {/* time (bottom) axis */}
          <Line
            p1={vec(0, plotHeight)}
            p2={vec(plotWidth, plotHeight)}
            color={theme.axisLineColor}
            strokeWidth={1}
          />
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
