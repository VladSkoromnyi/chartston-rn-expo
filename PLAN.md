# CHARTSTON — Implementation Plan & Claude Code Build Instructions

> **What this file is.** A complete brief for **Claude Code** to bootstrap, scaffold, and then *self-author a detailed technical plan* for **Chartston** — an open-source, GPU-accelerated, interactive candlestick charting **library** for React Native / Expo.
>
> **How Claude Code must use it.** Execute Part B (the bootstrap sequence) **in order**. The final bootstrap step is **not** to start coding — it is to produce `TECH_PLAN.md` (per Part C) and **stop for human confirmation**. No production feature code is written until the human approves `TECH_PLAN.md`.
>
> **Where to save this file.** `~/Documents/projects/chartston/PLAN.md` once the directory exists (see Step 3). Until then, keep it alongside the workspace.

---

## 0. Operating rules for Claude Code

1. **Do not skip the exploration step.** Study the reference (Part A, §3) before designing types or UI. Design decisions must trace back to how mature charts actually behave.
2. **Plan before code.** The deliverable of this bootstrap is `TECH_PLAN.md`, reviewed and approved by the human, *then* engineering begins.
3. **Library-first, app-second.** `chartston` is the product. `chartston-dev-test` is only a harness to see/feel the library while building it.
4. **New Architecture only.** Target Expo SDK 56+ (React Native 0.84+/0.85, React 19, Hermes V1). The legacy architecture is out of scope — recent versions of the core deps (Reanimated v4, Skia) require New Arch.
5. **Everything that moves runs off the JS thread.** Rendering and gestures live on the UI thread (Skia + Reanimated worklets). The JS thread stays free for data and React.
6. **Types are a feature.** A consumer should be able to wire Chartston to *any* exchange feed by implementing one small adapter interface. Model the canonical types now (§7), not later.
7. **Ask, then act, on anything irreversible** (publishing to npm, force-pushing, deleting). Confirm with the human first.

---

# PART A — WHAT WE ARE BUILDING

## 1. Strategic context (the "why")

Chartston is the **open-source lead layer** of a two-part strategy:

- **Layer 1 — Credibility + distribution (this repo).** A best-in-class OSS candlestick library is both a portfolio "business card" demonstrating deep RN/native/rendering skill, and a magnet for adoption.
- **Layer 2 — Monetizable product (later, separate repo).** A paid product (e.g. AI-assisted trade journaling / analytics, or a different vertical) is layered **on top of the same rendering engine**, so the engine work is never thrown away.

The market gap that justifies Layer 1: **there is no mature, GPU-accelerated, New-Architecture-ready, TradingView-grade interactive candlestick library for RN/Expo** with a full studies suite, drawing tools, multi-pane layout, and 60fps at scale. Web has this (TradingView Lightweight/Advanced Charts, SciChart.js). Native mobile has fragments. A few Skia-based entrants now exist (e.g. `react-native-livechart`, `react-native-kline-chart`, `react-native-kline-view`) — they prove the rendering approach is viable but remain partial. **Chartston's differentiation is completeness + a clean generic UI/type system + exchange-agnostic streaming + New-Arch-first polish.**

## 2. Product definition — what Chartston *is*

An installable RN/Expo **library module** that renders **progressive, interactive candlestick charts** with these non-negotiable fundamentals:

1. **Concurrent streaming + draw "on the fly."** Candles append and the *active (last) candle* mutates in real time from a live feed without re-allocating or re-rendering the whole series. (Mirror the lightweight-charts contract: `update()` mutates/extends the most recent bar; never `setData()` the whole array on every tick.)
2. **Fast full re-draw on symbol/parameter change.** Switching symbol or interval swaps the dataset and repaints cleanly with no flash, no leaked subscriptions, and a re-fit viewport — perceptually instant.
3. **60fps at scale.** Smooth pan / pinch-zoom / crosshair with 10,000+ candles via viewport clipping (draw only the visible range).
4. **A generic UI system** for chart controls (period selector, symbol selector, indicator menus) built on a reusable *list → bottom-sheet → onSelect* primitive (§6).
5. **"Bottom-line" studies** — sub-panes computed from incoming data exactly like TradingView (Volume, RSI, MACD, etc.), plus overlay studies (moving averages, Bollinger, VWAP).

