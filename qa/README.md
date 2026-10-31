# QA checklists

Manual, human-runnable checks for what unit tests can't see: pixels, gestures,
real network behaviour, device performance. Automated coverage lives in
`src/**/__tests__` (vitest, `core/`) and `src/react/__tests__` (jest, `<Chart/>`).

## How to run

All cases run in the **demo app** — `chartston-dev-test` (a sibling checkout),
which links this library by source:

```sh
cd ../chartston-dev-test && npx expo start --dev-client
```

- **Home** tab — live Binance chart with every control (symbol, period,
  indicators, chart type, theme, annotation tools, `Log`, `Custom`, `1s`,
  `Drop 8s`, viewport readout).
- **Stress** tab — 500 / 10k / 50k seeded candles on a 16 ms mock feed with
  UI/JS fps meters.

Expo's floating dev-tools gear overlaps the `1d`/`1w` chips and the `Light`
theme toggle — drag it aside first.

## Case format

Each file is one feature area. Every case has an **ID**, **preconditions**,
**steps**, **expected** result and a **severity**:

| Severity | Meaning |
|---|---|
| S1 | Blocks release — wrong data, crash, stuck UI |
| S2 | Visible defect in a main flow |
| S3 | Cosmetic / edge case |

## Release pass

Before a release, run every S1 + S2 case on **one physical iOS device and one
physical Android device** (release build), and record the result in the PR:

```
QA pass — <version> — <device / OS> — <date>
REN ✅  LIVE ✅  SW ✅  GES ✅  IND ✅  REC ✅  ST ✅  API ✅  PERF ✅ (10k: <fps>)
Failures: <IDs + notes>
```

| File | Area |
|---|---|
| [rendering.md](rendering.md) | Candles, chart types, axes, theme |
| [live-streaming.md](live-streaming.md) | Patch / append, live edge |
| [switching.md](switching.md) | Symbol / interval switch, selectors |
| [gestures.md](gestures.md) | Pan, pinch, momentum, crosshair |
| [indicators.md](indicators.md) | Built-in + custom studies |
| [reconnect.md](reconnect.md) | Drops, gap fill, status |
| [states.md](states.md) | Loading / empty / error / offline |
| [api.md](api.md) | Annotations, log scale, callbacks, lazy history |
| [performance.md](performance.md) | Stress screen budgets |
