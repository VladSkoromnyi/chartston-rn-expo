/**
 * Deterministic mock/replay feed (PLAN §8.3) — the backbone of streaming dev/tests
 * and lets the UI run without a live network.
 *
 * `subscribe` continues a random walk from the seed's last bar: it `patch`es the
 * active bar every `tickMs`, and `append`s a fresh bar when the interval rolls over.
 * A future variant replays a recorded JSONL of klines at adjustable speed.
 */

import type {
  Candle,
  FetchHistoryRequest,
  MarketFeedAdapter,
  SubscribeRequest,
} from '../types';

export interface MockFeedOptions {
  /** Bar duration in ms (default 60_000 = 1m). */
  intervalMs?: number;
  /** Emit a patch this often, in ms (default 450). */
  tickMs?: number;
  /** Per-tick price step as a fraction of price (default 0.0012). */
  volatility?: number;
}

export class MockFeedAdapter implements MarketFeedAdapter {
  readonly name = 'mock';

  constructor(
    private readonly seed: Candle[] = [],
    private readonly options: MockFeedOptions = {}
  ) {}

  async fetchHistory(_req: FetchHistoryRequest): Promise<Candle[]> {
    return this.seed.slice();
  }

  subscribe(req: SubscribeRequest): () => void {
    const intervalMs = this.options.intervalMs ?? 60_000;
    const tickMs = this.options.tickMs ?? 450;
    const vol = this.options.volatility ?? 0.0012;
    req.onStatus?.('open');

    const lastSeed = this.seed[this.seed.length - 1];
    let active: Candle = lastSeed
      ? { ...lastSeed }
      : {
          time: Date.now(),
          open: 30_000,
          high: 30_000,
          low: 30_000,
          close: 30_000,
          volume: 0,
        };

    let rng = 123_456_789;
    const rand = (): number => {
      // Park–Miller MINSTD LCG (stays within safe-integer range; deterministic).
      rng = (rng * 48_271) % 2_147_483_647;
      return rng / 2_147_483_647;
    };

    const timer = setInterval(() => {
      if (Date.now() >= active.time + intervalMs) {
        // The active bar's interval rolled over → open a new bar.
        active = {
          time: active.time + intervalMs,
          open: active.close,
          high: active.close,
          low: active.close,
          close: active.close,
          volume: 0,
        };
        req.onUpdate({ type: 'append', candle: { ...active } });
      } else {
        // Tick the active bar: random-walk the close, extend high/low, accrue volume.
        const step = (rand() - 0.5) * 2 * active.close * vol;
        active.close = Math.max(1, active.close + step);
        if (active.close > active.high) active.high = active.close;
        if (active.close < active.low) active.low = active.close;
        active.volume = (active.volume ?? 0) + rand() * 3;
        req.onUpdate({ type: 'patch', candle: { ...active } });
      }
    }, tickMs);

    return () => {
      clearInterval(timer);
      req.onStatus?.('closed');
    };
  }
}