**Out of scope for v1** (note them in `TECH_PLAN.md` as future): order entry / brokerage integration, backtesting engine, server component, account/auth. Chartston renders and interacts; it does not trade.

## 3. The reference bar — study TradingView first

Before writing any types or UI, Claude Code must catalog how TradingView behaves and write findings into `RESEARCH.md`. Two references:

- **Lightweight Charts** (open-source, canvas) — the *minimal correct contract* for a candlestick chart: `createChart()` → `addSeries(CandlestickSeries, opts)` → `series.setData(initial)` then `series.update(bar)` for live ticks; OHLC datum shape `{ time, open, high, low, close }`; histogram series for volume; crosshair subscription; price/coordinate conversion; price lines; series markers; `timeScale().scrollToRealTime()`. **This is the behavioral spec to match for the engine.**
- **TradingView Advanced / full app UI** — the *UX target*: top interval bar, symbol search, indicator picker, left drawing-tools rail, stacked indicator panes under the price pane, crosshair with synchronized OHLC legend, last-price line, autoscale + log scale, dark/light themes.

`RESEARCH.md` must enumerate, at minimum: candlestick rendering rules (body = open↔close, wick = high↔low, up/down/border/wick colors set separately, wick toggle), live-update semantics (mutate last bar vs append new bar), interval set, study list with formulas, drawing-tool list, crosshair/legend behavior, viewport/scale behavior, and the symbol/interval switching flow.

## 4. Technology decisions (locked for v1)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Expo SDK 56+** (RN 0.84+/0.85, React 19) | New Architecture only; Hermes V1; React Compiler on. |
| Rendering | **`@shopify/react-native-skia`** | GPU canvas; draw candles/wicks/grid/overlays directly. Requires RN ≥ 0.79, React ≥ 19. |
| Animation / threading | **`react-native-reanimated` v4** + **`react-native-worklets`** | Shared values, `useDerivedValue`, `useFrameCallback`. Worklets plugin **must be last** in `babel.config.js`. |
| Gestures | **`react-native-gesture-handler`** | Pan, pinch, long-press crosshair as UI-thread worklets. Wrap app in `GestureHandlerRootView`. |
| Bottom sheets | **`@gorhom/bottom-sheet`** (or Expo UI `BottomSheet`) | Backing for the generic list UI (§6). Expo UI now ships a drop-in `BottomSheet`. |
| Library scaffolding | **`create-react-native-library`** (react-native-builder-bob) | Builds the module; sets up `peerDependencies` + local linking (`link:`/`file:`). |
| Language | **TypeScript, strict** | Public types are the product surface (§7). |
| State (library-internal) | Minimal — Reanimated shared values for hot path; lightweight store (Zustand) only for cold UI state | Keep the library dependency-light; heavy state belongs to the consumer app. |

**Rendering architecture pattern (apply this):** the Skia `<Canvas>` is a *leaf* that only draws. RN views own layout/navigation. A `useFrameCallback` tick runs a pure function on the UI thread each frame, updating viewport/scale/active-bar from shared values; `useDerivedValue` path builders read those shared values so React re-renders stay near-zero. Use typed-array buffers (`useRectBuffer` / `useRSXformBuffer`) to avoid per-frame JS object allocation. Register an explicit `SkFont` for all axis/legend text (Skia has no implicit system font).

## 5. Architecture overview

