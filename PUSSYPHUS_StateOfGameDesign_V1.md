# PUSSYPHUS — Game Design Document

**Version:** 0.6 (Audio System + Tail State Machine + Repo Cleanup)
**Date:** April 16, 2026
**Author:** Julia Compton
**Platform:** Browser (modular ES modules, Three.js r128, Tone.js 14.8.49, single-HTML build via `build.sh`)

---

## 1. CONCEPT

**One sentence:** A seal-pointe colored cornish rex kitten ascends an infinite mall escalator, threading between shoppers to achieve flow state.

**One paragraph:** Pussyphus is a browser-based zen escalator game. You are a small but fearless animal riding an endless escalator through the canyons of 90s malls. People crowd the steps — shoppers with bags, phone zombies, salespeople who lean into your lane. You weave between them using mouse or touch. Threading past obstacles without collision builds your flow meter; bumping into people drains it. There is no death. There is no winning. There is only the escalator, the cat, and the perpetual climb. Failure is loss of composure, not loss of life. The cat belongs to a better, stranger game than the mall it finds itself in.

**Elevator pitch:** Subway Surfers meets flow state. The Sims 1 meets Catz. An educational CD-ROM that forgot to include the education.

---

## 2. AESTHETIC REFERENCES

### Visual DNA
- **PF Magic Catz (1995–2000):** Primary character reference. Ballz+linez rendering architecture (overlapping spheres + tapered trapezoid connectors). Constrained randomness in animation. "User perception-based approach" — layered concurrent animation creates illusion of life. The cat is a desktop creature that wandered into a 3D mall.
- **The Sims 1 (2000):** Mall environment tone. Suburban palette. People as capsule abstractions. The slightly uncanny mundanity of simulated retail life.
- **Encarta 95 / Myst:** The feeling of navigating a space that was built for information delivery but accidentally became atmospheric. The dither as depth softener, not gimmick.
- **90s mall photography:** The specific warm fluorescent palette. Terrazzo floors, laminate kiosk surfaces, chrome accessory racks, ficus trees, neon signage in teal/pink/gold.

### Rendering Philosophy
Not set in stone yet, but:
The game renders at half resolution (240×280 on a 480×560 viewport) through a Bayer 4×4 ordered dither shader, then nearest-neighbor upscales. This is not a filter — it's the native visual language. The dither responds to flow state: at high flow, quantization levels increase (smoother), warm color shift intensifies, scanlines soften, and a pseudo-bloom bleeds highlights. At low flow, the image is crunchier, cooler, more textured.

### Color Mandates
- **Default to light, warm, or neutral grounds.** Never default to dark mode unless explicitly requested.
- Mall clear color: `#d0c8b8` (warm cream)
- Fog matches clear color for seamless depth fadeout
- Silver escalator hardware against warm environment creates the primary material contrast

---

## 3. THE CAT

### Identity
Bo. Breed personality per PF Magic data: high acrobaticness, high confidence, high liveliness, low playfulness. Translated: snooty, composed, unbothered, aloof. The cat does not panic. The cat weaves. When bumped, the cat is annoyed, not afraid. Infinitely curious and joyful.

### Coloring — Seal Point Pattern (Cornish Rex)
| Part | Hex | Description |
|------|-----|-------------|
| Body | `#d0c0a0` | Cream — warm tan, dominant surface |
| Belly | `#e0d4bc` | Lighter cream underbody |
| Points (ears, mask, paws, tail tip) | `#3a3030` | Dark seal — the seal point signature |
| Mid-dark (tail body, jaw) | `#585048` | Transition between cream and point |
| Eyes | `#70b8a0` | Teal — Cornish Rex blue-green |
| Pupils | `#101010` | Near-black |
| Nose | `#3a2828` | Dark nose leather |
| Inner ear | `#b89898` | Pink (visible in character study) |
| Whiskers | `#a09888` | Warm gray |

