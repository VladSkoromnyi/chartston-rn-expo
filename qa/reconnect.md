# Reconnect

| ID | Preconditions | Steps | Expected | Sev |
|---|---|---|---|---|
| REC-01 | Home, 1s, at live edge | Note the readout offset, tap `Drop 8s`, wait ~12 s | Chip leaves `Live` during the drop, returns to `Live`; offset has grown by about the elapsed seconds (missed bars filled), view still `live` | S1 |
| REC-02 | Home, 1s | Tap `Drop 8s`, then look at the bars covering the outage with the crosshair | One bar per second, no gap and no duplicates at either seam | S1 |
| REC-03 | Device with network | Toggle airplane mode on for ~20 s, then off | Chip shows Reconnecting… / Offline, then Live; missed bars appear | S1 |
| REC-04 | Home, 1m | Leave the app in background 2+ minutes, return | Chart catches up (missed bars present) without a manual refresh | S2 |
| REC-05 | Home | Drop while panned back in history (not at live edge) | After the refill the bars you were looking at stay put | S3 |
