# PUSSYPHUS — Audio System Design

**Date:** April 13, 2026
**Status:** Approved
**Approach:** Hybrid — Procedural Bed + Sampled Melodic Fragments + Crowd-as-Filter Acoustics

---

## 1. Design Summary

The audio system has two interlocking layers: a **procedural music engine** that generates an ever-shifting harmonic bed inspired by city pop, cumbia, and Madonna-era synth-pop; and a **crowd-as-filter acoustic system** where NPC density, proximity, and type dynamically shape how the music (and the world) sounds from Bo's perspective at ground level.

The crowd IS the filter. More bodies on the escalator = warmer, more muffled, more submerged music. Fewer bodies = bright, present, clear. Individual NPCs have acoustic profiles based on their clothing and behavior. Threading through a gap between shoppers produces a brief moment of acoustic clarity — a reward the player feels before they consciously notice it.

Flow state modulates everything: at high flow, proximity occlusion attenuates (Bo tunes the crowd out), reverb lengthens (the mall becomes a cathedral), and the music opens up harmonically. The visual dither system and the audio system are parallel expressions of the same game state.

---

## 2. Genre DNA

The music isn't generic mall muzak. It draws from three specific tributaries that share warmth, lush production, rhythmic ease, and earnest glamour:

**City pop** — Mariya Takeuchi, Tatsuro Yamashita, Anri. Major 7ths, minor 9ths, warm synth pads, melodic bass. The soundtrack of Japanese department stores in the 80s. Wistful, bright, slightly melancholic.

**Cumbia** — Gentle percussive sway, characteristic I-IV-V-IV vamp, ~92 BPM sweet spot. The rhythmic backbone.

**Madonna-era synth-pop** — 80s production sheen, gated reverb as punctuation, synth brass stabs, the earnest emotional directness.

The system slowly rotates through these palettes using shared harmonic vocabulary. No sharp genre boundaries — the mall plays a mood, not a genre.

### Historical Context

Muzak Corporation pivoted in 1987 from orchestral "elevator music" covers to licensing original artist recordings across ~100 satellite channels. By the mid-90s, malls were playing curated smooth jazz (Dave Koz, Najee, Bob James), Weather Channel-style programming, and adult contemporary. Vaporwave/mallsoft artists (Macintosh Plus, Hantasi, Cat System Corp) later revealed that this source material was always beautiful — just culturally invisible. Pussyphus's audio should capture that quality: music good enough to reward attention, presented in a context that makes it easy to let wash over you.

---

## 3. Module Architecture

```
src/audio/
├── mixer.js      ← AudioContext, master bus, filter chain, reverb
├── music.js      ← Tone.js synths, progression engine, fragment triggers
└── crowd.js      ← Per-frame NPC acoustic analysis, foley synthesis
```

All three follow the existing module pattern: `init()`, `update(dt)`, `reset()`.

### Web Audio Routing Graph

```
[music bus] → [crowd lowpass filter] → [reverb send] → [master gain] → destination
[foley bus]  → [foley gain]          →               → [master gain] → destination
[drone bus]  → [drone gain]          →               → [master gain] → destination
```

The crowd lowpass filter sits between the music and the output. Foley and drone bypass it — they're diegetic sounds from Bo's immediate environment, not filtered-through-bodies PA music.

### Integration with main.js

Two lines in the existing game loop, after NPC update:

```javascript
crowd.update(dt, npcs, catHeadX, state.flow);
music.update(dt, state.flow, state.altitude);
```

Audio modules read NPC state (already public via `npcs` export) and game state (already in main.js). No module reaches into another's internals.

### AudioContext Initialization

`mixer.init()` creates the AudioContext on title screen click (browser autoplay policy). The existing click-to-start handler calls `Tone.start()` alongside `mixer.init()`.

---

## 4. Music System — "Mall That Doesn't Exist"

### Procedural Voices (Tone.js)

**Voice 1: Electric Piano (Rhodes/FM)** — The harmonic anchor. Two-operator FM synth with moderate modulation index, short attack, medium release, through tremolo and gentle chorus. Plays chord voicings from a palette of progressions borrowing from city pop and bossa nova harmony: major 7ths, minor 9ths, dominant 7#11, occasional sus4 resolutions. Chords change every 2-4 beats with humanized timing (+/-30ms random offset per note). Voicings are generated procedurally from chord symbol + voicing rules (spread, register, doubled notes) — never repeat exactly. Velocity varies per note.

**Voice 2: Bass** — MonoSynth with filtered sawtooth + sub oscillator. Warm, round. Follows chord roots with passing tones. City pop bass is melodic — walks and syncopates. Pattern generator picks from root, 5th, octave, and chromatic approach tones, with rhythm templates varying between straight quarters (bossa feel) and syncopated 8th patterns (city pop/cumbia feel).

