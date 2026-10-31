# Indicators

Values are unit-tested against reference implementations (`src/core/__tests__`);
these cases check that what's drawn matches.

| ID | Preconditions | Steps | Expected | Sev |
|---|---|---|---|---|
| IND-01 | Home, all built-ins on | Compare SMA 20 / EMA 50 / Bollinger 20,2 / VWAP / RSI 14 / MACD 12 26 9 on a bar against a reference chart for the same symbol + interval | Values agree to the displayed precision (VWAP resets at 00:00 UTC) | S2 |
| IND-02 | Home | Look at the first bars after a fresh load (scroll to the start) | Each indicator starts only once defined (no line from 0 during warm-up) | S3 |
| IND-03 | Home | RSI pane | Fixed 0–100 axis with 70 / 30 guides and a dashed 50 | S3 |
| IND-04 | Home | MACD pane while panning | Axis is symmetric around 0; histogram green above / red below | S3 |
| IND-05 | Home, `Custom ✓` | Look for "MOM 10 (custom)" pane and the white HL2 overlay | Custom pane stacks below the built-ins with its own max/min labels; HL2 overlay draws on the price axis | S2 |
| IND-06 | Home | Toggle `Custom` off and on | Custom pane / overlay disappear and reappear; built-ins unaffected | S2 |
| IND-07 | Home, `Custom ✓` | Scroll back until older history loads | Custom study recomputes over the longer series without a gap or jump at the seam | S2 |
