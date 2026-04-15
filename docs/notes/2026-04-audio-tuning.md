# Audio Tuning Log

Running log of constant changes made during play-testing. Every entry names
the constant, old → new, and the observation that motivated it.

## 2026-04-15 session 0 — baseline landing

Initial values from the design doc, committed as-is. No tuning yet — Julia
needs to play for a full 30 min with `?audioDebug=1` before the first
adjustment. Expected first adjustments, based on code review:

- `CROWD_FILTER_MIN` (800): may need to drop to 600 if music stays too
  present under sardine density.
- `FOLEY_MASTER_GAIN` (0.15): individual sneaker clicks may stand out on
  quiet belts; drop to 0.10 if any single event is noticeable.
- `MUSIC_MASTER_GAIN` (0.4): if music competes with foley after the crowd
  filter opens, reduce to 0.35.
- Phone chirp rate: currently gated by `Math.random() > 0.15` inside
  `triggerFoley` — may want to bring this out as a constant if tuning gets
  active.

Fragments are procedurally synthesized placeholders (see
`fragments.generated.js`). Swap to real recordings when available.
