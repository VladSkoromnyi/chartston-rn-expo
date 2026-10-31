# Rendering

| ID | Preconditions | Steps | Expected | Sev |
|---|---|---|---|---|
| REN-01 | Home, Candles, 1m | Inspect several up and down candles with the crosshair | Body spans open↔close, wick spans high↔low; up = `upColor`, down = `downColor`; legend O/H/L/C matches the bar | S1 |
| REN-02 | Home, Candles | Find a doji (open = close), or zoom in on a flat bar | A ≥ 1 px body is visible | S3 |
| REN-03 | Home | Chart type → Bars, Line, Area, Baseline, back to Candles | Each type draws; Area fills under the line; Baseline is two-tone around the first visible close with a baseline rule; no leftover geometry from the previous type | S2 |
| REN-04 | Home | Look at the price and time axes while panning | Price labels are evenly spaced, don't overlap, and the one nearest the live tag is hidden; time labels are ≥ 64 px apart and don't jitter | S2 |
| REN-05 | Home | Pan so the latest price is off screen (above / below) | Live-price tag stays pinned inside the price pane at the top / bottom edge; the horizontal last-price line hides | S2 |
| REN-06 | Home | Theme → Light, then Dark | Every element recolours (background, grid, candles, panes, labels, tags, status chip); nothing keeps the old theme | S2 |
| REN-07 | Home, Log on, 4h | Compare price tick spacing with Log off | Log: gaps widen toward lower prices; linear: equal gaps. Candles, overlays, markers, crosshair price all follow the scale | S2 |
| REN-08 | Any | Rotate the device / resize split-view | Chart re-lays out to the new size; no stretched or clipped panes | S3 |
