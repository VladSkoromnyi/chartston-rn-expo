import type { SkCanvas } from '@shopify/react-native-skia';
import type { ChartTheme } from '../types';
import type { PaneGeometry } from './geometry';

export function drawCrosshair(
  _canvas: SkCanvas,
  _x: number,
  _y: number,
  _geom: PaneGeometry,
  _theme: ChartTheme
): void {
  // TODO(stage-3): snap-to-index crosshair lines + price/time axis labels.
}
