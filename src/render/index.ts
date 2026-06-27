/**
 * `render/` — Skia draw functions (PLAN §5.1). Pure draws fed by `core` outputs
 * via shared values; the <Canvas> is a leaf that only draws.
 *
 * Bodies land per stage: grid/candles/axes (Stage 1), crosshair (Stage 3),
 * study panes (Stage 7). These signatures are the contract `render` must satisfy.
 */

import type { SkCanvas } from '@shopify/react-native-skia';
import type { CandleView, ChartTheme, PriceRange, Viewport } from '../types';

export interface PaneGeometry {
  width: number;
  height: number;
}

export function drawGrid(
  _canvas: SkCanvas,
  _geom: PaneGeometry,
  _theme: ChartTheme
): void {
  // TODO(stage-1): horizontal price gridlines + vertical time gridlines.
}

export function drawCandles(
  _canvas: SkCanvas,
  _view: CandleView,
  _viewport: Viewport,
  _range: PriceRange,
  _geom: PaneGeometry,
  _theme: ChartTheme
): void {
  // TODO(stage-1): per visible bar — body(open<->close), wick(low<->high), optional
  // border; up/down/border/wick colors read independently from theme (RESEARCH §1).
  // Viewport clipping: only draw indices in [offset, offset + width/barSpacing].
}

export function drawCrosshair(
  _canvas: SkCanvas,
  _x: number,
  _y: number,
  _geom: PaneGeometry,
  _theme: ChartTheme
): void {
  // TODO(stage-3): snap-to-index crosshair lines + price/time axis labels.
}
