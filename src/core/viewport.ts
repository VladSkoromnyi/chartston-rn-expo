/**
 * Viewport helpers (PLAN §5.4). Pure & Node-testable.
 */

import type { Viewport } from '../types';

const DEFAULT_BAR_SPACING = 8;

/**
 * Initial viewport that shows the most recent candles which fit `plotWidth`,
 * pinned to the live edge.
 */
export function initialViewport(
  candleCount: number,
  plotWidth: number,
  barSpacing = DEFAULT_BAR_SPACING
): Viewport {
  const visible = Math.max(1, Math.floor(plotWidth / barSpacing));
  const offset = Math.max(0, candleCount - visible);
  return {
    offset,
    barSpacing,
    rightPadding: 0,
    pinnedToNow: true,
    logScale: false,
  };
}

/** Inclusive [start, end] candle index range visible for a viewport over `plotWidth`. */
export function visibleRange(
  viewport: Viewport,
  plotWidth: number,
  candleCount: number
): { start: number; end: number } {
  const visible = plotWidth / viewport.barSpacing;
  const start = Math.max(0, Math.floor(viewport.offset));
  const end = Math.min(candleCount - 1, Math.ceil(viewport.offset + visible));
  return { start, end };
}