### 5.1 Layers (inside `chartston`)
```
chartston/
  core/        # framework-agnostic math & data: candle store (ring buffer / typed arrays),
               # coordinate transforms (index<->x, price<->y), viewport, autoscale, interval math,
               # indicator calculators (incremental), formatting/precision.  NO React, NO Skia.
  render/      # Skia drawing: candles, wicks, grid, axes, crosshair, overlays, pane stacking.
               # Pure draw functions fed by core outputs via shared values.
  gestures/    # Reanimated + GH worklets: pan, pinch-zoom, long-press crosshair, momentum.
  stream/      # WebSocket engine + feed adapters (provider-agnostic). REST backfill + live merge.
  ui/          # Generic controls: PeriodSelector, SymbolSelector, IndicatorMenu, and the
               # SelectList -> BottomSheet -> onSelect primitive.
  react/       # <Chart/> component + hooks (useChart, useCandleStream, useIndicator) wiring it together.
  types/       # Public type/interface surface (single source of truth, §7).
```
**Rule:** `core/` is testable in plain Node (no native deps) — this is where most automated tests live.

### 5.2 The data hot path
- Initial history: REST backfill → `setData`-equivalent (one allocation into the ring buffer).
- Live ticks: feed adapter emits `CandleUpdate`. If it targets the active bar → mutate last element + flag dirty; if it opens a new interval (`isClosed`/`x` boundary) → finalize last bar, append new bar, advance viewport if pinned to "now."
- Drawing reads from shared values; only the dirty region repaints. **Never** rebuild the whole series per tick.

### 5.3 Symbol/interval switch (must feel instant)
On change: cancel in-flight REST, unsubscribe current WS stream, clear buffers, fetch new history + resubscribe new stream, re-fit viewport/autoscale, repaint. Guard against races (stale responses for a previous symbol must be discarded — tag requests with a generation id).

### 5.4 Coordinates & scale
- `x = (index - offset) * barSpacing` (+ right margin for the live edge); pinch changes `barSpacing`, pan changes `offset`.
- `y` from visible-range min/max (autoscale) with optional **log scale**; price→y and y→price are inverses exposed publicly (consumers need them for overlays/markers).
- Crosshair snaps to nearest candle index and reports the OHLCV legend for that bar.

## 6. The generic UI system

The chart controls are not a pile of one-off components — they are **one reusable pattern** plus thin configs. This is an explicit requirement: any "list of options" surface (intervals, symbols, indicators, chart type, theme) is the *same* primitive.

### 6.1 The core primitive: `SelectList → BottomSheet → onSelect`
A trigger (button / chip / segmented control) opens a **bottom sheet** that renders a data list; tapping a row fires an `onSelect` callback and closes the sheet. It must be generic over the row type.

```ts
interface SelectOption<T = unknown> {
  id: string;
  label: string;
  value: T;
  sublabel?: string;     // e.g. full symbol name, study description
  icon?: ReactNode;
  group?: string;        // optional section grouping
  disabled?: boolean;
}

interface SelectListProps<T> {
  title?: string;
  options: SelectOption<T>[];
  selectedId?: string;
  searchable?: boolean;            // symbols list -> true
  onSelect: (option: SelectOption<T>) => void;   // <-- interactivity contract
  renderRow?: (o: SelectOption<T>) => ReactNode; // override for custom rows
  snapPoints?: (string | number)[];
}
```
Everything below is a *configuration* of this primitive.

### 6.2 Concrete controls built on the primitive
- **PeriodSelector** — interval set: `1s, 5s, 15s, 30s, 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d, 3d, 1w, 1M`. Common ones as inline chips; the full set in the sheet. `onSelect(interval)` triggers the symbol/interval switch (§5.3).
- **SymbolSelector** — searchable list of `SymbolInfo`. `onSelect(symbol)` triggers a switch. Sublabel = display name / exchange.
- **IndicatorMenu** — add/remove studies. Selecting an overlay study (MA/Bollinger/VWAP) adds it to the price pane; selecting a pane study (Volume/RSI/MACD/Stochastic/ATR) adds a sub-pane.
- **ChartTypeSelector**, **ThemeSelector** — same primitive.