### 3D Construction (Current Prototype — `pusyphus.html`)
The cat uses a **continuous tube geometry** system with a 10-point body spine and separate tail tube. Each frame, the spine positions and radii are recalculated based on spring-chain physics (head → body → butt → tail).

**Body spine radii** (10 points, nose to butt):
```
[0.003, 0.022, 0.050, 0.042, 0.020, 0.032, 0.040, 0.038, 0.032, 0.018]
  nose  forehead  HEAD   back-head NECK  shoulder CHEST  belly   hip    butt
```

Key proportions from character study:
- **Head (0.050) is the dominant visual mass** — always the largest radius
- **Neck pinch (0.020)** — pronounced separation between head and body, about 40% of head radius
- **Chest (0.040)** — primary body mass, slightly smaller than head
- **Hips taper to butt (0.018)** — the back end is lighter, more agile

Additional 3D meshes:
- **Face mask:** Dark sphere (`cPoint` material, r=0.035) positioned on lower face each frame, creating the seal point facial pattern
- **Ears:** Cone geometry with `cEar` (dark point) outer, `cPointMid` inner
- **Eyes:** Sphere geometry, teal (`cEye`), with dark slit pupils
- **Paws:** Sphere geometry, dark (`cPoint`)
- **Tail tip:** Last 4 segments of tail tube use `cPoint` material

### 2D Character Study (Canonical Reference — `pussyphus_character_study.html`)
A separate 2D canvas artifact exists that implements the PF Magic ballz+linez rendering more faithfully:

**Rendering primitives:**
- `ball(x, y, r, color)` — filled circle (sphere)
- `linez(x1, y1, r1, x2, y2, r2, color)` — tapered trapezoid connecting two balls

**Skeleton (2D pixel units, profile view):**
- Chest: r=14 (primary body mass)
- Head: r=13 (dominant visual mass by position, similar size to chest)
- Shoulder hump: r=10
- Back: r=11
- Rump: r=9
- Hips: r=8
- Belly: r=8 (sag below spine)
- Neck: r=7 (pronounced pinch)

**Face (profile, one-eye view):**
- Far eye hidden by head mass
- Integrated mask/jaw/chin using overlapping dark balls
- Cornish Rex wedge shape achieved through jaw ball (r=7) + chin ball (r=3)
- Single large teal eye (r=4.5) with dark pupil (r=2.2)

**Tail:** 6-segment verlet chain with broken rhythm radii: [12, 9, 7, 5, 3, 2]. Raises upward from hips. Each segment has independent spring constant creating organic trailing motion. Thick root, fast quadratic taper.

**Animation states:** idle, walk, trot, flow — auto-detected from movement speed. Each state has distinct bob amplitude, sway, tail wag range, tail lift height, and leg cycle frequency.

### Animation Principles (from PF Magic Research)
1. **Head is always the largest visual mass** — enforced in both 2D and 3D
2. **Tail is emotional telemetry AND gameplay instrument** — wag amplitude and lift height reflect flow state, lateral offset counters turns
3. **Ears are primary proximity feedback** — rotate toward nearest NPC obstacle, flatten at high lateral speed ("aerodynamic cat"), perk forward at high flow
4. **Constrained randomness** — never repeat exact same animation. Ear flicks are random with timeout reset. Walk cycle speed links to movement velocity.
5. **Spring-chain physics** — head leads input, body follows with delay, butt follows body with more delay, tail follows butt with cascading delay per segment. This creates organic stretch and compression during lane changes.
6. **The cat belongs to a better, stranger game than the mall** — its animation vocabulary should always feel slightly too alive for the environment it inhabits

---

## 4. THE ESCALATOR

### Mechanical Model
The escalator is an **infinite looping treadmill**. Steps are a recycling pool (28 steps, 0.55 spacing, 0.32 incline per step). `beltPhase` tracks total distance scrolled. Steps scroll toward the camera (+Z direction) at belt speed, wrapping when they pass behind the camera.

