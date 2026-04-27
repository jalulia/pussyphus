# Foley Integration Design — 2026-04-27

Extracts the three novel sounds from the Phase 1 standalone audio module (step clatter, paw steps, fluorescent hum) and integrates them into the existing mixer architecture as `src/audio/foley.js`.

## What's new vs. what's duplicated

The Phase 1 module (`pussyphus_audio_phase1.js`) was written before the current Tone.js-based audio system existed. It creates its own AudioContext and runs standalone. The current system already has a drone (mixer.js, 55/58Hz detuned pair with flow-responsive freq shift) that supersedes the Phase 1 motor drone. The three sounds worth keeping are:

- **Step clatter** — noise burst → bandpass @ 3kHz → gain envelope. Scheduled rhythmically against the Web Audio clock at `beltSpeed / stepLength` rate. Jitter decreases with flow (sloppy → precise).
- **Paw steps** — lighter, higher, shorter noise burst (1.5kHz, 8ms vs 20ms). Volume scales 70%→100% with flow (careful placement → confident strides).
- **Fluorescent hum** — 60Hz + 120Hz + 180Hz harmonics. Always on. The mall's electrical constant.

## Architecture

New module: `src/audio/foley.js`
- Receives `foleyBus` and `masterBus` refs from mixer at init time
- Transients (clatter, paw steps) → foleyBus (bypasses crowd filter, correct for diegetic foreground)
- Fluorescent hum → masterBus (persistent ambient, same routing as drone)
- Uses shared Tone.js AudioContext via `Tone.getContext().rawContext`
- Constants in `constants.js` under `CLATTER_*`, `PAW_*`, `FLUOR_*` prefixes
- Exports `init()`, `update(dt, flow, beltSpeed)`, `triggerPawStep(flow)`, `reset()`

## Integration points (main.js)

1. `foley.init(mixer.getFoleyBus(), mixer.getMasterBus())` — in `unlockAndStart()`, after mixer/music init
2. `foley.update(dt, flow / K.FLOW_MAX, beltSpeed)` — in game loop, after `crowd.update()`
3. `foley.triggerPawStep(flow / K.FLOW_MAX)` — from walk cycle zero-crossing in catAnim.js

## Paw step trigger location

The walk animation in catAnim.js drives legs via `w = Math.sin(wt)`. Fire paw step at zero-crossings of `w` (when paw contacts the step surface). Track previous `w` sign to detect crossings without firing every frame.

## Syncopation decision

Paw steps and clatter remain independent (no quantization to shared grid). At high flow both rhythms have near-zero jitter, so they naturally drift in and out of phase — more interesting than a hard lock and doesn't couple walk animation to audio clock.

## Folder cleanup

- Move to `prototypes/archive/`: `pussyphus_audio_phase1.js`, `INTEGRATION.md`, `pussyphus_audio_test.html`
- Delete: `pussyphus-notes copy.md` (duplicate)

## MallFM integration

Add CLATTER, PAW, and FLUOR gain sliders to the MallFM panel for live tuning. Foley module exposes bus gain setters that MallFM can call directly.
