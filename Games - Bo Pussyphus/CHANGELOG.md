# PUSSYPHUS — Changelog

All notable changes to this project. Newest first.

---

## v0.6 — Tail State Machine + Audio Follow-ups + Repo Cleanup (April 15–16, 2026)

**Tail (`src/cat/catTail.js`):** new sibling module owning a small state
machine on top of the existing spring chain in `cat.js`. Transitions
IDLE↔MOVING on `|smoothX| > threshold` with a 0.15s blend; IMPACT fires
additively on NPC hit and decays over 0.8s. IDLE: base dips, tip curls
upward, slow swish. MOVING: base perks up, quicker/lazier sway.
IMPACT: lateral impulse away from collider, exponential decay. Wired
into `main.js` per-frame update and on `npcResult.hit`. All tuning in
`constants.js`. Replaces the undifferentiated `sin(t*2.5)` wave.

**Ears (`src/cat/catModel.js`):** cone origin moved from geometric center
to base via `geo.translate(0, h/2, 0)` so `position` now sets the base
attachment. Lowered `earY` to sit on top of the head mask and reduced
default outward tilt. Ears now read as triangles rising from the head,
not wedges floating above it.

**Audio follow-ups:** added `src/audio/shepard.js` (Shepard-tone drone)
and `src/ui/mallfm.js` (Mall FM station identity), both missed in the
prior audio commit. Fixed Rhodes mono→poly voice handling and clamped
humanize jitter to prevent a Tone scheduler exception.

**NPCs (`src/world/npcs.js`):** replaced `Object.assign` with
`position.set()` to preserve the Three.js `onChange` hook on
`Vector3.position` — silent matrix-update bug fixed.

**Pages:** root `index.html` now redirects to the prototype so
`jalulia.github.io/pussyphus/` lands on the playable build instead of
a file listing.

**Repo hygiene:** added `.gitignore` (`.DS_Store`, `*.zip`, `dist/`,
`.build_tmp.js`, `node_modules/`), untracked previously-committed
crud. Deleted duplicate `pussyphus_v2_monolithic_825L_DUPLICATE-OF-V1.html`
(byte-identical to v1) and the stale `pussyphus_modular.zip` snapshot.
Patched `build.sh` with a `trap` so `.build_tmp.js` is cleaned up even
on build failure.

**preflight.sh:** now tracks `catTail.js` and does a GDD-vs-CHANGELOG
version sanity check — warns when the two disagree.

**Docs:** GDD bumped 0.4 → 0.6. Section 12 file manifest rewritten to
reflect current structure (docs/, pussyphus-notes.md, full src/ breakdown).
Section 14 moves audio and tail state machine to BUILT; adds real-fragment
replacement to the Phase 2 list. CLAUDE.md Phase 2 line updated to remove
audio.

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
