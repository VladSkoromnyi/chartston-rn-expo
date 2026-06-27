/**
 * `react/` hooks (PLAN §5.1) — wire `core` + `stream` + `render` together.
 * Stubbed now; bodies land in Stages 4–7.
 */

import type {
  ChartProps,
  ConnectionStatus,
  Interval,
  MarketFeedAdapter,
  StudyDescriptor,
  SymbolInfo,
} from '../types';

/** Top-level orchestrator used by <Chart/>. Owns viewport shared values + dirty ticks. */
export function useChart(_props: ChartProps): void {
  // TODO(stage-4)
}

/** Subscribes to a feed, drives the candle store, surfaces connection status. */
export function useCandleStream(
  _adapter: MarketFeedAdapter,
  _symbol: SymbolInfo,
  _interval: Interval
): { status: ConnectionStatus } {
  // TODO(stage-4/5)
  return { status: 'idle' };
}

/** Registers a study and recomputes it incrementally on each tick. */
export function useIndicator(_study: StudyDescriptor): void {
  // TODO(stage-7)
}