**Critical rule: The background environment is STATIC.** Kiosks, walls, columns, ficus trees, ceiling lights — these are part of the building, not the escalator. Only the steps, glass panels, and handrails move. The cat is in perpetual climb. The mall stands still.

### Step Construction
Each step group contains: step surface (silver Phong material), front edge highlight, riser face, yellow safety strips on both sides, and 11 groove lines. Steps use `MeshPhongMaterial` with specular highlights to read as brushed metal.

### Escalator Constants
```javascript
SS = 0.55       // step spacing in Z
INCLINE = 0.32  // Y rise per step
POOL = 28       // visible step count
BELT = POOL*SS  // total belt loop length (15.4)
ESC_W = 2.2     // escalator width
```

### Y Function
`stepY(z) = -z * (INCLINE / SS)` — given a belt-local Z position, returns Y on the escalator surface. This creates the visible incline.

---

## 5. THE MALL — ZONE 01: KIOSK CANYON

### Environment Architecture
18 environment chunks recycle infinitely. Each chunk contains ceiling light, floor segments, wall planes, and randomized side decor on both flanks.

### Decor Types (per side, randomly selected per chunk)
- **Kiosk** (30%): Laminate counter + chrome top + hanging neon sign + optional accessory rack. These intrude into the walkable lane — the "canyon" feature.
- **Column + promo sign** (20%): Structural column with an attached teal/pink/gold promotional sign
- **Ficus tree** (15%): Terracotta pot with sphere-approximated foliage
- **Ad lightbox** (15%): Flat illuminated panel on wall
- **Bench** (20%): Simple seat — rest stop nobody uses

### Ground Clutter
Dropped shopping bags (random bag colors), trash bins (chrome). Cat-scale obstacles.