### 6.3 Indicator panes ("bottom-line charts")
The price pane sits on top; **stacked sub-panes** render below it, each its own mini-chart sharing the x-axis/viewport and recomputing from incoming data on every tick (like TradingView). Panes are resizable/removable. Provide:
- **Overlays (on price pane):** SMA, EMA, WMA, Bollinger Bands, VWAP.
- **Sub-panes:** Volume (histogram, up/down colored), RSI, MACD (hist + signal), Stochastic, ATR.

Each study is described declaratively so the consumer can add their own:
```ts
interface StudyDescriptor {
  id: string;
  kind: 'overlay' | 'pane';
  name: string;                 // 'RSI', 'MACD'...
  inputs: Record<string, number | string>;  // periods, source ('close'|'hl2'|...)
  // pure, incremental calculator over the candle buffer:
  compute(candles: CandleView, prev?: StudyState): StudyState;
  draw(ctx: PaneDrawContext, state: StudyState): void;
}
```

## 7. Type & interface system (single source of truth)

Model these in `types/` before building. They are derived from how real exchanges and lightweight-charts shape data, so a consumer can adapt *any* feed.

```ts
// ---------- Time & price ----------
// Internal canonical time = epoch MILLISECONDS (UTC). Adapters convert (lightweight-charts
// uses seconds; Binance uses ms). Document the unit loudly and convert at the edges.
type Millis = number;

// ---------- Candle ----------
interface Candle {
  time: Millis;      // bar OPEN time (UTC, ms)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// A read-only, index-addressable view over the internal buffer (no per-access allocation).
interface CandleView {
  length: number;
  at(i: number): Candle;
  timeAt(i: number): Millis;
  // typed-array accessors for hot loops:
  closes: Float64Array; highs: Float64Array; lows: Float64Array;
  opens: Float64Array; volumes: Float64Array;
}

// ---------- Live updates ----------
type CandleUpdate =
  | { type: 'snapshot'; candles: Candle[] }   // full reset (history / symbol switch)
  | { type: 'append';   candle: Candle }      // a NEW interval opened
  | { type: 'patch';    candle: Candle };     // the ACTIVE bar mutated in place

// ---------- Intervals ----------
type Interval =
  | '1s' | '5s' | '15s' | '30s'
  | '1m' | '3m' | '5m' | '15m' | '30m'
  | '1h' | '2h' | '4h' | '6h' | '12h'
  | '1d' | '3d' | '1w' | '1M';

interface IntervalMeta { interval: Interval; ms: number; label: string; }

// ---------- Symbol ----------
interface SymbolInfo {
  id: string;             // 'BTCUSDT'
  base: string;           // 'BTC'
  quote: string;          // 'USDT'
  exchange?: string;      // 'binance'
  displayName?: string;   // 'BTC / USDT'
  pricePrecision: number; // decimals for price formatting
  qtyPrecision: number;   // decimals for volume/qty
  type?: 'spot' | 'perp' | 'futures' | 'stock' | 'forex';
}

// ---------- Feed adapter (THE extensibility seam) ----------
interface MarketFeedAdapter {
  name: string;
  // historical backfill (REST):
  fetchHistory(req: {
    symbol: SymbolInfo; interval: Interval; limit?: number;
    endTime?: Millis; signal?: AbortSignal;
  }): Promise<Candle[]>;
  // live stream (WS): returns an unsubscribe fn; emits CandleUpdate
  subscribe(req: {
    symbol: SymbolInfo; interval: Interval;
    onUpdate: (u: CandleUpdate) => void;
    onStatus?: (s: ConnectionStatus) => void;
  }): () => void;
}

type ConnectionStatus =
  | 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

// ---------- Viewport ----------
interface Viewport {
  offset: number;      // left-most visible candle index (fractional ok)
  barSpacing: number;  // px per candle (pinch zoom target)
  rightPadding: number;
  pinnedToNow: boolean;
  logScale: boolean;
}

// ---------- Public chart props ----------
interface ChartProps {
  symbol: SymbolInfo;
  interval: Interval;
  adapter: MarketFeedAdapter;
  studies?: StudyDescriptor[];
  theme?: ChartTheme;
  onCrosshairMove?: (bar: Candle | null, index: number) => void;
  onViewportChange?: (v: Viewport) => void;
}
```

