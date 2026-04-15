# PUSSYPHUS — Project Context

Read this first. Then read the GDD (`PUSSYPHUS_StateOfGameDesign_V1.md`) for full design details.

## What This Is

A browser-based zen escalator game. A seal point Cornish Rex kitten named Bo ascends an infinite mall escalator, weaving between shoppers to achieve flow state. Built in Three.js r128, rendered through a Bayer dither post-processing shader. Win95 software aesthetic.

## The Cat

Bo. **Seal point Cornish Rex** (NOT Siamese — this was corrected in v0.4). She/her. 19 years old. Based on the developer's real cat.

Key Cornish Rex traits that affect the model: arched back, whippet-like tucked belly, enormous high-set ears, egg-shaped head with Roman nose, short wavy coat, whip-thin tail. Elderly — slightly thinner frame, stiffness that disappears during flow state.

## Folder Structure

```
Pussyphus/
├── CLAUDE.md                          ← You are here
├── CHANGELOG.md                       ← Version history
├── PUSSYPHUS_StateOfGameDesign_V1.md  ← Full GDD (the bible)
├── THE_PUSSYPHUS_Bo_Character.jpg     ← Character reference
├── preflight.sh                       ← Consistency checker
└── prototypes/
    ├── pussyphus_prototype/           ← CANONICAL CODEBASE
    │   ├── index.html                 ← Entry point
    │   ├── src/                       ← All game modules
    │   ├── build.sh                   ← Bundle to single HTML
    │   └── README.md                  ← Architecture docs
    ├── pussyphus_character_study.html  ← 2D ballz+linez reference
    └── archive/                       ← Historical snapshots (don't edit)
```

## How to Work on This

1. **Edit files in** `prototypes/pussyphus_prototype/src/`
2. **Run locally** with `npx serve .` or `python3 -m http.server` from the prototype dir
3. **Build for distribution** with `./build.sh` (outputs single HTML)
4. **Constants** live in `src/constants.js` — single source of truth for tuning
5. **Each module** exports `init()`, `update(dt)`, `reset()`
6. **No module reaches into another's internals** — communicate via state object in main.js

## Critical Rules

- **Bo is a Cornish Rex.** Not Siamese. Check the CharacterNote in project knowledge.
- **Head is always the largest visual mass.** Non-negotiable. PF Magic breed data.
- **Tail is emotional telemetry.** Raised = composure. Dropped = flustered.
- **Ears are gameplay feedback.** They rotate toward threats.
- **Failure is loss of composure, not death.**
- **Default to light/warm/neutral backgrounds.** Never dark mode unless explicitly asked.
- **The escalator does not stop.**

## What's Built vs. What's Next

See GDD sections 14 (WHAT'S BUILT vs. WHAT'S NOT) for the full breakdown. The vertical slice is complete. Phase 2 priorities: movement verbs, traffic patterns, collision animations, audio layer.

## Julia's Working Style

Direct, empirical, non-hedging. Prose over bullets. Gaps are findings. Pushback means reframe, not restate. Deep design sensibility — she'll catch proportion errors, color shifts, and timing issues immediately.

## Before Committing Changes

Run `./preflight.sh` from the Pussyphus root to check for:
- Stale Siamese references in active files
- Missing source modules
- Build script integrity
