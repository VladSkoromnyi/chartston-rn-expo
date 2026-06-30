# RESEARCH.md — Reference behavior catalog (the bar Chartston must clear)

> **Why this file exists.** Per `PLAN.md` §3 and Step 1, every type and UI decision in Chartston must
> trace back to how a mature chart actually behaves. This document catalogs the **behavioral spec**
> we are matching, drawn from TradingView **Lightweight Charts** (the minimal-correct engine contract),
> the **TradingView Advanced** app (the UX target), and the **Binance** market API (the canonical feed shape).
> Citations point at the exact source. Where a `PLAN.md` assumption turned out to be wrong, it is called
> out in §14 ("Deltas vs PLAN").

**Primary sources**
- Lightweight Charts docs: <https://tradingview.github.io/lightweight-charts/docs> (series-types, time-scale, price-scale, api)
- Binance Spot WebSocket streams: <https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams>
- Binance Spot REST market data (klines): <https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints>
- TradingView Advanced/Charting Library UX: public TradingView web app + Charting Library feature list.

---

## 1. Candlestick rendering rules

A candle is drawn from a single OHLC datum `{ time, open, high, low, close }` (Lightweight Charts datum shape).

| Part | Geometry | Notes |
|---|---|---|
| **Body** | rectangle spanning `open ↔ close` vertically, centered on the bar's x slot, width ≈ `barSpacing` minus a gap | Up bar when `close >= open`; down bar when `close < open`. A doji (`open == close`) renders as a thin horizontal line. |
| **Wick / shadow** | thin vertical line spanning `low ↔ high` through the body center x | Toggleable (`wickVisible`). |
| **Border** | optional 1px outline around the body | Toggleable (`borderVisible`). |

