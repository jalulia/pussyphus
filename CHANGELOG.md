# PUSSYPHUS — Changelog

All notable changes to this project. Newest first.

---

## v0.5 — Audio System (April 15, 2026)

**Three-module audio stack under `src/audio/`:**
- `mixer.js` — owns AudioContext, master gain, crowd lowpass, short-decay
  reverb, always-on escalator drone (two detuned sines at 55/58 Hz), and
  parallel foley bus. Single routing graph
  `[music] → [crowd lowpass] → [reverb + dry] → [master]`.
- `music.js` — FM Rhodes + MonoSynth bass + PolySynth pad, driven by a
  Tone.Transport progression engine at 92 BPM. Eight 4-bar phrases across
  city pop / bossa / cumbia / synth-pop families, stitched by common-tone
  voice leading so transitions never hard-cut. Humanized timing.
- `crowd.js` — per-frame reader of `npcs.npcs`. Computes density, macro
  crowd-filter cutoff, per-NPC proximity occlusion, flow-driven reverb wet
  and drone pitch. Synthesizes foley (sneakers, bag rustle, phone chirps,
  dress-shoe clicks) with panning and velocity from cat-relative position.

**Fragments:** `fragments.generated.js` ships six procedurally synthesized
melodic one-shots as base64 WAV data URLs. Triggered on flow integer
crossings ≥5 via `music.triggerRandomFragment()`. Real recordings can
replace the bank later without code changes.

**NPCs:** each tagged at spawn with `absorb` and `spread` acoustic profile
keyed by type. Shopping bags widen spread to 0.7.

**Debug:** append `?audioDebug=1` to the URL for a bottom-right overlay
reading density, occlusion, cutoff, Q, and reverb wet.

**Integration:** `main.js` initializes audio on title-screen click (browser
autoplay gate), calls `crowd.update(...)` every frame, and triggers
fragments on flow thresholds. `preflight.sh` now tracks the new modules.
`build.sh` externalizes Tone.js in the esbuild path and adds the audio
modules to the naive-concat fallback order.

**Tech:** Tone.js v14.8.49 via jsdelivr `+esm`, wired into the importmap
alongside Three.js r128.

---

## v0.4 — Folder Reorganization + Breed Correction (April 13, 2026)

**Structure**
- Established `prototypes/pussyphus_prototype/` as the canonical modular codebase
- Archived monolithic HTML prototypes to `prototypes/archive/`
- Consolidated Bo/ files from Projects folder into `prototypes/archive/bo-early/`
- Added CHANGELOG.md, CLAUDE.md, and preflight.sh

**Breed Correction**
- Applied Cornish Rex correction across GDD and character study (Siamese → seal point Cornish Rex)
- Archived files left as-is for historical provenance
- Modular source was already clean (no Siamese refs)

**GDD Updates**
- Version bumped 0.3 → 0.4
- File manifest rewritten to reflect modular canonical + archive split
- LLM context section updated for modular workflow
- Platform description updated (modular ES modules, build.sh)

---

## v0.3 — Vertical Slice (April 2026)

**Modular Refactor**
- Split monolithic 825-line HTML into ES module architecture
- Created `src/` with `cat/`, `world/`, `render/`, `ui/` module groups
- Added `build.sh` for bundling back to single HTML
- Created README.md with architecture docs and dependency graph

**What's playable**
- Infinite escalator treadmill with step recycling
- Kiosk canyon environment with randomized chunks
- Seal point kitten with spring-chain physics and tube body
- 3 NPC types (shopper, phone zombie, sales rep)
- Flow meter with visual shader response (Bayer dither, warm shift, bloom)
- Win95 UI shell, whisper messages, status bar
- Mouse + keyboard + touch controls

---

## v0.2 — Character Update (Early April 2026)

- Applied seal point coloring to 3D game (cream body, dark points, teal eyes)
- Face mask sphere for facial point pattern
- Tuned body radii to match character study proportions
- Raised tail with upward curve
- Ear proximity sensing (ears rotate toward nearest obstacle)
- NPC hair fix (random dark colors, not cat material)
- Static background fix (environment doesn't ride the belt)

---

## v0.1 — First Prototype (March–April 2026)

- Initial monolithic HTML prototype (~825 lines)
- Three.js r128, inline GLSL dither shader
- Basic escalator mechanics, NPC spawning, flow system
- 2D character study created (ballz+linez renderer, 371 lines)
- PF Magic research completed (breed files, design deep dive)

---

## Pre-v0.1 — Exploration

- `bo-early` prototype (631 lines) — earliest Bo cat experiment
- `pussyphus_ballz` CGPT prototype (748 lines) — ballz rendering exploration
