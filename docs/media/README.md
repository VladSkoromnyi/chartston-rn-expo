# Demo media

The README GIFs, recorded from the **Demo** tab of the `chartston-dev-test`
app. It runs `<Chart/>` on a deterministic synthetic feed (`src/demo-feed.ts` —
the symbol is `DEMO / USD`, not a market), and each scene button remounts the
chart:

| GIF | Scene | What to do while recording |
|---|---|---|
| `hero.gif` | hero | wait ~3 s, drag left, drag right, pinch out |
| `crosshair.gif` | crosshair | long-press and drag across the price pane, then into RSI |
| `studies.gif` | studies | nothing — adds a study every 0.9 s |
| `types.gif` | types | nothing — cycles chart types, dark then light |
| `history.gif` | history | pinch in, then flick right repeatedly |

## Recording

1. In the dev menu, turn off **Tools button** (the floating gear) so it doesn't
   cover the chart.
2. Open the Demo tab, start the recording, then tap the scene (for the timed
   scenes) or perform the gestures:

   ```sh
   xcrun simctl io booted recordVideo --codec=h264 --force scene.mov   # Ctrl-C to stop
   ```

3. Convert — crops the status bar and scene buttons (top) and the tab bar
   (bottom), 15 fps, 360 px wide, two-pass palette:

   ```sh
   scripts/make-gif.sh scene.mov docs/media/<name>.gif 325 285
   ```

   The crop values are pixel rows for an iPhone 17 simulator (1206 × 2622);
   adjust for other devices. If a clip starts on the previous scene, skip it
   with `START=<seconds>` (find the cut with
   `ffmpeg -i scene.mov -vf "select='gt(scene,0.04)',showinfo" -f null -`).
   Keep each GIF under 3 MB (`FPS=12` or `WIDTH=320` if needed).

`simctl` only writes a frame when the screen changes, so a clip ends at the
last visible change, not when you stop recording.

The GIFs aren't published to npm (`files` only ships `src/` and `lib/`); the
README links them through `raw.githubusercontent.com/…/main/…`, so they render
on npm and GitHub once they're on `main`.
