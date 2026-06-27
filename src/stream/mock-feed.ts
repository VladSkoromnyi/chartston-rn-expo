/**
 * Deterministic mock/replay feed (PLAN §8.3) — the backbone of streaming tests
 * and lets the UI develop without a live network.
 *
 * TODO(stage-4): timed JSONL replay of `patch`/`append` ticks at adjustable speed.
 * For now it serves a seed history and reports an open connection.
 */

import type {
  Candle,
  FetchHistoryRequest,
  MarketFeedAdapter,
  SubscribeRequest,
} from '../types';

export class MockFeedAdapter implements MarketFeedAdapter {
  readonly name = 'mock';

  constructor(private readonly seed: Candle[] = []) {}

  async fetchHistory(_req: FetchHistoryRequest): Promise<Candle[]> {
    return this.seed.slice();
  }

  subscribe(req: SubscribeRequest): () => void {
    req.onStatus?.('open');
    // TODO(stage-4): emit replayed patch/append updates on a timer.
    return () => req.onStatus?.('closed');
  }
}
