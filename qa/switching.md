# Symbol / interval switching

| ID | Preconditions | Steps | Expected | Sev |
|---|---|---|---|---|
| SW-01 | Home | Tap 5m, then 1h, then 1m in quick succession | Ends on 1m data; no flashes of 5m / 1h bars after the last tap (stale responses discarded) | S1 |
| SW-02 | Home | Symbol selector → search "eth" → ETH/USDT | Sheet filters as you type; chart loads ETH, re-fits to the live edge; status chip goes Connecting → Live | S1 |
| SW-03 | Home | Switch symbol while the old one is mid-tick | No ETH ticks land on a BTC chart (or vice versa) | S1 |
| SW-04 | Home, annotations placed on BTC | Switch to ETH, then back to BTC | ETH shows no BTC annotations; BTC's come back (per-symbol persistence in the demo app) | S3 |
| SW-05 | Home | Indicators sheet → toggle RSI and MACD off, then on | Sub-panes disappear / reappear; price pane resizes; checkmarks match | S2 |
| SW-06 | Home | Open each sheet (symbol, indicators, chart type) and dismiss by swipe | Sheets open and close smoothly; chart still responds to gestures afterwards | S2 |