**Adapter rule:** Chartston ships at least **one reference adapter (Binance)** to prove the seam and to make the dev-test app live out of the box. Everything else is "implement `MarketFeedAdapter`."

## 8. WebSocket engine (`stream/`)

A robust, provider-agnostic streaming layer. The **Binance kline stream is the canonical reference shape** — design the engine so other providers map onto it cleanly.

### 8.1 Canonical incoming shape (Binance kline, for reference)
Payload field map the adapter normalizes into `CandleUpdate`:
```
k.t  -> candle.time (bar open, ms)      k.o -> open    k.h -> high
k.l  -> low                              k.c -> close   k.v -> volume
k.x  -> isClosed  (true => finalize this bar; next message starts a new bar)
```
Mapping logic: while `k.x === false` → emit `{ type: 'patch', candle }` (mutate active bar). When `k.x === true` → emit a final `patch` for the closed bar, then the *next* differing `k.t` arrives as `{ type: 'append', candle }`.

### 8.2 Engine requirements
- **Backfill → live merge.** Fetch REST history first, open WS, then reconcile overlap (dedupe by `time`) so there's no gap/double bar at the seam.
- **Reconnect with exponential backoff + jitter**, capped; resume by re-backfilling any bars missed while disconnected.
- **Heartbeat / liveness.** Respect server ping/pong (Binance pings every ~20s; pong promptly or be dropped). Detect dead sockets via a staleness timer.
- **Resubscribe on switch.** On symbol/interval change, unsubscribe cleanly and resubscribe; never leak sockets.
- **Multiplexing (optional v1.1).** One connection, many streams where the provider allows.
- **Backpressure / coalescing.** High-frequency `patch` ticks are coalesced to at most one repaint per frame (the `useFrameCallback` tick consumes the latest).
- **Status surfaced** via `onStatus` so the UI can show a connection chip.

### 8.3 Dev test tool
Provide a tiny **mock/replay feed** (plays a recorded JSONL of klines at adjustable speed) so the engine and UI can be developed and tested deterministically without a live network. This doubles as the backbone of automated streaming tests.

---

# PART B — CLAUDE CODE BOOTSTRAP SEQUENCE (do these in order)

> Paths use `~/Documents/projects/` (macOS `/Documents/projects` → home dir). Adjust if the human's home differs.

## Step 1 — Explore the reference (TradingView)
Study lightweight-charts behavior and the full TradingView app UX (§3). **Output `RESEARCH.md`** in the workspace covering: candlestick rendering rules, live-update semantics (`patch` vs `append`), interval set, study list + formulas, drawing-tool inventory, crosshair/legend behavior, autoscale/log scale, and the symbol/interval switch flow. Every later type and UI decision must cite something here.

## Step 2 — Prepare the work environment
- Verify toolchain: Node ≥ 20.19.4, a JS package manager (pnpm or yarn 4 recommended for clean local linking), Watchman, Xcode 26 (iOS), Android SDK.
- Confirm target versions: **Expo SDK 56+ / RN 0.84+ / React 19 / New Architecture only**.
- Record exact resolved versions of: `@shopify/react-native-skia`, `react-native-reanimated` (v4), `react-native-worklets`, `react-native-gesture-handler`, `@gorhom/bottom-sheet`. Pin them; note RN/React peer requirements (Skia needs RN ≥ 0.79 / React ≥ 19).
- Decide local-linking method now (yarn `link:` / npm `file:` / pnpm workspace) and note the **Metro single-copy** requirement for `react`, `react-native`, `reanimated`, `skia` (dual copies will break worklets/hooks).
- **Do not** start the dev client yet — Skia is a native module, so the dev-test app will need a **custom development build** (not Expo Go).