### Neon Signs
Neon materials flicker via per-frame opacity modulation: `opacity = 0.5 + sin(t*3 + position.z*2) * 0.3`. Three colors: teal (#48a8a0), pink (#c87090), gold (#c8a848).

---

## 6. NPCs — THE OBSTACLE POPULATION

### Scale Relationship
Humans tower over the kitten. Human total height ~1.1 units, cat total height ~0.12 units. Ratio ~9:1. Human shoes are ~8x a cat paw. This scale differential is central to the game feel — the cat navigates a forest of legs and bags.

### NPC Types
| Type | Frequency | Behavior | Visual |
|------|-----------|----------|--------|
| Shopper | 60% | Rides belt, 40% carry swinging bags | Box body + sphere head + pants + random shirt color. Bags swing with sinusoidal phase offset. |
| Phone Zombie | 20% | Rides belt, holds phone up | Same body + small dark rectangle at ear height |
| Sales Rep | 20% | Leans into your lane, sways | Body rotated toward lane center, oscillating lean |

### NPC Hair Fix
NPC hair uses randomized dark hair colors: `[#2a2428, #3a3230, #282830, #4a3828, #1a1818]`. NOT the cat body material (this was a bug that made NPCs have cream cat-body-colored hair).

### Collision System
- Detection radius: 0.22 lateral, 0.25 depth
- On collision: NPC marked as `passed`, flow decreases by 1.0, cat bumped laterally (0.12 units away from NPC lane)
- Successfully passing an NPC (exits behind camera without collision): flow increases by 0.22
- NPCs spawn at -BELT/2 - 1 to -3 (ahead of cat, in the distance)
- NPCs removed when beltZ > 5 (behind camera)

---

## 7. FLOW SYSTEM

### Mechanics
- **Range:** 0 to 15 (displayed as 15-pip bar)
- **Gain:** +0.22 per NPC successfully passed
- **Drain:** -1.0 per collision, -0.18/second natural decay
- **Belt speed:** `1.6 + flow * 0.12` (faster at higher flow)

### Flow → Visual Effects (Dither Shader)
| Flow Level | Quantization | Color Shift | Bloom | Scanlines | Vignette |
|------------|-------------|-------------|-------|-----------|----------|
| 0 (min) | 10 levels (crunchy) | Neutral | None | Full (0.025) | Tight (0.22) |
| 15 (max) | 16 levels (smooth) | Warm (+0.02R) | 0.07 | Faded (0.01) | Soft (0.10) |

### Flow → Cat Animation
- **Tail lift:** `0.012 + flow * 0.006` per segment (tail rises with composure)
- **Tail wag:** 0.04 base, 0.08 at flow > 5
- **Ear forward perk:** `min(flow * 0.012, 0.15)` (ears press forward in flow state)

### Mood Labels (UI)
```
0-1: INDIFFERENT    6: WEAVING       11: TRANSCENDENT
2:   CURIOUS        7: GLIDING       12: OMNISCIENT
3:   ALERT          8: FLOWING       13: BEYOND
4:   FOCUSED        9: ASCENDING     14-15: RETAIL-BLESSED
5:   COMPOSED       10: UNBOTHERED
```

---

## 8. UI SHELL — Win95 Software Aesthetic

### Window Chrome
- Title bar: gradient `#1a1a4e` → `#2a6a7e` → `#1a3a5e`
- Title text: "pusyphus.exe" in Silkscreen monospace
- Minimize/maximize/close buttons (decorative)
- Frame: 3px outset border, `#c0b8b0` background

### Panels (absolute positioned over game canvas)
- **STATUS** (top-left): MOOD label, ALT counter
- **FLOW INDEX** (top-right): 15-pip bar (teal active, pink hot > 10), flow state word
- **ZONE** (bottom-center): "KIOSK CANYON" label, floor tracker

### Status Bar (below canvas)
- Scent index: "nominal" / "elevated" (flow > 5)
- Social density: empty/low/moderate/busy/congested/sardine (based on NPC count)
- Sparkle indicator: ☆ → ✧ → ✧✧ → ✧✧✧ (flow thresholds)

### Whisper Messages
Semi-transparent text fades in/out at center of screen every 8-20 seconds:
"YOU ARE ASCENDING", "PLEASE CONTINUE UPWARD", "PETS NOT ALLOWED", "ESCALATOR DOES NOT STOP", "MALL HOURS: ALWAYS", "COMPOSURE IS OPTIONAL", "ASCENDING INDEFINITELY", "BRIEFLY HUMILIATED"

### Fonts
- **Silkscreen** (title bar, headings): pixel-precise monospace
- **VT323** (all UI text): terminal/CRT feel

---

## 9. CONTROLS

| Input | Action |
|-------|--------|
| Mouse X | Set cat target lane (-1 to +1) |
| Arrow Left / A | Nudge target lane left (3.2/sec) |
| Arrow Right / D | Nudge target lane right (3.2/sec) |
| Arrow Up / W / Scroll Up | Move to step above (implemented in some versions) |
| Arrow Down / S / Scroll Down | Move to step below |
| Click / Space / Enter | Start game from title screen |
| Touch | Lane control (touch X position mapped to -1..+1) |

Cat input uses spring interpolation: `catInputX += (catTgt - catInputX) * 8 * dt`. The spring-chain then cascades: head follows input, body follows head, butt follows body.

---

## 10. CAMERA

The camera trails behind and above the cat, looking up the escalator:
```javascript
camera.position.set(headX * 0.15, stepY(2) + 3.5 + flow * 0.05, 3.8);
camera.lookAt(headX * 0.3, stepY(-3) + 0.5, -4);
```
- Slight lateral follow on cat X position (15% tracking)
- Y rises slightly with flow (the world opens up as you compose yourself)
- Camera height provides the "trailing oblique" angle — you see the escalator stretching upward into fog

---

## 11. TECHNICAL ARCHITECTURE

### Stack
- **Single HTML file** — no build step, no dependencies beyond CDN-hosted Three.js r128
- **Three.js** (ES module import from cdnjs)
- **GLSL** for dither+flow postprocessing shader
- **CSS** for Win95 UI chrome

### Render Pipeline
1. Scene renders to half-res WebGLRenderTarget (NearestFilter on both min/mag)
2. Dither shader samples render target, applies Bayer 4×4 ordered dither, color quantization, flow-reactive warm shift, pseudo-bloom, scanlines, vignette
3. Full-screen quad blits dithered result to canvas at full resolution (nearest-neighbor upscale by the browser)

### Performance Notes
- Geometry is cached (`const G = {...}`) — shared across all instances
- Materials are cached (`const M = {...}`)
- Step pool, glass panel pool, rail segment pool all recycle
- Environment chunks recycle
- NPC meshes are created on spawn, removed on despawn (not pooled — potential optimization)
- `scene.traverse()` for neon flicker runs every frame (potential optimization: cache neon references)

---

## 12. FILE MANIFEST

### Active (Canonical)
| Path | Description |
|------|-------------|
| `PUSSYPHUS_StateOfGameDesign_V1.md` | This document — game design bible |
| `CLAUDE.md` | Project context for LLM assistants — read-first primer |
| `CHANGELOG.md` | Version history |
| `pussyphus-notes.md` | Working notes: voice, taglines, philosophical grounding, Bo |
| `THE_PUSSYPHUS_Bo_Character.jpg` | Bo character reference image |
| `preflight.sh` | Consistency checker — run before committing |
| `index.html` | GitHub Pages entry — redirects to the prototype |
| `docs/plans/` | Design docs for larger features (e.g., audio system design + implementation) |
| `docs/notes/` | Tuning logs and playtest notes |
| `prototypes/pussyphus_prototype/` | **Canonical modular codebase.** ES modules, Three.js r128, Tone.js 14.8.49. Run with any static server. |
| `prototypes/pussyphus_prototype/index.html` | Entry point — DOM shell, styles, importmap, boots `src/main.js` |
| `prototypes/pussyphus_prototype/src/main.js` | Game loop, state machine, orchestration |
| `prototypes/pussyphus_prototype/src/constants.js` | All tuning constants — single source of truth |
| `prototypes/pussyphus_prototype/src/input.js` | Unified keyboard/mouse/touch/scroll input state |
| `prototypes/pussyphus_prototype/src/cat/` | `cat.js` (entity/spring chain), `catModel.js` (meshes), `catAnim.js` (walk cycles, ear tracking), `catTail.js` (IDLE/MOVING/IMPACT state machine) |
| `prototypes/pussyphus_prototype/src/world/` | `escalator.js` (step pool, belt), `environment.js` (kiosk chunks), `npcs.js` (spawning, types, collision) |
| `prototypes/pussyphus_prototype/src/render/` | `scene.js` (THREE setup), `materials.js` (palettes), `dither.js` (Bayer shader, post-fx) |
| `prototypes/pussyphus_prototype/src/ui/` | `hud.js` (flow bar, status), `titleScreen.js` (boot overlay), `mallfm.js` (Mall FM station identity) |
| `prototypes/pussyphus_prototype/src/audio/` | `mixer.js` (routing graph), `music.js` (Tone Transport progression engine), `crowd.js` (per-frame density + foley), `shepard.js` (Shepard-tone drone), `fragments.generated.js` (procedural melodic one-shots) |
| `prototypes/pussyphus_prototype/build.sh` | Bundles modular source back to single HTML for distribution |
| `prototypes/pussyphus_character_study.html` | 2D canvas ballz+linez Cornish Rex reference. Animation states. Standalone. ~371 lines |

### Archived (Historical Snapshots — do not edit)
| Path | Description |
|------|-------------|
| `prototypes/archive/pussyphus_v1_monolithic_825L.html` | First complete monolithic prototype. Still has Siamese refs in comments. |
| `prototypes/archive/bo-early/pussyphus_bo-early_631L.html` | Earlier Bo prototype (631 lines, from Projects/Bo/) |
| `prototypes/archive/bo-early/pussyphus_ballz_cgpt_748L.html` | CGPT-generated ballz prototype (748 lines) |

### Project Knowledge (read-only, attached to Claude project)
| File | Description |
|------|-------------|
| `PUSSYPHUS_CharacterNote_BoIsCornishRex.md` | Breed correction note — Bo is Cornish Rex, NOT Siamese |
| `PUSSYPHUS_DeepResearchPrompts.md` | Deep research prompts (escalator mechanics, dither techniques) |

---

## 13. PF MAGIC RESEARCH FINDINGS (Reference)

Extracted from .cat breed files and deep dive PDF:

- Catz uses **ballz (overlapping spheres) + linez (tapered trapezoid connectors)** — NOT meshes, NOT tubes
- Cat skeleton: 67+ named balls (head, cheekL/R, jowlL/R, jaw, snout, chin, nose, ears×4, eyes×2 with irises, whiskers×6, neck, chest, belly, butt, full leg chains with fingers/toes, tail1-tail6, tongue)
- **Head Enlargement value: 102** — head is proportionally bigger than body (the DOMINANT mass)
- Tail segments alternate sizes: 10→15→30→32→20→9 (thick base, mid-bulge, thin tip)
- Design philosophy: "user perception-based approach" — layered concurrent animations with constrained randomness create illusion of life
- Breed personality parameters (from PF Magic Siamese data, applied to Bo): high acrobaticness (100), high confidence (80), low liveliness (40), low playfulness (30)

---

## 14. WHAT'S BUILT vs. WHAT'S NOT

### BUILT (Phase 1 — Vertical Slice)
- [x] Infinite escalator treadmill with step recycling
- [x] Kiosk canyon environment with randomized chunks
- [x] Seal point Cornish Rex kitten with spring-chain physics and tube body
- [x] Seal point coloring (cream body, dark points, teal eyes, face mask)
- [x] Character study with ballz+linez proportions
- [x] 3 NPC types (shopper, phone zombie, sales rep)
- [x] Flow meter with visual shader response
- [x] Bayer dither + flow-reactive postprocessing
- [x] Win95 UI shell with status panels
- [x] Whisper message system
- [x] Mouse + keyboard + touch controls
- [x] Static background (environment doesn't ride the belt)
- [x] Raised tail with upward curve
- [x] Ear proximity sensing (ears rotate toward nearest obstacle) — Cornish Rex silhouette: base-on-head, tapers upward
- [x] NPC hair fix (random dark colors, not cat material)

### BUILT (v0.5–v0.6 — Audio + Tail)
- [x] **Audio layer:** three-module stack (`mixer.js`, `music.js`, `crowd.js`) + Shepard-tone drone + Mall FM station identity. Tone.js Transport progression at 92 BPM, city pop / bossa / cumbia / synth-pop phrase families with common-tone voice leading. Per-NPC proximity occlusion, flow-driven reverb wet + drone pitch. Procedural fragment one-shots on flow integer crossings ≥5. `?audioDebug=1` URL param for live telemetry.
- [x] **Tail state machine (`catTail.js`):** IDLE / MOVING / IMPACT transitions on top of the existing spring chain. IDLE = base dips, tip curls, slow swish. MOVING = perkier base, quicker sway. IMPACT = lateral impulse away from collider, exponential decay. Replaces the undifferentiated sin(t*2.5) wave. Emotional telemetry is now actually implemented.

### NOT BUILT (Phase 2+)
- [ ] **Movement verbs:** slip (near-miss grace note), hop (step transition), brush (light contact without full collision)
- [ ] **Traffic patterns:** soft choke (2-3 NPCs close together), swing zone (bag arc creates moving hazard), sales ambush (rep lunges), clean rhythm windows (intentional gaps for flow building)
- [ ] **Collision animations:** stumble, annoyed tail flick, recovery trot, composure shake-off (tail IMPACT state is in — the body response isn't)
- [ ] **Zone progression:** Zone 02+, environment palette shifts, different obstacle types at altitude thresholds
- [ ] **Cat character in game still uses tube geometry** — the 2D ballz+linez study looks significantly better and the proportions have been applied, but the actual rendering technique (spheres+connectors vs tubes) hasn't been ported to 3D
- [ ] **Scent system:** proximity-based environmental awareness (hinted in UI, not implemented)
- [ ] **Composure meter:** failure state = loss of composure, not death. Stumbles accumulate, cat gets flustered, eventually sits down and refuses to continue until composure recovers.
- [ ] **Real recorded fragments** to replace the procedurally synthesized `fragments.generated.js` placeholders

---

## 15. DESIGN PRINCIPLES FOR ANYONE CONTINUING THIS

1. **Flow state goal:** "Glide, thread, recover, continue" — NOT "rush rush rush." The game should feel like meditation with obstacles, not stress with rewards.

2. **The cat is always right.** The cat's animation should always be the most alive, most considered thing on screen. If the cat looks wrong, nothing else matters.

3. **Head is always the largest visual mass.** This is non-negotiable. It comes from PF Magic's actual breed data.

4. **Tail is emotional telemetry.** The tail should communicate the cat's internal state at a glance — raised and flowing at high composure, low and twitchy at low composure.

5. **Ears are gameplay feedback.** They rotate toward threats before the player consciously notices them. This is the cat's primary proximity sensor and the player's primary spatial awareness tool.

6. **Failure is loss of composure, not death.** The cat doesn't die. It gets annoyed. It loses its cool. The punishment is aesthetic — the dither gets crunchier, the colors flatten, the tail drops. Recovery is the reward.

7. **The mall is mundane. The cat is not.** The environment should feel like it was procedurally generated by a bored retail developer in 1997. The cat should feel like it was hand-animated by someone who actually loves cats.

8. **Default to light/warm/neutral backgrounds.** This is a standing preference for all visual work on this project. Dark mode only when explicitly requested.

9. **Constrained randomness over scripted sequences.** Every animation should have parameters that vary within ranges, never exact repetition. This is the core PF Magic insight.

10. **The escalator does not stop.** There is no pause, no level select, no menu. You are ascending. You have always been ascending.

---

## 16. CONTEXT FOR LLMs

If you are an LLM picking up this project:

**The game is called PUSSYPHUS.** The canonical codebase is `prototypes/pussyphus_prototype/` — a modular ES module project. Run it with any static file server (`npx serve .` or `python3 -m http.server`). Use `build.sh` to bundle back to a single HTML for distribution. See the README.md in that folder for the full module dependency graph.

**Bo is a seal point Cornish Rex, NOT a Siamese.** She/her. 19 years old. Based on the developer's real cat. The breed correction has been applied across all active files as of v0.4. Archived files still have old Siamese references — do not edit those.

**The character study file is `prototypes/pussyphus_character_study.html`.** It's a 2D canvas reference showing the ideal ballz+linez cat proportions. Use it as visual reference, not as code to merge.

**The seal point Cornish Rex coloring has been applied** to the 3D game. Materials `M.cBody` (cream), `M.cPoint` (dark), `M.cEye` (teal), `M.cEar` (dark), plus a `catMask` sphere for the facial point pattern. Body radii have been tuned to match character study proportions. Tail rises upward. Environment chunks are static (don't ride the belt). NPC hair uses random dark colors.

**When making changes:** Edit files in `prototypes/pussyphus_prototype/src/`. Each module exports `init()`, `update(dt)`, `reset()`. Constants live in `constants.js`. Don't rewrite whole files — use targeted edits. The dither shader, escalator mechanics, NPC system, and UI are all working. Focus new work on Phase 2 items in section 14.

**Julia's working style:** Direct, empirical, non-hedging. Prose paragraphs over bullets in discussion. Gaps treated as findings. Pushback as a signal to reframe rather than restate. Default to light/warm grounds for all visuals. She has deep design sensibility and will catch proportion errors, color shifts, and animation timing issues immediately.