**Voice 3: Pad** — PolySynth with detuned oscillators and gentle LFO on filter. Slow attack, long release. Sustains the current chord. This is the "air" of the mall — always present, barely noticed. Provides harmonic continuity when the Rhodes rests between changes.

### Progression Engine

No single looping chord chart. The system holds a pool of 4-bar phrases drawn from the genre DNA:

- City pop: I-iii-IV-V, IVmaj7-iii7-vi7-V7
- Bossa nova: Imaj7-vi7-ii7-V7
- Cumbia: I-IV-V-IV vamp
- Synth-pop: I-vi-IV-V, I-V-vi-IV with suspended voicings

The engine picks the next phrase based on where the current one ends harmonically (common-tone voice leading, so transitions always sound smooth). Over a 10-minute session, the music drifts through all flavors without sharp genre boundaries.

**Tempo:** Constant ~92 BPM (cumbia sweet spot, also comfortable for bossa and city pop). Rhythmic emphasis shifts between patterns.

### Sampled Melodic Fragments

6-10 tiny clips, 1-3 seconds each, mono, compressed. Inlined as base64 in build. Melodic phrases that evoke the genre palette without being identifiable licensed material:

- Synth-sax lick
- Vibraphone shimmer
- Muted trumpet phrase
- Cumbia-style guiro scrape
- Gated reverb snare hit (single, used as punctuation at flow thresholds)
- City pop string swell

**Trigger conditions:** Flow threshold crossings, clean weaves through choke points, altitude milestones. Fragments play through the same crowd-occlusion filter as everything else — they sound like they're coming from somewhere in the mall, not from the game's UI.

---

## 5. Crowd-as-Filter System

### 5.1 Macro Filter (Density-Driven)

Every frame, `crowd.js` counts active NPCs on screen and computes a density value (0.0 = empty, 1.0 = sardine). This drives a master `BiquadFilterNode` lowpass on the music bus:

| Density | Cutoff | Q | Effect |
|---------|--------|---|--------|
| 0.0 (empty) | ~8000 Hz | 0.5 | Bright, clear, music is present and legible |
| 0.5 (moderate) | ~3500 Hz | 0.8 | Warm, slightly softened, comfortable |
| 1.0 (sardine) | ~800 Hz | 1.2 | Muffled, submerged, music is a ghost |

The filter moves slowly (lerped at ~2Hz response), so the acoustic space breathes rather than glitches. The rising Q at high density creates a subtle nasal coloring — the "heard through a wall" effect.

### 5.2 Proximity Occlusion (Per-NPC)

Each NPC within a proximity radius (~1.5 units of Bo) contributes an additional filter dip. Each NPC type has an acoustic profile:

| NPC Type | Clothing Concept | `absorb` | `spread` | Reasoning |
|----------|-----------------|----------|----------|-----------|
| Shopper (default) | Jeans, cotton shirt, sneakers | 0.5 | 0.4 | Medium-weight cotton, moderate absorption. Denim is dense woven fabric. |
| Shopper + bags | Same + shopping bags | 0.5 | 0.7 | Bags swing, creating wider and moving occlusion zone. Physical obstruction matters more than material absorption. |
| Phone zombie | Hoodie, sweatpants | 0.6 | 0.3 | Fleece and terry cloth trap air in pile, better sound absorbers. Compact stance, narrow shadow. |
| Sales rep | Polyester suit, dress shoes | 0.3 | 0.6 | Polyester is thin, smooth, poor absorber — sound passes through. But they lean into your lane, wide positional spread. |

Per-NPC contribution: `filterDip = absorb * (1.0 - distance / maxRadius)`

All nearby NPC dips are summed and applied as additional lowpass offset on top of the macro filter. Threading between shoppers with bags (high spread) feels acoustically different from passing a lone sales rep (low absorb, wide lean). The brief brightening in gaps between bodies IS the acoustic reward for good weaving.

### 5.3 Flow-State Modulation