## Step 3 — Create the library module
```bash
mkdir -p ~/Documents/projects
cd ~/Documents/projects
# Scaffold the library (New Architecture template; TS; a view+module as needed).
npx create-react-native-library@latest chartston
```
- This is `~/Documents/projects/chartston` — **the product**.
- Configure `react-native-builder-bob` build targets (commonjs/module/typescript) and set `peerDependencies` for `react`, `react-native`, `@shopify/react-native-skia`, `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler` (consumers provide them).
- Lay down the directory skeleton from §5.1 (`core/ render/ gestures/ stream/ ui/ react/ types/`).
- Add `babel.config.js` with `react-native-worklets/plugin` **LAST** in the plugins array.
- Strict TS, ESLint + Prettier, `LICENSE` = **MIT**.
- **Do not implement features yet** — only the skeleton, public type stubs (§7), and a placeholder `<Chart/>` that renders an empty Skia canvas + axes so the harness can mount it.

## Step 4 — Create the development/test harness (sibling)
```bash
cd ~/Documents/projects
npx create-expo-app@latest chartston-dev-test
cd chartston-dev-test
# Peer deps the linked library needs at runtime:
npx expo install @shopify/react-native-skia react-native-reanimated react-native-worklets react-native-gesture-handler @gorhom/bottom-sheet expo-dev-client
```
- This is `~/Documents/projects/chartston-dev-test` — a **basic Expo app that imports `chartston` as an external module** via local link, e.g. `"chartston": "link:../chartston"` (yarn) or `"file:../chartston"` (npm). Configure **Metro** `watchFolders` to include `../chartston` and force single copies of the shared peer deps.
- App shape: **one screen, bottom tab bar, and the entire screen is the chart area.** A second/third tab can host "Playground/Settings" later, but tab 1 = full-screen `<Chart/>`.
- Wrap the root in `GestureHandlerRootView`; add the worklets babel plugin (last); enable New Architecture.
- Build a **custom dev client** (`npx expo prebuild` → `npx expo run:ios` / `run:android`, or an EAS dev build) — Skia requires native compilation; Expo Go won't suffice.
- This harness is where the library is exercised continuously during development (hot reload against the linked source).

## Step 5 — Analyze, then author `TECH_PLAN.md` (and STOP)
With the skeleton + harness in place, analyze the current state and **produce `TECH_PLAN.md`** per **Part C**. This is the bootstrap deliverable. **Do not begin feature engineering.** End the run by presenting `TECH_PLAN.md` and explicitly requesting human review/approval.

## Step 6 — (after human approval) Engineer in Code mode
Only once the human approves `TECH_PLAN.md`, begin implementation stage-by-stage (§ roadmap), opening a branch per stage and keeping the harness green.

---

# PART C — REQUIRED CONTENTS OF `TECH_PLAN.md`

Claude Code authors this; the human approves it before any feature code. It must contain **all** of the following.

