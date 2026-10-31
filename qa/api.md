# Public API behaviours

| ID | Preconditions | Steps | Expected | Sev |
|---|---|---|---|---|
| API-01 | Home | Pan, zoom, wait for a live bar | Viewport readout (`onViewportChange`) tracks offset / bar spacing / `live` within ~100 ms and settles on the final value | S2 |
| API-02 | Home, cold start | Watch the readout | First value is the live edge (e.g. `off 457 · live` for 500 bars) — never `off 0` and no extra history page loaded on start | S1 |
| API-03 | Home | Scroll to the oldest bar | Older history pages in (offset jumps by the page size) and the view stays put; repeats until the feed runs out | S1 |
| API-04 | Home, H-Line tool | Long-press a bar, release; pan + zoom | Horizontal drawing at that price; tracks pan / zoom / log scale | S2 |
| API-05 | Home, Trend tool | Place two points (two long-presses) | Trend line between the two bars; tracks pan / zoom | S2 |
| API-06 | Home, annotations placed | Tap Clear | All annotations for the symbol are removed | S3 |
| API-07 | App code | Import selectors from `chartston` (root) | Fails to resolve — selectors live in `chartston/ui`; the root entry doesn't import `@gorhom/bottom-sheet` | S2 |