**Proximity attenuation:** As flow increases, proximity occlusion effect attenuates — Bo is tuning out the crowd. At flow 15, proximity occlusion reduced to ~30% effectiveness. Macro density filter still operates (can't ignore physics), but per-NPC dips soften.

**Reverb expansion:** A `ConvolverNode` with a short, warm impulse response (synthesized — exponential decay with early reflections) goes from nearly dry at flow 0 to noticeably reverberant at flow 12+. The mall acoustically opens up, becomes cathedral-like.

**Harmonic opening:** At high flow, the progression engine favors more open voicings, sampled fragments trigger more frequently, pad volume increases slightly. The music floats.

---

## 6. NPC Foley — The Texture Layer

Tiny textural accents, synthesized via Tone.js (no samples needed), spatialized left/right based on NPC lane relative to Bo. Rhythmic loops tied to escalator belt speed. These should NOT be individually noticeable on first play — they create cumulative texture.

### Foley Signatures

**Shopper (default):** Sneaker-on-metal. Low, soft noise burst (filtered white noise, ~200Hz center, 40ms decay). Plays every step-cycle.

**Shopper + bags:** Same sneaker sound, plus bag rustle on the off-beat — pink noise through bandpass at ~3kHz, randomized amplitude envelope. Rustle pans slightly left-right following existing `swingPhase` animation. Paper bags: higher center frequency, sharper attack. Plastic bags: lower, smoother.

**Phone zombie:** Near-silent footfall. Periodic tiny phone notification ping — pure sine at ~1046Hz (C6), 80ms, very quiet, slightly randomized timing. Comes from their direction.

**Sales rep:** Dress shoe on metal — brighter, clickier (noise burst, ~1.5kHz center, sharper transient). Footfall rhythm slightly irregular (+/-15% timing jitter from lean/sway). Subtle fabric whisper on lean animation — very quiet broadband noise burst coinciding with rotation.

### Escalator Drone

Always present, always quiet. Two detuned sine waves at ~55Hz and ~58Hz (beat frequency ~3Hz = characteristic mechanical throb). At high belt speed (high flow), frequency rises slightly and amplitude increases — the escalator is working harder. This is the heartbeat of the game.

---

## 7. Constants (additions to constants.js)

```javascript
// Audio — crowd filter
CROWD_FILTER_MAX: 8000,        // Hz, cutoff when empty
CROWD_FILTER_MIN: 800,         // Hz, cutoff when sardine
CROWD_FILTER_SMOOTH: 2,        // lerp speed (Hz)
CROWD_FILTER_Q_MIN: 0.5,       // Q at empty
CROWD_FILTER_Q_MAX: 1.2,       // Q at sardine
CROWD_PROX_RADIUS: 1.5,        // units, per-NPC occlusion range

// Audio — flow modulation
FLOW_REVERB_MIN: 0.05,         // dry at low flow
FLOW_REVERB_MAX: 0.35,         // wet at high flow
FLOW_OCCLUSION_ATTEN: 0.7,     // proximity effect reduced by this at max flow

// Audio — music
MUSIC_BPM: 92,
MUSIC_MASTER_GAIN: 0.4,
MUSIC_CHORD_MIN_BEATS: 2,
MUSIC_CHORD_MAX_BEATS: 4,
MUSIC_HUMANIZE_MS: 30,         // +/- timing offset per note

// Audio — foley
FOLEY_MASTER_GAIN: 0.15,
FOLEY_PROX_RANGE: 1.2,         // units, foley audible range
FOLEY_PAN_SCALE: 0.8,          // stereo spread multiplier

// Audio — escalator drone
DRONE_FREQ_A: 55,              // Hz
DRONE_FREQ_B: 58,              // Hz
DRONE_GAIN: 0.08,
DRONE_FLOW_FREQ_SHIFT: 5,      // Hz added at max flow
```

---

## 8. Design Principles

1. **The crowd is the filter.** NPC density and type shape how music reaches Bo's ears. This is not a volume knob — it's timbral, spatial, physical.

2. **Acoustic clarity is the reward.** Threading through a gap brightens the music. The player feels this before they notice it. Same design as the ear-rotation threat system — subconscious first, conscious second.

3. **Foley is texture, not events.** No individual foley sound should be consciously noticeable on first play. The cumulative effect — the grain of the world — is what matters.

4. **Flow opens the world.** Low flow = cluttered, occluded, close. High flow = clear, reverberant, cathedral. Parallel to the visual system (dither smooths, colors warm).

5. **Constrained randomness.** The PF Magic principle applied to audio. Chord voicings, timing, fragment triggers, foley amplitudes — all vary within ranges, never exact repetition.

6. **The escalator does not stop.** The drone is always there. The music is always playing. There is no silence in the mall.

---

## 9. Implementation Phases

**Phase 1:** mixer.js + escalator drone + macro density filter. Get the filter-driven-by-NPCs loop working. Prove the concept with a simple oscillator standing in for music.

**Phase 2:** music.js — Rhodes voice + bass + pad. Progression engine with 3-4 phrase templates. Connect to mixer. Hear the music respond to crowd density.

**Phase 3:** crowd.js — Per-NPC proximity occlusion with acoustic profiles. Flow-state modulation of occlusion and reverb.

**Phase 4:** Foley layer — NPC-specific synthesized foley sounds. Spatial panning.

**Phase 5:** Sampled fragments — Source/create 6-10 tiny melodic clips. Trigger system. Base64 inlining in build.sh.

**Phase 6:** Tuning pass — Play extensively, adjust all constants, find the sweet spots.