## C.1 Testing & QA strategy
1. **Manual test cases (QA-Engineer pass).** A `qa/` checklist of human-runnable cases with steps + expected results, grouped by feature: rendering correctness (body/wick/colors), live streaming (active-bar patch, new-bar append, no whole-series flicker), symbol/interval switch (instant, no leak, re-fit), pan/pinch/crosshair at 10k candles, indicators (values match a reference), reconnect behavior, theme switch, empty/error/loading states. Each case: ID, preconditions, steps, expected, severity.
2. **Automated code tests.** Unit tests for `core/` (interval math, coordinate transforms ↔ inverses, autoscale, indicator calculators vs known fixtures, ring-buffer append/patch, backfill↔live dedupe) — runnable in plain Node. Component/integration tests for `react/` (mount `<Chart/>`, feed the mock/replay stream, assert update semantics). Streaming tests driven by the **replay feed** (§8.3) for determinism. Define coverage targets for `core/`.
3. **UI variations to choose from.** For the key surfaces (period selector style, crosshair legend layout, indicator menu, bottom-sheet interaction), build **2–3 visual variants** in the harness Playground and present them as options for the human to pick before locking the design. List the variants and the decision criteria.
4. (Recommended) Performance harness: a stress screen that loads N candles and a fast replay feed; record FPS / dropped frames on a physical device; set a 60fps budget and a regression check.

## C.2 Logically separated development stages
A staged roadmap where **core functionality lands first, then features one at a time**, each stage independently demoable in the harness and shippable behind the green QA checklist. (See the suggested staging in the roadmap section; refine it.) Each stage must list: goal, deliverables, the new QA cases it adds, and its exit criteria.

## C.3 WebSocket engine plan
The concrete design of `stream/` per §8: adapter interface, Binance reference adapter, backfill↔live merge, reconnect/backoff, heartbeat, resubscribe-on-switch, coalescing to one repaint/frame, status surfacing, and the mock/replay tool. Include the failure/edge matrix (drop mid-bar, out-of-order, duplicate, gap on reconnect) and how each is handled.

## C.4 Types & interfaces (clear + generic)
Finalize the public type surface from §7, justified against how famous exchanges and TradingView shape data (cite `RESEARCH.md`). Deliver a documented `types/` module so a consumer can support any feed by implementing `MarketFeedAdapter` and (optionally) `StudyDescriptor`. Naming must be intuitive and self-documenting; the time-unit convention (ms, UTC) must be stated explicitly with adapter conversion examples.

## C.5 Production git-tree & repo infrastructure
The repository/release architecture (detail in the infra section): branching model, commit convention, CI gates, release/versioning, packaging via bob, docs, license, and contribution flow — i.e. how this stays a credible, maintainable OSS project.

---

# PART D — SUPPORTING DETAIL

## D.1 Suggested staged roadmap (Claude Code to refine in `TECH_PLAN.md`)

| Stage | Goal | Key deliverables | Exit criteria |
|---|---|---|---|
| **0 — Scaffold** | Skeleton + harness wired | §5.1 dirs, type stubs, empty `<Chart/>` mounting in full-screen tab | Harness builds on device; empty canvas + axes render |
| **1 — Static render** | Draw candles correctly | Candle/wick geometry, up/down/border/wick colors, grid, price & time axes, `SkFont` legend | A fixed 500-candle dataset renders pixel-correct vs reference |
| **2 — Viewport & gestures** | Navigate at scale | Pan (offset), pinch (barSpacing), momentum, viewport clipping, autoscale + log scale | 10k candles pan/zoom at 60fps on device |
| **3 — Crosshair & legend** | Inspect bars | Long-press crosshair snap-to-index, synchronized OHLCV legend, last-price line | Crosshair reports correct bar; `onCrosshairMove` fires |
| **4 — Streaming core** | Live "on the fly" | Ring buffer, `patch`/`append` semantics, mock/replay feed, one-repaint-per-frame coalescing | Replay feed mutates active bar + opens new bars with no whole-series flicker |
| **5 — WebSocket engine + Binance adapter** | Real live data | `stream/` per §8, backfill↔live merge, reconnect/heartbeat/resubscribe | BTCUSDT 1m live with backfill; survives forced disconnects |
| **6 — Symbol/interval switch UI** | The generic UI | `SelectList→BottomSheet→onSelect` primitive + PeriodSelector + SymbolSelector | Switching is instant, race-safe, leak-free |
| **7 — Studies** | Bottom-line + overlays | Volume + RSI + MACD panes; SMA/EMA/Bollinger/VWAP overlays; `StudyDescriptor` API; IndicatorMenu | Values match a reference; panes recompute live; add/remove works |
| **8 — Theming, polish, drawing tools (v1.x)** | Production feel | Dark/light themes, markers/price lines, optional basic drawing tools (trend line, horizontal line) | Visual variants chosen; theme switch clean |
| **9 — Release** | Ship OSS | Docs site/examples, README with live demo GIFs, npm publish via bob, semver tag | `npx`-installable; example app in repo; CI green |

