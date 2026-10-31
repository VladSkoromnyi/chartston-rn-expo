# Live streaming

| ID | Preconditions | Steps | Expected | Sev |
|---|---|---|---|---|
| LIVE-01 | Home, BTC/USDT 1m, chip `Live` | Watch the last candle for 10 s | Only the last bar changes (close / high / low / volume); the rest of the series doesn't flicker or shift | S1 |
| LIVE-02 | Home, 1s (`1s` button), at live edge (`· live` in readout) | Watch for 10 s | A new bar appears every second and the view advances with it; readout offset increases ~1/s and stays `live` | S1 |
| LIVE-03 | Home, 1s | Pan back ~50 bars, wait 10 s | View stays where you left it (not yanked to the edge); readout loses `live` | S2 |
| LIVE-04 | Home | Leave the crosshair resting on the last bar | Legend values update with the live ticks | S3 |
| LIVE-05 | Home, studies on | Watch indicators on the last bar for 10 s | SMA / EMA / Bollinger / VWAP / RSI / MACD / custom MOM update on the active bar only | S2 |
| LIVE-06 | Stress, 10k, Studies on | Watch for 30 s | Steady stream, no stalls longer than a frame or two (see PERF) | S2 |
