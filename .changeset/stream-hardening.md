---
'chartston': minor
---

Streaming robustness (M4):

- Reconnect gap fill: after the feed reports a drop (`reconnecting` / `error` / `closed`), the next `open` re-fetches the latest page and merges it by time — bars missed while down are inserted even when live bars already landed past the gap, and closed bars get their final REST values. If the outage outlasted a page, the data is replaced and the view re-fits. Works with any `MarketFeedAdapter` that reports status.
- Live updates are coalesced: a frame's worth of ticks is applied in one pass (≤ one re-render per animation frame), with the same time-keyed patch/append/drop contract.
- New pure core helpers `applyUpdates` and `mergeRecent`, covered by a Binance-format replay fixture.