Drawing tools beyond basics, multi-provider adapters, and replay-export tooling are explicitly v2 candidates.

## D.2 Production git-tree & OSS infrastructure

- **Branching:** trunk-based with short-lived `feat/stage-N-*` branches → PR → `main`. Tag releases on `main`.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `perf:`, `docs:`, `test:`, `chore:`) — drives changelog + semver.
- **Versioning/releases:** **Changesets** for semantic versioning + auto changelog. Library published via `react-native-builder-bob` build output.
- **CI (GitHub Actions):** on PR → typecheck (tsc), lint, unit tests (`core/`), build the library; block merge on red. Optional: build the harness for iOS/Android to catch native breakage.
- **Repo hygiene:** `README.md` (what/why, install, quick start, live demo GIF, feature matrix, attribution note for any TradingView-derived contract behavior), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue/PR templates, `LICENSE` (MIT), `CHANGELOG.md` (generated).
- **Docs:** a docs site (Docusaurus/Expo-style) with an interactive example and the full `types/` reference; this is also the credibility surface.
- **Packaging contract:** correct `peerDependencies`, `exports` map (ESM + types) compatible with Metro's package-exports resolution (default since RN 0.79), `sideEffects` set appropriately, no bundled copy of the peers.
- **Quality signals:** badges (npm version, CI, types), a `react-native-livechart`/`kline-*` honest comparison in the README to position the gap Chartston fills.

## D.3 Definition of Done — v1

Chartston v1 is "done" when, on a physical iOS and Android device, a consumer can: install via npm, drop `<Chart adapter={binance} symbol={btcusdt} interval="1m" />` into a screen, and get a TradingView-feeling chart that streams live, mutates the active candle smoothly, pans/zooms 10k+ candles at 60fps, shows a crosshair+OHLCV legend, switches symbol/interval instantly via bottom-sheet selectors, and renders Volume + RSI + MACD panes plus MA/Bollinger overlays — all green on the QA checklist and CI, documented, and published.

## D.4 Monetization note (carry forward, do not build in v1)

The OSS library is monetized **indirectly first**: credibility + adoption + distribution that feed the future paid Layer-2 product (e.g. AI trade journaling/analytics) built on the *same* engine. Direct paths to keep in mind (decide later, not in v1): a **Pro tier** (advanced studies, more drawing tools, multi-provider adapters, replay/export) under an open-core split; **sponsorship**; **paid support/consulting** off the OSS reputation; or a **hosted data/adapter service**. Keep the core genuinely useful and MIT so adoption isn't throttled; reserve premium surface for the Pro layer. Record the chosen split in `TECH_PLAN.md` as "future," but architect `core/` cleanly enough that a Pro layer can sit on top without a rewrite.

---

# PART E — CONFIRMATION GATE

1. Claude Code runs **Part B Steps 1–5** and produces: `RESEARCH.md`, the scaffolded `~/Documents/projects/chartston` skeleton, the `~/Documents/projects/chartston-dev-test` harness (full-screen chart tab, building on a custom dev client), and **`TECH_PLAN.md`** (satisfying all of Part C).
2. Claude Code **stops and requests human review** of `TECH_PLAN.md` — no feature engineering before approval.
3. The human (Vlad) reviews/edits the plan and approves.
4. **Then** engineering proceeds in Code mode, stage by stage (Part D.1), harness kept green throughout.

*End of plan.*
