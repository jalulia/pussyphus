# PUSSYPHUS

**An absurd flow-state Sisyphean runner.**
*"An escalator for one."*

A seal point Cornish Rex named Bo navigates an infinite mall escalator, weaving between towering shoppers to achieve transcendence through flow state.

---

## Architecture

```
pussyphus/
├── index.html            ← Entry point (thin shell: DOM, styles, boot)
├── src/
│   ├── main.js           ← Game loop, state machine, orchestration
│   ├── constants.js      ← Shared constants (escalator dims, physics, tuning)
│   ├── input.js          ← Keyboard, mouse, touch, scroll — unified input state
│   ├── cat/
│   │   ├── cat.js        ← Cat entity: spring chain, skeleton, state
│   │   ├── catModel.js   ← Three.js meshes: tube geo, face, legs, ears, whiskers
│   │   ├── catAnim.js    ← Animation: walk cycles, flow states, ear tracking
│   │   └── catTail.js    ← Tail state machine: IDLE / MOVING / IMPACT
│   ├── world/
│   │   ├── escalator.js  ← Step pool, belt physics, incline math
│   │   ├── npcs.js       ← NPC spawning, types, behaviors, collision
│   │   └── environment.js← Kiosk chunks, walls, props, zone theming
│   ├── render/
│   │   ├── materials.js  ← All Three.js materials (cat, world, NPC palettes)
│   │   ├── scene.js      ← Scene setup, lights, fog, camera rig
│   │   └── dither.js     ← Dither shader, render targets, post-processing
│   ├── ui/
│   │   ├── hud.js        ← Flow bar, mood, altitude, zone label, status bar
│   │   ├── titleScreen.js← Title/start overlay
│   │   └── mallfm.js     ← Mall FM station identity (bumper, ident)
│   └── audio/
│       ├── mixer.js      ← AudioContext, master gain, crowd lowpass, reverb, foley bus
│       ├── music.js      ← Tone Transport, Rhodes+bass+pad, 8 phrases, voice leading
│       ├── crowd.js      ← Per-frame density + foley, flow-driven reverb + drone pitch
│       ├── shepard.js    ← Shepard-tone drone (infinite-ascent illusion)
│       └── fragments.generated.js  ← Procedural melodic one-shots (base64 WAV data URLs)
├── build.sh              ← Bundles back to single HTML for distribution
└── pussyphus_character_study.html  ← 2D reference (standalone)
```

## Module Dependency Graph

```
index.html
  └─ main.js
       ├─ constants.js         (imported by nearly everything)
       ├─ input.js             (no deps except constants)
       ├─ render/scene.js      (sets up THREE scene, camera, lights)
       ├─ render/materials.js  (all materials, depends on nothing)
       ├─ render/dither.js     (shader, render targets)
       ├─ world/escalator.js   (step pool, belt)
       ├─ world/environment.js (chunks, props)
       ├─ world/npcs.js        (NPC factory, update logic)
       ├─ cat/cat.js           (entity state)
       ├─ cat/catModel.js      (mesh construction, uses materials)
       ├─ cat/catAnim.js       (per-frame animation)
       ├─ cat/catTail.js       (tail state machine, drives spring-chain offsets)
       ├─ ui/hud.js            (DOM updates)
       ├─ ui/titleScreen.js    (start flow)
       ├─ ui/mallfm.js         (FM station identity)
       └─ audio/
            ├─ mixer.js        (AudioContext, routing graph, master)
            ├─ music.js        (Tone Transport progression engine)
            ├─ crowd.js        (reads npcs every frame, drives foley + filters)
            ├─ shepard.js      (continuous Shepard-tone bed)
            └─ fragments.generated.js (flow-threshold one-shots)
```

## Design Principles

1. **Each module exports a clear API** — `init()`, `update(dt)`, `reset()`
2. **No module reaches into another's internals** — communicate via the state object in main.js
3. **constants.js is the single source of truth** for all tuning values
4. **The cat/ modules don't know about Three.js scene** — they receive and return positions; catModel handles the GPU side
5. **build.sh inlines everything back to a single HTML** for distribution on itch.io / sharing

## Running Locally

```bash
# Any static file server works
npx serve .
# or
python3 -m http.server 8000
```

## Character: Bo

Seal point **Cornish Rex** (NOT Siamese). Based on the developer's real cat Bo, 19 years old, she/her. Arched back, enormous ears, whip-thin tail, wavy coat texture. Elderly but transcendent.
