---
'chartston': patch
---

- Fix: the loading / empty / error overlays used `StyleSheet.absoluteFillObject`, which no longer exists in React Native 0.85 — they're now positioned explicitly.
- `<Chart/>`'s root view has `testID="chartston-chart"` for consumers' tests.
