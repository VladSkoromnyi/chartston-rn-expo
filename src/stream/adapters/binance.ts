/**
 * Binance reference adapter (PLAN §8, RESEARCH §13) — proves the {@link MarketFeedAdapter}
 * seam and makes the dev-test app live out of the box.
 *
 * The pure normalization below is implemented now (and unit-testable); the
 * network plumbing (REST backfill, WS, reconnect/heartbeat) lands in Stage 5.
 */

import type {
  Candle,
  FetchHistoryRequest,
  MarketFeedAdapter,
  SubscribeRequest,
} from '../../types';

/** The `k` block of a Binance kline WS payload (RESEARCH §13.2). NOTE: o/h/l/c/v are STRINGS. */
export interface BinanceKline {
  t: number; // bar open time (ms)
  T: number; // bar close time (ms)
  s: string; // symbol
  i: string; // interval
  o: string; // open
  c: string; // close
  h: string; // high
  l: string; // low
  v: string; // base volume
  n: number; // number of trades
  x: boolean; // is this kline closed?
  q: string; // quote volume
}

/** Pure mapping: Binance kline -> canonical {@link Candle} (ms time, numeric OHLCV). */
export function normalizeBinanceKline(k: BinanceKline): Candle {
  return {
    time: k.t,
    open: +k.o,
    high: +k.h,
    low: +k.l,
    close: +k.c,
    volume: +k.v,
  };
}

/** A closed kline (`k.x === true`) finalizes the bar; the next `k.t` starts a new one. */
export function isKlineClosed(k: BinanceKline): boolean {
  return k.x;
}

export class BinanceFeedAdapter implements MarketFeedAdapter {
  readonly name = 'binance';

  async fetchHistory(_req: FetchHistoryRequest): Promise<Candle[]> {
    // TODO(stage-5): GET https://api.binance.com/api/v3/klines?symbol=&interval=&limit= (max 1000),
    // parse the array-of-arrays response -> Candle[]; honor `_req.signal` for cancellation.
    return [];
  }

  subscribe(_req: SubscribeRequest): () => void {
    // TODO(stage-5): open wss://stream.binance.com:9443/ws/<symbol>@kline_<interval>;
    // normalizeBinanceKline + (k.x ? finalize/append : patch); reconnect w/ backoff,
    // staleness timer, resubscribe on switch. Returns the unsubscribe fn.
    return () => {};
  }
}