**Color model — up/down/border/wick are set *separately*** (this is why §7's theme must expose all of them):

| Option | Meaning | Typical default |
|---|---|---|
| `upColor` | body fill, up bar | `#26a69a` (teal-green) |
| `downColor` | body fill, down bar | `#ef5350` (red) |
| `borderVisible` | draw body border | `true` |
| `borderUpColor` / `borderDownColor` | border color per direction | falls back to up/down color |
| `wickVisible` | draw wick | `true` |
| `wickUpColor` / `wickDownColor` | wick color per direction | falls back to up/down color |

> Source: Lightweight Charts *series-types* (Candlestick) — body = open/close range, wicks = high/low,
> options are a mix of `SeriesOptionsCommon` + `CandlestickStyleOptions`. The teal/red hexes are the
> well-known library defaults; **verify exact fallback hexes against the installed `@types` once Skia
> renders, since the docs page does not enumerate every default.**

**Chartston implication:** `render/candles.ts` draws three primitives per visible bar (body rect, wick line,
optional border) and reads up/down/border/wick colors independently from `ChartTheme`. A doji needs a
minimum 1px body height so it doesn't vanish.

---

## 2. Volume / histogram rendering

Volume is a **Histogram series**: datum `{ time, value, color? }`. Columns grow from a `base` (default 0)
up to `value`; an optional **per-point `color`** overrides the series color — this is how each volume bar
is tinted by candle direction (green if `close >= open`, red otherwise). In TradingView the volume pane
is an overlay-with-own-scale or a separate sub-pane; Chartston models it as a **sub-pane** (§10).

> Source: Lightweight Charts *series-types* (Histogram) — `{ time, value, color }`, per-point color override.

---

## 3. Other series types (for completeness)

Bar (OHLC bars w/ open tick left, close tick right), Line, Area, Baseline (dual-color around a baseline
value). Chartston v1 only needs **Candlestick + Histogram + Line** (line for MA overlays / RSI / MACD lines),
but the renderer should be factored so adding Area/Baseline later is cheap.

---

## 4. Live-update semantics — THE engine contract

This is the single most important behavior to match. Lightweight Charts exposes two data methods:

- **`series.setData(data[])`** — replaces the *entire* dataset. Used for the initial history load and on
  every symbol/interval switch. One allocation.
- **`series.update(bar)`** — **time-keyed** single-bar update:
  - `bar.time === lastBar.time` → **mutate the last bar in place** (the active/forming candle ticking).
  - `bar.time  >  lastBar.time` → **append a new bar** (a new interval opened).
  - `bar.time  <  lastBar.time` → **rejected** (out-of-order updates are not allowed; must be monotonic).

> Source: Lightweight Charts *api* — "`update()` … updates the last bar if its timestamp matches, appends
> a new bar otherwise." Confirmed by WebFetch of the v5 API page.

**This is exactly the plan's `CandleUpdate` union:**

| Lightweight Charts | Chartston `CandleUpdate` | Binance trigger |
|---|---|---|
| `setData(history)` | `{ type:'snapshot', candles }` | REST backfill / symbol switch |
| `update(sameTime)` | `{ type:'patch', candle }` | kline tick with `k.x === false` |
| `update(newTime)` | `{ type:'append', candle }` | first tick of a new `k.t` (after prior `k.x === true`) |

**Hard rule (from plan §2.1 and confirmed here): never `setData()` on every tick.** A live tick mutates one
element + flags a dirty region; the whole series is only rebuilt on snapshot.

---

## 5. Time scale, viewport & scrolling

| Concept | Lightweight Charts | Chartston mapping (§7 `Viewport`) |
|---|---|---|
| px per bar | `barSpacing` (**default 6**) | `viewport.barSpacing` — pinch-zoom target |
| empty space at right edge | `rightOffset` (**default 0**, in *bars*) | `viewport.rightPadding` (we store px) |
| left-most visible position | logical index (fractional) | `viewport.offset` |
| jump to latest | `timeScale().scrollToRealTime()` | re-pin to now |
| fit everything | `timeScale().fitContent()` | initial fit after history load |
| observe range | `subscribeVisibleLogicalRangeChange()` | drives lazy backfill of older history |

**Logical range = fractional bar indices**: the integer part is a fully-visible bar, the fractional part is
partial visibility. This *validates the plan's coordinate model* `x = (index - offset) * barSpacing`:
`offset` is a fractional logical index, exactly like Lightweight Charts.

> Source: Lightweight Charts *time-scale* — `barSpacing` default 6, `rightOffset` default 0; logical range
> "integer part = fully visible bar, fractional part = partial visibility"; `fitContent()` fits all data.

**Pinned-to-now behavior (the important UX detail):** when the view is scrolled to the right edge, appending
a new bar **auto-advances** the viewport so "now" stays visible. When the user has scrolled back into
history, new bars **do not** move the view (you keep reading the past). Chartston models this with
`viewport.pinnedToNow`: an `append` advances `offset` only while `pinnedToNow === true`. (Lightweight Charts
calls the related option `shiftVisibleRangeOnNewBar` / handles this via `scrollToRealTime`.)

**Pan vs zoom:** panning changes the logical **offset**; pinch/scroll zoom changes **barSpacing** around a
focal x (the focal bar stays under the finger). Momentum after a pan flick decays offset velocity.

---

## 6. Price scale — autoscale, log, percent, coordinate conversion

- **Autoscale:** the visible price range is fit from the **min low / max high of the visible bars**, plus
  margins. Lightweight Charts uses `scaleMargins` (default ~`{ top: 0.1, bottom: 0.1 }` = 10% padding top
  and bottom). Chartston's `core/autoscale.ts` computes `[min, max]` over the visible index range and pads.
- **Scale modes** (`PriceScaleMode`): `Normal` (linear), `Logarithmic`, `Percentage`, `IndexedTo100`.
  v1 ships **Normal + Logarithmic** (plan §5.4); Percentage/IndexedTo100 are future.
- **Coordinate conversion is public and must be exact inverses:** `priceToCoordinate(price) → y` and
  `coordinateToPrice(y) → price`. Consumers need these for overlays, markers, and drawing tools, so
  Chartston exposes `priceToY` / `yToPrice` and `indexToX` / `xToIndex` (plan §5.4).

> Source: Lightweight Charts *api* / *price-scale* — modes `Normal | Logarithmic | Percentage | IndexedTo100`,
> `autoScale`, `invertScale`, `priceToCoordinate` / `coordinateToPrice`.

---

## 7. Crosshair & legend

- **Modes:** *Magnet* (snaps to the nearest bar / OHLC value) and *Normal* (free-floating). Mobile Chartston
  uses long-press to summon a **magnet crosshair that snaps to the nearest candle index** (plan §5.4).
- **Subscription:** `subscribeCrosshairMove(handler)` fires with `MouseEventParams` ≈
  `{ time, logical, point:{x,y}, seriesData: Map<series, datum>, hoveredSeries }`. Chartston surfaces this as
  `onCrosshairMove(bar: Candle | null, index: number)` (§7 `ChartProps`).
- **Legend (OHLCV):** a synchronized legend shows **O / H / L / C**, change & change%, and **volume** for the
  hovered bar; colored by up/down. When the crosshair is not active, the legend shows the **latest** bar.
- **Last-price line:** a horizontal line at the last `close` with a price tag pinned to the price axis,
  colored by the last bar's direction. (Lightweight Charts: price lines + `lastValueVisible` / `priceLineVisible`.)

---

## 8. Interval set (canonical, with milliseconds)

Per plan §6.2 / §7 `Interval`. `ms` is exact for fixed intervals; month is calendar-variable (handle in
interval math, not a constant).

| Interval | ms | | Interval | ms |
|---|---|---|---|---|
| `1s` | 1_000 | | `30m` | 1_800_000 |
| `5s` | 5_000 | | `1h` | 3_600_000 |
| `15s` | 15_000 | | `2h` | 7_200_000 |
| `30s` | 30_000 | | `4h` | 14_400_000 |
| `1m` | 60_000 | | `6h` | 21_600_000 |
| `3m` | 180_000 | | `12h` | 43_200_000 |
| `5m` | 300_000 | | `1d` | 86_400_000 |
| `15m` | 900_000 | | `3d` | 259_200_000 |
| | | | `1w` | 604_800_000 |
| | | | `1M` | **calendar** (≈30.44d; align to month boundary) |

`1M` (and to a lesser extent `1w`/`1d` across DST) must be computed with real calendar math, not a fixed ms
constant — bar boundaries align to UTC month/week starts.

---

## 9. Studies / indicators — list, formulas, defaults

All formulas operate over the candle buffer and are **incremental** where possible (compute the new value
from the previous state + the new bar, not by re-scanning the whole window every tick — plan §6.3).

### Overlays (drawn on the price pane)
| Study | Inputs (defaults) | Formula |
|---|---|---|
| **SMA** | `period=20`, `source=close` | mean of last `period` source values. |
| **EMA** | `period=20` | `k = 2/(period+1)`; `EMA_t = src_t·k + EMA_{t-1}·(1−k)`; seed `EMA = SMA(period)`. |
| **WMA** | `period=20` | weighted mean, weights `1..period` (most recent heaviest), `÷ period(period+1)/2`. |
| **Bollinger Bands** | `period=20`, `mult=2`, `source=close` | mid = `SMA(period)`; upper/lower = `mid ± mult·σ`, where `σ` = population std-dev of the last `period` closes. |
| **VWAP** | session reset (daily) | `Σ(typical·vol) / Σ(vol)` cumulative within the session; `typical = (high+low+close)/3`. Resets at session start. |

### Sub-panes (own scale, stacked below price)
| Study | Inputs (defaults) | Formula |
|---|---|---|
| **Volume** | — | histogram of `volume`, per-bar color by direction (`close>=open` → up color). |
| **RSI** | `period=14`, `source=close` | Wilder: `avgGain_t=(avgGain_{t-1}·(p−1)+gain_t)/p` (same for loss); `RS=avgGain/avgLoss`; `RSI=100−100/(1+RS)`. Bounds 0–100; guides at 30/70. |
| **MACD** | `fast=12`, `slow=26`, `signal=9` | `macd = EMA(fast) − EMA(slow)`; `signal = EMA(signal, macd)`; `hist = macd − signal` (histogram). |
| **Stochastic** | `%K=14`, `smoothK=1`, `%D=3` | `%K = 100·(close − lowestLow_n)/(highestHigh_n − lowestLow_n)`; `%D = SMA(%D, %K)`. Slow stoch smooths %K by `smoothK`. |
| **ATR** | `period=14` | `TR = max(high−low, |high−prevClose|, |low−prevClose|)`; `ATR` = Wilder smoothing of `TR`. |

> Sources: standard TradingView/Wilder definitions. RSI/ATR use **Wilder's smoothing** (not a plain SMA) —
> this is the most common correctness bug, so `core/indicators` tests must assert against Wilder fixtures (§ test plan).

**`StudyDescriptor` validation (plan §6.3):** each study = `{ id, kind:'overlay'|'pane', name, inputs, compute(candles, prev?), draw(ctx, state) }`.
The incremental `prev` state is what makes "recompute on every tick" cheap — RSI/EMA/ATR keep a running
accumulator; only the active bar's contribution is recomputed on a `patch`.

---

## 10. Indicator panes ("bottom-line charts")

- Price pane on top; **stacked sub-panes** below, each a mini-chart **sharing the x-axis/viewport** (same
  `offset`/`barSpacing`) but with its **own y-scale**.
- Panes are **resizable** (drag the divider) and **removable**.
- Every pane recomputes from incoming data on each tick, exactly like the price pane — same dirty-region /
  one-repaint-per-frame discipline.

---

## 11. Drawing tools inventory (TradingView) + v1.x subset

TradingView's left rail (for reference): trend line, ray, extended line, horizontal line, horizontal ray,
vertical line, parallel channel, pitchfork, **Fibonacci retracement/extension**, rectangle, ellipse,
triangle, path/brush, text/callout/note, price range, date range, long/short position, arrows, emoji/icons.

**Chartston v1.x subset (plan §D.1 Stage 8):** **trend line** + **horizontal line** only. Everything else is
v2. Drawing tools need the public `priceToY`/`yToPrice` + `indexToX`/`xToIndex` (they anchor to price+time,
not pixels, so they survive pan/zoom).

---

## 12. Symbol / interval switch flow (must feel instant)

Observed TradingView behavior + plan §5.3, as an ordered sequence:

1. **Bump a generation id** (`gen++`) so any in-flight response for the old symbol can be discarded.
2. **Cancel in-flight REST** history (`AbortController.abort()`).
3. **Unsubscribe** the current WS stream (call the adapter's returned unsubscribe fn) — no leaked sockets.
4. **Clear buffers** (ring buffer reset; keep allocation if same capacity).
5. **Fetch new history** (REST backfill) tagged with `gen`; if a response arrives with a stale `gen`, drop it.
6. **Resubscribe** the new WS stream.
7. **Re-fit viewport** (`fitContent`-equivalent) + autoscale; repaint once. No flash, no double bar.

---

## 13. Binance reference shapes (the canonical adapter)

### 13.1 REST backfill — `GET /api/v3/klines`
Params: `symbol`, `interval`, `limit` (**max 1000**, default 500), optional `startTime`/`endTime` (ms).
Returns an **array of arrays**, each:
```
[ openTime(ms), open, high, low, close, volume, closeTime(ms), quoteAssetVolume,
  numTrades, takerBuyBaseVol, takerBuyQuoteVol, ignore ]
```
→ map `[0]→time, [1]→open, [2]→high, [3]→low, [4]→close, [5]→volume`. **Prices/qty come back as strings —
parse to number at the adapter edge.**

### 13.2 WebSocket — `<symbol>@kline_<interval>` (e.g. `btcusdt@kline_1m`)
Payload:
```jsonc
{
  "e": "kline", "E": 123456789,  // event type, event time (ms)
  "s": "BTCUSDT",
  "k": {
    "t": 123400000,  // bar OPEN time (ms)   -> candle.time
    "T": 123459999,  // bar CLOSE time (ms)
    "s": "BTCUSDT", "i": "1m",
    "o": "0.0010",   // open    -> candle.open   (STRING)
    "c": "0.0020",   // close   -> candle.close  (STRING)
    "h": "0.0025",   // high    -> candle.high
    "l": "0.0015",   // low     -> candle.low
    "v": "1000",     // base volume -> candle.volume
    "n": 100,        // number of trades
    "x": false,      // IS THIS KLINE CLOSED? -> isClosed
    "q": "1.0000",   // quote volume
    "V": "500", "Q": "0.500"  // taker buy base/quote vol
  }
}
```
**Mapping logic (plan §8.1):** while `k.x === false` → emit `patch` (mutate active bar). When `k.x === true`
→ emit a final `patch` for the closed bar; the next message with a **new `k.t`** is the `append`.

### 13.3 Heartbeat & connection limits — **CORRECTION to PLAN (see §14)**
Binance Spot market streams (current docs):
- The server sends a **ping frame every ~20 seconds**; the client must reply with a **pong within ~1 minute**
  or be disconnected. (Browsers/RN auto-pong ping frames, but a custom WS engine must ensure it does.)
- A single connection is **valid for 24 hours**; expect a disconnect at the 24h mark → reconnect + re-backfill.
- Combined streams: `/stream?streams=a@kline_1m/b@kline_1m`; payloads wrapped as `{ stream, data }`.

> **Note:** Binance has published both "~20s ping" (market streams) and "3-minute ping" (user-data/other)
> figures across product lines and doc revisions. The engine should **not hard-code a number** — it should
> (a) auto-pong any server ping, and (b) run an independent **staleness timer** (no message in N seconds →
> treat as dead, reconnect). That makes the exact server cadence irrelevant. See §14.

---

## 14. Deltas vs PLAN.md (feedback to fold into TECH_PLAN)

1. **Expo SDK 55, not 56, from the scaffolder.** `create-react-native-library@0.63` templates the in-repo
   example on **Expo SDK 55 / RN 0.83.6**, below the plan's "SDK 56+/0.84+" floor. New Architecture is still
   default (since RN 0.76), so the *architecture* constraint holds, but the *version floor* doesn't for the
   bundled example. **Action:** `chartston-dev-test` is created with `create-expo-app@latest` (SDK 56 / RN 0.86)
   and is the real harness; align the example to SDK 56 as a Stage-0 cleanup (or drop the example and rely on
   dev-test for in-repo smoke tests).
2. **Binance ping cadence.** Plan §8.2 says "Binance pings every ~20s; pong promptly." The exact cadence
   varies by Binance product line and has changed across doc revisions. **Action:** don't hard-code it —
   auto-pong + staleness-timer (above). Documented so the QA "dead socket" case tests the timer, not a magic number.
3. **bob targets are ESM-only** (`module` + `typescript`, no `commonjs`). Fine for Metro/RN ≥0.79 package-exports,
   but note it in the packaging contract; if a non-RN consumer (Node tooling) ever imports `core/`, add a CJS target.
4. **`react-native-worklets` peer requests** `@babel/core` and `@react-native/metro-config`. The library install
   warns these aren't provided. Harmless for typecheck, but the **dev-test** (and example) babel/metro configs
   must satisfy them — fold into the linking section of TECH_PLAN.
5. **`noUncheckedIndexedAccess` is on.** Hot loops over `Float64Array` will see `number | undefined` on every
   index access. Plan for tight, lint-clean accessors in `core/` (e.g., length-checked loops, `arr[i]!` only
   where provably in-bounds) rather than disabling the flag.

---

## 15. Research → Chartston type/architecture mapping (cheat sheet)

| Research fact | Chartston artifact |
|---|---|
| OHLC datum `{time,open,high,low,close}` | `types/Candle` (time = epoch **ms**, UTC) |
| `setData` vs time-keyed `update` | `types/CandleUpdate` = `snapshot | append | patch` |
| logical (fractional) index + barSpacing | `types/Viewport { offset, barSpacing, rightPadding, pinnedToNow, logScale }` |
| `priceToCoordinate`/`coordinateToPrice` | `core/coords` `priceToY`/`yToPrice`, `indexToX`/`xToIndex` (public) |
| crosshair `MouseEventParams` | `ChartProps.onCrosshairMove(bar, index)` |
| histogram per-point color | volume sub-pane draw |
| Wilder smoothing (RSI/ATR) | `core/indicators/*` incremental state + fixtures |
| Binance kline `k.x` | adapter normalizes to `patch` (false) / `append` (new `t` after true) |
| switch flow w/ generation id | `stream/` engine `gen` guard + `AbortSignal` |

*End of RESEARCH.md.*
