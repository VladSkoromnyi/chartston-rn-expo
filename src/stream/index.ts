/**
 * `stream/` — provider-agnostic streaming (PLAN §8). The streaming behaviour
 * (backfill→live merge, reconnect with backoff+jitter, heartbeat/staleness,
 * resubscribe-on-switch, status surfacing) lives in the feed adapters + `<Chart/>`;
 * this barrel re-exports the built-in adapters. Implement `MarketFeedAdapter` to add
 * a provider.
 */

export * from './adapters/binance';
export * from './mock-feed';
