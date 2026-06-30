# chartston

## 0.2.0

### Minor Changes

- 41513ae: Initial public preview. GPU candlestick chart for React Native / Expo (New Architecture, Skia + Reanimated):

  - Chart types: candlestick, bar (OHLC), line, area, baseline.
  - Pan / pinch-to-zoom (focal-anchored) / flick momentum on UI-thread worklets.
  - Long-press crosshair with snap-to-bar, OHLCV legend, and last-price tag.
  - Live streaming via a pluggable `MarketFeedAdapter` (snapshot / append / patch); Binance reference adapter included.
  - Built-in studies (SMA, EMA, WMA, Bollinger, RSI, MACD, ATR, Stochastic, VWAP) as price-pane overlays + volume-behind-candles + RSI/MACD oscillator panes.
  - Declarative markers, price lines, and trend / horizontal drawings (data-coord, track pan & zoom).
  - Dark / light theming, chart-type / indicator / symbol / period selectors, and loading / empty / error / connection states.

- Lazy historical data — scrolling back toward the start now pages in older candles via the adapter's `endTime`, prepending them and keeping the viewport in place (seam-deduped). Plus: the live-price right-axis tag clamps inside the price pane instead of spilling past the edge when the latest price is outside the visible range.
