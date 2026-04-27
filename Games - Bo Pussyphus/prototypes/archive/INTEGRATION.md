# Phase 1 Audio — Integration Guide

Three hooks. No rewrites.

---

## Files

- `pussyphus_audio_phase1.js` — the audio module (IIFE, exposes `PussyphusAudio` global)
- `pussyphus_audio_test.html` — standalone test page (self-contained, use to tune constants)

---

## Option A: Inline into single HTML file

Paste the contents of `pussyphus_audio_phase1.js` into a `<script>` block in `pussyphus.html`,
before the main game script. The IIFE pattern means it won't collide with anything.

## Option B: Modular (src/ refactor)

Save as `src/audio/phase1.js`, export the module, import in your main entry point.

---

## Hook 1: Init (game start click)

Find the click handler that starts the game (the one that begins the game loop).
Add one line inside it:

```js
PussyphusAudio.init();
```

This creates the AudioContext (requires user gesture) and boots all persistent sounds
(motor drone, fluorescent hum). The escalator starts humming.

---

## Hook 2: Update (game loop)

In your main `animate()` / `update()` / `tick()` function, add:

```js
PussyphusAudio.update(dt, flow / K.FLOW_MAX, beltSpeed);
```

Where:
- `dt` = frame delta in seconds (you likely already have this)
- `flow / K.FLOW_MAX` = normalized flow 0–1 (the module expects 0–1, not 0–FLOW_MAX)
- `beltSpeed` = current belt speed in m/s (probably `K.BELT_BASE_SPEED` or the current effective speed)

This does two things per frame:
1. Ramps the motor drone lowpass cutoff to match flow (200Hz → 300Hz)
2. Schedules step clatter events at the correct rate with flow-dependent jitter

---

## Hook 3: Paw steps (walk cycle)

Find where Bo's walk animation cycles a step. Add:

```js
PussyphusAudio.triggerPawStep(flow / K.FLOW_MAX);
```

If Bo's walk cycle already has a "foot down" event or callback, put it there.
If it's frame-based (e.g., checking a step counter), fire this when the counter increments.

The paw step jitter and volume both respond to the flow value you pass in.

---

## Optional: Win95 UI volume control

Add a slider or button to the Win95 chrome that calls:

```js
PussyphusAudio.setVolume(0.0 to 1.0);  // slider
PussyphusAudio.toggleMute();             // button
```

---

## Constants to tune

All audio constants live in `PussyphusAudio.A`. Use the test page to find values
you like, then update the A object in the module. Key ones to play with:

| Constant | Default | What it does |
|---|---|---|
| `MOTOR_GAIN_A` | 0.08 | How loud the 55Hz fundamental is |
| `MOTOR_GAIN_B` | 0.07 | The 57Hz detuned osc (controls beat intensity) |
| `MOTOR_LPF_MIN` | 200 | Drone brightness at zero flow |
| `MOTOR_LPF_MAX` | 300 | Drone brightness at max flow |
| `CLATTER_GAIN` | 0.12 | Step clatter volume |
| `CLATTER_FILTER_FREQ` | 3000 | Center freq of the metallic clatter |
| `CLATTER_JITTER_MAX` | 0.15 | How sloppy the rhythm is at zero flow |
| `FLUOR_GAIN_60` | 0.015 | Fluorescent hum (subliminal — be careful) |
| `PAW_GAIN` | 0.10 | Bo's footstep volume |
| `PAW_FILTER_FREQ` | 1500 | Footstep tone (higher = clickier) |

---

## What this does NOT touch

- Dither shader
- Escalator mechanics / step recycling
- NPC spawning
- UI / Win95 chrome (except optional volume control)
- Flow calculation
- Cat physics / spring chain
- Collision detection

---

## Phase 2 prep

The module already has a `triggerCollision()` stub. When you're ready for Phase 2
(crowd murmur, collision thump, NPC shoes, muzak chord drone), the architecture
supports adding buses without restructuring. Each new layer gets its own bus → masterGain.
