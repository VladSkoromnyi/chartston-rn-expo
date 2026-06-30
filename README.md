# Chartston

> GPU-accelerated, New-Architecture-first **candlestick charting** for React Native & Expo — Skia + Reanimated + Gesture Handler.

<!-- Badges (enable once published + CI is on the default branch) -->
<!-- [![npm](https://img.shields.io/npm/v/chartston.svg)](https://www.npmjs.com/package/chartston) -->
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Chartston draws interactive financial charts on the GPU and keeps everything that moves **off the JS thread** (Skia rendering + Reanimated worklet gestures). It targets the **New Architecture** (Expo SDK 56+ / RN 0.79+) and ships exchange-style candlesticks, overlays, oscillator panes, a long-press crosshair, live streaming, theming, and basic drawing tools.

> **Status: pre-release (`0.x`), active development.** The public API is close to stable but may still shift before `1.0`.

<!-- TODO(stage-9): demo GIF (pan/zoom + live ticks + crosshair) -->

## Features

- **Chart types** — candlestick, bar (OHLC), line, area, baseline.
- **Buttery navigation** — pan, pinch-to-zoom (focal-anchored), and flick momentum, driven by UI-thread worklets.
- **Crosshair & legend** — long-press snaps to the nearest bar with a synchronized OHLCV legend and a last-price tag.
- **Live streaming** — time-keyed `snapshot` / `append` / `patch` updates (active-bar tick vs. new bar), with no whole-series flicker.
- **Built-in studies** — SMA, EMA, WMA, Bollinger, RSI, MACD, ATR, Stochastic, VWAP.
  - Price-pane **overlays** (SMA / EMA / Bollinger / VWAP) + a faint **volume** histogram behind the candles.
  - **Oscillator sub-panes** (RSI, MACD) that share the x-axis.
- **Annotations** — `markers`, `priceLines`, and trend / horizontal **drawings** in data coordinates (they track pan & zoom).
- **Theming** — dark / light out of the box via a fully-typed `ChartTheme`.
- **Any data source** — implement a 2-method `MarketFeedAdapter`; a **Binance** reference adapter is included.
- **States** — loading / empty / error (with retry) + a live connection-status chip.
- **TypeScript-first** — strict types are a feature, not an afterthought.

## Requirements

Chartston is **New Architecture only**. Peer dependencies:

| Package | Version |
|---|---|
| `react` | `>= 19` |
| `react-native` | `>= 0.79` |
| `@shopify/react-native-skia` | `>= 2` |
| `react-native-reanimated` (+ `react-native-worklets`) | `>= 4` |
| `react-native-gesture-handler` | `>= 2.31` |
| `@gorhom/bottom-sheet` | `>= 5` *(optional — only for the bundled selector sheets)* |

## Installation

```sh
npx expo install chartston @shopify/react-native-skia react-native-reanimated react-native-worklets react-native-gesture-handler
# optional, for the selector sheets (PeriodSelector / SymbolSelector / IndicatorMenu / ChartTypeSelector):
npx expo install @gorhom/bottom-sheet
```

Then:

1. Add the Reanimated worklets Babel plugin **last** in `babel.config.js`:
   ```js
   module.exports = (api) => {
     api.cache(true);
     return { presets: ['babel-preset-expo'], plugins: ['react-native-worklets/plugin'] };
   };
   ```
2. Wrap your app in `GestureHandlerRootView` (and `BottomSheetModalProvider` if you use the selectors).

## Quick start

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Chart, BinanceFeedAdapter, type SymbolInfo } from 'chartston';

const feed = new BinanceFeedAdapter();
const symbol: SymbolInfo = {
  id: 'BTCUSDT', base: 'BTC', quote: 'USDT', exchange: 'binance',
  displayName: 'BTC / USDT', pricePrecision: 2, qtyPrecision: 5, type: 'spot',
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Chart symbol={symbol} interval="1m" adapter={feed} />
    </GestureHandlerRootView>
  );
}
```

## Bring your own data

The only thing a feed must do is implement `MarketFeedAdapter` — two methods:

```ts
import type { MarketFeedAdapter } from 'chartston';

class MyFeed implements MarketFeedAdapter {
  name = 'my-feed';

  async fetchHistory(req) {
    // return Candle[] (time in epoch ms, ascending)
  }

  subscribe(req) {
    // call req.onUpdate({ type: 'append' | 'patch', candle }) on each tick,
    // req.onStatus('open' | 'reconnecting' | ...) for the status chip,
    // and return an unsubscribe function.
    return () => {/* cleanup */};
  }
}
```

Time is canonical **epoch milliseconds (UTC)** everywhere; adapters convert at the edges.

## Studies, theming & annotations

```tsx
<Chart
  symbol={symbol}
  interval="1m"
  adapter={feed}
  theme={DARK_THEME}                 // or LIGHT_THEME, or your own ChartTheme
  chartType="candlestick"            // 'bar' | 'line' | 'area' | 'baseline'
  activeStudies={{ overlays: ['sma', 'ema', 'vwap', 'volume'], panes: ['rsi', 'macd'] }}
  priceLines={[{ price: 65000, title: 'target' }]}
  markers={[{ time: 1719600000000, shape: 'arrowUp', text: 'buy' }]}
  drawings={[{ kind: 'horizontal', price: 64000 }]}
  onCrosshairMove={(bar, index) => {/* … */}}
/>
```

Drop-in controls (require `@gorhom/bottom-sheet` + a `BottomSheetModalProvider`): `SymbolSelector`, `PeriodSelector`, `IndicatorMenu`, `ChartTypeSelector`, `ThemeSelector`.

## How it compares

| | Chartston | `react-native-livechart` | `kline`-style (WebView) |
|---|---|---|---|
| Renderer | Skia (native GPU) | SVG / RN views | HTML canvas in a WebView |
| New Architecture | ✅ first-class | partial | n/a |
| Gestures off JS thread | ✅ Reanimated worklets | ❌ | n/a |
| Live streaming contract | ✅ snapshot/append/patch | limited | varies |
| Built-in indicators | 9 | few | many (but in WebView) |
| Pluggable data adapter | ✅ | ❌ | ❌ |

*(Comparison is best-effort as of writing; see each project for current capabilities.)*

## Roadmap

Engine stages 0–8 are complete (render, gestures, crosshair, streaming, real Binance feed, switch UI, studies, theming + chart types + annotations + drawing tools). Currently hardening for the first npm release. Beyond v1: in-chart drawing toolbar, UI-thread geometry rebuild for 60fps @ 10k+ candles, more providers, replay export.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT © [Vlad Skoromnyi](https://github.com/VladSkoromnyi)
