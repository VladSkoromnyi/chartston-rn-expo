/**
 * `stream/` — provider-agnostic streaming (PLAN §8). The engine owns backfill->live
 * merge, reconnect (exponential backoff + jitter), heartbeat/staleness detection,
 * resubscribe-on-switch, coalescing to one repaint/frame, and status surfacing.
 * Implemented in Stage 5; the Binance + mock adapters are re-exported here.
 */

import type {
  CandleUpdate,
  Interval,
  MarketFeedAdapter,
  SymbolInfo,
} from '../types';

export * from './adapters/binance';
export * from './mock-feed';

export interface StreamEngineOptions {
  adapter: MarketFeedAdapter;
  onUpdate: (u: CandleUpdate) => void;
}

export class StreamEngine {
  constructor(_options: StreamEngineOptions) {
    // TODO(stage-5)
  }

  /** Symbol/interval switch (PLAN §5.3): gen++, cancel REST, unsub WS, clear, backfill, resubscribe, refit. */
  switchTo(_symbol: SymbolInfo, _interval: Interval): void {
    // TODO(stage-5)
  }

  dispose(): void {
    // TODO(stage-5)
  }
}
