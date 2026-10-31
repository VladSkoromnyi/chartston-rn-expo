# Gestures

| ID | Preconditions | Steps | Expected | Sev |
|---|---|---|---|---|
| GES-01 | Home | Drag left / right | Content follows the finger 1:1; stops at the data start and ~¼ screen past the live edge | S1 |
| GES-02 | Home | Flick quickly | Momentum continues and decays; readout settles on a final offset | S2 |
| GES-03 | Home | Pinch in / out around a specific candle | Zoom anchors on that candle (it stays under the fingers); bar spacing clamps between 2 and 40 px | S1 |
| GES-04 | Home | Long-press, then drag | Crosshair appears after ~250 ms, snaps to bar centres, shows price + time tags; legend follows the hovered bar | S1 |
| GES-05 | Home | Long-press in the RSI / MACD pane | Vertical line spans all panes; no horizontal price line / tag outside the price pane | S3 |
| GES-06 | Home | Release the crosshair | Crosshair disappears; legend returns to the latest bar | S2 |
| GES-07 | Home, Mark tool | Long-press a bar, release | A ▲ buy marker + "mark" price line are placed on that bar (exercises `onCrosshairMove` bar → null) | S2 |
| GES-08 | Stress, 50k | Pan and pinch continuously for 10 s | Smooth; no visible hitches (see PERF-03) | S2 |
