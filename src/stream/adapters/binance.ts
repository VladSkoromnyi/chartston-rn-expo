/**
 * Binance reference adapter (PLAN §8, RESEARCH §13) — proves the {@link MarketFeedAdapter}
 * seam and gives the dev-test app real live data.
 *
 * - `fetchHistory` → REST `GET /api/v3/klines` (≤1000 bars).
 * - `subscribe`    → WS `<symbol>@kline_<interval>`, normalized to {@link CandleUpdate}.
 *   The WS is self-healing: reconnect with exponential backoff + jitter, and a
 *   staleness timer that forces a reconnect if no message arrives (covers dead
 *   sockets without depending on a specific server ping cadence — RESEARCH §13.3).
 *
 * Backfill↔live merge is handled by the consumer time-keying updates (a WS kline
 * whose open time matches the last history bar patches it; a newer one appends),
 * so this adapter just normalizes and emits.
 */

import type {
  Candle,
  FetchHistoryRequest,
  MarketFeedAdapter,
  SubscribeRequest,
} from '../../types';

const REST_BASE = 'https://api.binance.com';
const WS_BASE = 'wss://stream.binance.com:9443';

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
/** No message for this long ⇒ treat the socket as dead and reconnect. */
const STALENESS_MS = 30_000;

/** The `k` block of a Binance kline WS payload (RESEARCH §13.2). o/h/l/c/v are STRINGS. */
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

/** Pure mapping: Binance kline → canonical {@link Candle} (ms time, numeric OHLCV). */
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

export class BinanceFeedAdapter implements MarketFeedAdapter {
  readonly name = 'binance';

  async fetchHistory(req: FetchHistoryRequest): Promise<Candle[]> {
    const limit = Math.min(1000, req.limit ?? 500);
    let url =
      `${REST_BASE}/api/v3/klines?symbol=${encodeURIComponent(req.symbol.id)}` +
      `&interval=${encodeURIComponent(req.interval)}&limit=${limit}`;
    if (req.endTime) url += `&endTime=${req.endTime}`;

    const res = await fetch(url, { signal: req.signal });
    if (!res.ok) {
      throw new Error(`Binance klines HTTP ${res.status}`);
    }
    const rows = (await res.json()) as unknown[][];
    return rows.map((r) => ({
      time: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    }));
  }

  subscribe(req: SubscribeRequest): () => void {
    const stream = `${req.symbol.id.toLowerCase()}@kline_${req.interval}`;
    let ws: WebSocket | null = null;
    let disposed = false;
    let attempt = 0;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearStale = () => {
      if (staleTimer) {
        clearTimeout(staleTimer);
        staleTimer = null;
      }
    };
    const armStale = () => {
      clearStale();
      staleTimer = setTimeout(() => ws?.close(), STALENESS_MS);
    };

    const connect = () => {
      if (disposed) return;
      req.onStatus?.(attempt === 0 ? 'connecting' : 'reconnecting');
      ws = new WebSocket(`${WS_BASE}/ws/${stream}`);

      ws.onopen = () => {
        attempt = 0;
        req.onStatus?.('open');
        armStale();
      };
      ws.onmessage = (ev) => {
        armStale();
        try {
          const msg = JSON.parse(String(ev.data)) as { k?: BinanceKline };
          if (msg.k) {
            // Type is advisory — the consumer time-keys to decide patch vs append.
            req.onUpdate({
              type: 'patch',
              candle: normalizeBinanceKline(msg.k),
            });
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onerror = () => {
        req.onStatus?.('error');
      };
      ws.onclose = () => {
        clearStale();
        if (disposed) {
          req.onStatus?.('closed');
          return;
        }
        attempt += 1;
        const backoff = Math.min(
          MAX_BACKOFF_MS,
          BASE_BACKOFF_MS * 2 ** (attempt - 1)
        );
        const delay = backoff + Math.random() * 1_000;
        req.onStatus?.('reconnecting');
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearStale();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }
}
