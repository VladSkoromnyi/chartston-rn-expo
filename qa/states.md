# States

| ID | Preconditions | Steps | Expected | Sev |
|---|---|---|---|---|
| ST-01 | Slow network (Network Link Conditioner "3G") | Cold-start the demo app | Spinner + "Loading…" until history arrives; no empty axes flash | S2 |
| ST-02 | Airplane mode on | Cold-start | "Couldn't load BTC / USDT." + Retry; chip shows Error | S1 |
| ST-03 | ST-02 state | Airplane mode off, tap Retry | Chart loads and goes Live | S1 |
| ST-04 | Adapter returning `[]` (e.g. an unlisted symbol in a custom adapter) | Load it | "No data" overlay; no crash | S2 |
| ST-05 | Home | Watch the status chip through load → live | Connecting… (amber) → Live (green) | S3 |
