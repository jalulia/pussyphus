# Audio System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the three-module audio system (mixer, music, crowd) that makes the Pussyphus mall sound like a real place Bo is walking through — procedural city pop/cumbia/Madonna bed, crowd-as-filter acoustics, synthesized NPC foley, and an always-there escalator drone.

**Architecture:** Three sibling modules under `src/audio/` following the project's `init()` / `update(dt)` / `reset()` convention. A single Tone.js-backed mixer owns the routing graph `[music] → [crowd lowpass] → [reverb] → [master] → destination` and exposes typed buses. `music.js` owns synths and the progression engine; `crowd.js` reads the existing `npcs` array each frame, computes density and per-NPC occlusion contributions, and drives the mixer's filter/reverb params. Main.js adds two update calls and one audio-init on title-screen click (browser autoplay gate).

**Tech Stack:** Web Audio API (BiquadFilterNode, ConvolverNode, GainNode, StereoPannerNode), Tone.js r14 via CDN, existing Three.js r128 game loop. No new build steps until Phase 5 (base64 sample inlining in `build.sh`). No test framework exists in this project; verification uses a small in-browser `?audioDebug=1` overlay plus ear-checks against explicit expected behaviors.

**Context for the engineer:**
- The design doc this plan implements: `docs/plans/2026-04-13-audio-system-design.md`. Read it first — it defines the acoustic profiles, progression engine, and all the "why."
- The project is a single-page game. "Tests" here mean: (a) assertions in a debug overlay that read live audio-graph state, (b) scripted scene conditions (force-spawn NPCs at known densities), and (c) explicit listening checks with expected results. Honest about the constraint: audio quality is ear-verified, not CI-verified.
- Every task ends with a commit. Frequent small commits — this is a visual/aural system and bisecting "what broke the vibe" matters.
- Constants go in `src/constants.js`. Never hardcode tuning values in module bodies.
- No module reaches into another's internals. `crowd.js` imports `npcs` (already a public export) and calls `mixer.setCrowdFilter(cutoff, q)`. It does not poke AudioNodes directly.
- Julia's style: prose over bullets in code comments, direct language, no hedging. She will notice if the filter glitches at density transitions or if the drone pitch-shifts audibly — those are bugs, not features.

---

## Task 0: Worktree and branch setup

**Files:** none (git only).

**Step 1:** Create a worktree so this work is isolated from `main`.

```bash
cd /sessions/friendly-dazzling-heisenberg/mnt/Pussyphus
git worktree add ../Pussyphus-audio -b feat/audio-system
cd ../Pussyphus-audio
```

**Step 2:** Verify clean state.

```bash
git status
```
Expected: `nothing to commit, working tree clean` on branch `feat/audio-system`.

**Step 3:** Confirm preflight passes on baseline.

```bash
./preflight.sh
```
Expected: `0 failed`.

---

## Phase 1 — mixer.js + escalator drone + macro density filter

Goal of phase: prove the loop "more NPCs → more muffled test tone." No music yet.

### Task 1.1: Add audio constants

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/constants.js` (append at end)

**Step 1:** Append the audio constant block from the design doc Section 7. Use exact values.

```javascript
// ── Audio — crowd filter ──
export const CROWD_FILTER_MAX = 8000;
export const CROWD_FILTER_MIN = 800;
export const CROWD_FILTER_SMOOTH = 2;
export const CROWD_FILTER_Q_MIN = 0.5;
export const CROWD_FILTER_Q_MAX = 1.2;
export const CROWD_PROX_RADIUS = 1.5;

// ── Audio — flow modulation ──
export const FLOW_REVERB_MIN = 0.05;
export const FLOW_REVERB_MAX = 0.35;
export const FLOW_OCCLUSION_ATTEN = 0.7;

// ── Audio — music ──
export const MUSIC_BPM = 92;
export const MUSIC_MASTER_GAIN = 0.4;
export const MUSIC_CHORD_MIN_BEATS = 2;
export const MUSIC_CHORD_MAX_BEATS = 4;
export const MUSIC_HUMANIZE_MS = 30;

// ── Audio — foley ──
export const FOLEY_MASTER_GAIN = 0.15;
export const FOLEY_PROX_RANGE = 1.2;
export const FOLEY_PAN_SCALE = 0.8;

// ── Audio — escalator drone ──
export const DRONE_FREQ_A = 55;
export const DRONE_FREQ_B = 58;
export const DRONE_GAIN = 0.08;
export const DRONE_FLOW_FREQ_SHIFT = 5;

// ── Audio — master ──
export const AUDIO_MASTER_GAIN = 0.7;
```

**Step 2:** Verify import works.

Run in browser console after loading the page:
```javascript
import('./src/constants.js').then(K => console.log(K.CROWD_FILTER_MAX));
```
Expected: `8000`.

**Step 3:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/constants.js
git commit -m "audio: add constants for mixer, music, crowd, foley, drone"
```

### Task 1.2: Add Tone.js to index.html

**Files:**
- Modify: `prototypes/pussyphus_prototype/index.html:91-97` (importmap)

**Step 1:** Add Tone.js to the importmap alongside `three`.

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js",
    "tone": "https://cdn.jsdelivr.net/npm/tone@14.8.49/build/Tone.js"
  }
}
</script>
```

Note: Tone.js at v14 does not ship a native ES module build on the jsdelivr CDN URL above; it's a UMD bundle. The importmap above will fail for many CDN variants. Use this instead — a module build that is known to work:

```html
"tone": "https://cdn.jsdelivr.net/npm/tone@14.8.49/+esm"
```

**Step 2:** Verify in browser console.

```javascript
import('tone').then(T => console.log(T.context.state));
```
Expected: `"suspended"` (context exists but not yet started; browser autoplay policy).

**Step 3:** Commit.

```bash
git add prototypes/pussyphus_prototype/index.html
git commit -m "audio: wire Tone.js v14 via importmap"
```

### Task 1.3: Create mixer.js skeleton with master bus and test oscillator

**Files:**
- Create: `prototypes/pussyphus_prototype/src/audio/mixer.js`

**Step 1:** Write the module. The skeleton owns the AudioContext via Tone, creates the master gain and a placeholder music bus, and exposes a `testTone(on)` function for Phase 1 verification.

```javascript
// ════════════════════════════════════════
// MIXER — AudioContext, master bus, filter chain, reverb
// ════════════════════════════════════════
import * as Tone from 'tone';
import * as K from '../constants.js';

let started = false;
let masterGain, musicBus, crowdFilter, reverb, reverbWet;
let testOsc = null;

export async function init() {
  if (started) return;
  await Tone.start();
  started = true;

  const ctx = Tone.getContext().rawContext;

  masterGain = ctx.createGain();
  masterGain.gain.value = K.AUDIO_MASTER_GAIN;
  masterGain.connect(ctx.destination);

  // Synthesized short-decay impulse (warm mall hall, not cathedral)
  reverb = ctx.createConvolver();
  reverb.buffer = synthImpulse(ctx, 1.4, 2.0);
  reverbWet = ctx.createGain();
  reverbWet.gain.value = K.FLOW_REVERB_MIN;
  reverb.connect(reverbWet).connect(masterGain);

  crowdFilter = ctx.createBiquadFilter();
  crowdFilter.type = 'lowpass';
  crowdFilter.frequency.value = K.CROWD_FILTER_MAX;
  crowdFilter.Q.value = K.CROWD_FILTER_Q_MIN;
  crowdFilter.connect(masterGain);
  crowdFilter.connect(reverb);

  musicBus = ctx.createGain();
  musicBus.gain.value = 1.0;
  musicBus.connect(crowdFilter);
}

function synthImpulse(ctx, seconds, decay) {
  const rate = ctx.sampleRate;
  const len = rate * seconds;
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function setCrowdFilter(cutoff, q) {
  if (!crowdFilter) return;
  const now = Tone.getContext().rawContext.currentTime;
  crowdFilter.frequency.setTargetAtTime(cutoff, now, 1 / K.CROWD_FILTER_SMOOTH);
  crowdFilter.Q.setTargetAtTime(q, now, 1 / K.CROWD_FILTER_SMOOTH);
}

export function setReverbWet(wet) {
  if (!reverbWet) return;
  const now = Tone.getContext().rawContext.currentTime;
  reverbWet.gain.setTargetAtTime(wet, now, 0.3);
}

export function getMusicBus() { return musicBus; }
export function getMasterBus() { return masterGain; }

export function testTone(on) {
  const ctx = Tone.getContext().rawContext;
  if (on && !testOsc) {
    testOsc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.1;
    testOsc.type = 'sawtooth';
    testOsc.frequency.value = 220;
    testOsc.connect(g).connect(musicBus);
    testOsc.start();
  } else if (!on && testOsc) {
    testOsc.stop();
    testOsc.disconnect();
    testOsc = null;
  }
}

export function update(_dt) { /* Phase 2+ */ }
export function reset() { /* Phase 2+ */ }

// Debug accessors — used by ?audioDebug=1 overlay, not by game code.
export const _debug = {
  get filterFreq() { return crowdFilter?.frequency.value; },
  get filterQ() { return crowdFilter?.Q.value; },
  get reverbWet() { return reverbWet?.gain.value; },
};
```

**Step 2:** Wire into main.js — init on title click, nothing in the loop yet.

Modify `prototypes/pussyphus_prototype/src/main.js`:
- After line 15 (last import), add: `import * as mixer from './audio/mixer.js';`
- Replace the title click handler (line 53) with:

```javascript
document.getElementById('ts').addEventListener('click', async () => {
  await mixer.init();
  mixer.testTone(true);   // verification only; removed in Task 1.6
  start();
});
```

**Step 3:** Verify.

Serve and click the title screen. Expected: a steady sawtooth at 220Hz is audible. Open console, run:
```javascript
import('./src/audio/mixer.js').then(m => console.log(m._debug.filterFreq, m._debug.filterQ));
```
Expected: `8000 0.5`.

**Step 4:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/audio/mixer.js prototypes/pussyphus_prototype/src/main.js
git commit -m "audio: mixer skeleton — master, crowd filter, reverb, test tone"
```

### Task 1.4: Escalator drone

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/audio/mixer.js` (add drone section)

**Step 1:** Add drone creation inside `init()`, after master gain is connected. The drone bypasses the crowd filter — it's diegetic to Bo, not mall-PA.

```javascript
// Drone: two detuned sines, beat frequency ~3Hz. Always on.
const droneGain = ctx.createGain();
droneGain.gain.value = K.DRONE_GAIN;
droneGain.connect(masterGain);

const oscA = ctx.createOscillator();
oscA.type = 'sine';
oscA.frequency.value = K.DRONE_FREQ_A;
oscA.connect(droneGain);
oscA.start();

const oscB = ctx.createOscillator();
oscB.type = 'sine';
oscB.frequency.value = K.DRONE_FREQ_B;
oscB.connect(droneGain);
oscB.start();

// Stash for flow modulation later
_drone = { oscA, oscB, gain: droneGain };
```

Declare at the top of the module alongside the other lets: `let _drone = null;`

**Step 2:** Add a `setDroneFlow(flow01)` that shifts frequency up by `DRONE_FLOW_FREQ_SHIFT` at flow=1.

```javascript
export function setDroneFlow(flow01) {
  if (!_drone) return;
  const now = Tone.getContext().rawContext.currentTime;
  _drone.oscA.frequency.setTargetAtTime(K.DRONE_FREQ_A + flow01 * K.DRONE_FLOW_FREQ_SHIFT, now, 0.5);
  _drone.oscB.frequency.setTargetAtTime(K.DRONE_FREQ_B + flow01 * K.DRONE_FLOW_FREQ_SHIFT, now, 0.5);
}
```

**Step 3:** Verify by ear.

Click title, listen. Expected: under the test sawtooth you can hear a slow woofy throb (~3 cycles/sec). Mute the sawtooth by commenting out `mixer.testTone(true)` temporarily if the drone is hard to hear in isolation.

**Step 4:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/audio/mixer.js
git commit -m "audio: escalator drone — two detuned sines with flow-driven pitch shift"
```

### Task 1.5: crowd.js skeleton with density measurement

**Files:**
- Create: `prototypes/pussyphus_prototype/src/audio/crowd.js`

**Step 1:** Density is "how many NPCs are in the active near-camera zone, normalized." Cap at 8 for sardine=1.0. Use a simple z-window: NPCs with `beltZ > -3.5 && beltZ < 1.5` (the visible escalator belt).

```javascript
// ════════════════════════════════════════
// CROWD — per-frame NPC acoustic analysis, drives mixer filter
// ════════════════════════════════════════
import * as K from '../constants.js';
import * as mixer from './mixer.js';

const SARDINE_COUNT = 8;
let _density = 0;

export function init() { /* no-op for Phase 1 */ }

export function update(_dt, npcs, _catHeadX, flow) {
  let count = 0;
  for (const n of npcs) {
    const z = n.userData.beltZ;
    if (z > -3.5 && z < 1.5) count++;
  }
  _density = Math.min(1, count / SARDINE_COUNT);

  // Macro filter: lerp between CROWD_FILTER_MAX and _MIN
  const cutoff = K.CROWD_FILTER_MAX + (K.CROWD_FILTER_MIN - K.CROWD_FILTER_MAX) * _density;
  const q = K.CROWD_FILTER_Q_MIN + (K.CROWD_FILTER_Q_MAX - K.CROWD_FILTER_Q_MIN) * _density;
  mixer.setCrowdFilter(cutoff, q);

  // Flow-driven reverb wet
  const flow01 = Math.min(1, flow / 15);
  const wet = K.FLOW_REVERB_MIN + (K.FLOW_REVERB_MAX - K.FLOW_REVERB_MIN) * flow01;
  mixer.setReverbWet(wet);
  mixer.setDroneFlow(flow01);
}

export function reset() { _density = 0; }

export const _debug = {
  get density() { return _density; },
};
```

**Step 2:** Wire into main.js loop. After the existing `npcs.update(...)` call (line 87), add:

```javascript
crowd.update(dt, npcs.npcs, cat.headX, flow);
```

Add the import at the top: `import * as crowd from './audio/crowd.js';`

**Step 3:** Verify.

Start game. Watch the filter drop as NPCs crowd in:
```javascript
setInterval(() => {
  import('./src/audio/crowd.js').then(c =>
  import('./src/audio/mixer.js').then(m =>
    console.log('density:', c._debug.density.toFixed(2), 'cutoff:', m._debug.filterFreq.toFixed(0))));
}, 500);
```
Expected: with an empty belt, cutoff ~8000. As NPCs spawn and cluster, cutoff drops toward 800. The sawtooth test tone should audibly muffle when the belt is crowded and brighten when it clears.

**Step 4:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/audio/crowd.js prototypes/pussyphus_prototype/src/main.js
git commit -m "audio: crowd.js macro filter driven by NPC density and flow-state reverb"
```

### Task 1.6: Remove test tone, add audio debug overlay

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/main.js` (remove test tone)
- Modify: `prototypes/pussyphus_prototype/src/ui/hud.js` (add audio debug block, guarded by `?audioDebug=1`)

**Step 1:** Remove the `mixer.testTone(true)` line from the title click handler.

**Step 2:** Add debug overlay. At the top of `hud.js`:

```javascript
const DEBUG = new URLSearchParams(location.search).get('audioDebug') === '1';
let dbgEl = null;
if (DEBUG) {
  dbgEl = document.createElement('div');
  dbgEl.style.cssText = 'position:fixed;bottom:4px;right:4px;background:#000a;color:#0f8;font:11px monospace;padding:4px;z-index:999;white-space:pre';
  document.body.appendChild(dbgEl);
}
```

In `hud.update()`, append:
```javascript
if (DEBUG && dbgEl) {
  import('../audio/mixer.js').then(mx =>
    import('../audio/crowd.js').then(cr => {
      dbgEl.textContent =
        `density  ${cr._debug.density.toFixed(2)}\n` +
        `cutoff   ${mx._debug.filterFreq.toFixed(0)} Hz\n` +
        `Q        ${mx._debug.filterQ.toFixed(2)}\n` +
        `revwet   ${mx._debug.reverbWet.toFixed(2)}`;
    }));
}
```

(Static-import the modules if you prefer; the dynamic form avoids circular concerns.)

**Step 3:** Verify.

Load `index.html?audioDebug=1`. Expected: an overlay in the bottom-right ticks live with density, cutoff, Q, revwet. Without the param, no overlay.

**Step 4:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/main.js prototypes/pussyphus_prototype/src/ui/hud.js
git commit -m "audio: ?audioDebug=1 overlay; remove scaffolding test tone"
```

### Phase 1 Checkpoint

Stop and listen for 2 full minutes of gameplay. Expected aural behavior:

1. A low ~3Hz mechanical throb is always present.
2. No music yet (Phase 2).
3. The scene is not silent — even on an empty belt you can hear the drone.
4. Debug overlay numbers move smoothly, never jump.

If any of these fail, fix before continuing. **Do not proceed to Phase 2 with a glitchy filter.**

---

## Phase 2 — music.js: Rhodes + bass + pad + progression engine

Goal: procedural four-bar phrases at 92 BPM flowing through the crowd filter.

### Task 2.1: music.js skeleton with three voices

**Files:**
- Create: `prototypes/pussyphus_prototype/src/audio/music.js`

**Step 1:** Define the three voices. Route all to a shared node which connects to `mixer.getMusicBus()`.

```javascript
// ════════════════════════════════════════
// MUSIC — procedural Rhodes/bass/pad + progression engine
// ════════════════════════════════════════
import * as Tone from 'tone';
import * as K from '../constants.js';
import * as mixer from './mixer.js';

let rhodes, bass, pad, musicOut;
let chordSeq, progressionIndex = 0, beatCounter = 0;
let started = false;

// Common-tone progression pool. Roman numerals in C major for simplicity;
// the engine doesn't modulate keys (yet).
const PROGRESSIONS = [
  // City pop
  ['Cmaj7', 'Em7', 'Fmaj7', 'G7'],
  ['Fmaj7', 'Em7', 'Am7', 'G7'],
  // Bossa
  ['Cmaj7', 'Am7', 'Dm7', 'G7'],
  // Cumbia
  ['C', 'F', 'G', 'F'],
  // Synth-pop
  ['C', 'Am', 'F', 'G'],
  ['C', 'G', 'Am', 'F'],
];

export async function init() {
  const ctx = Tone.getContext().rawContext;
  musicOut = ctx.createGain();
  musicOut.gain.value = K.MUSIC_MASTER_GAIN;
  musicOut.connect(mixer.getMusicBus());

  // Rhodes — FM, warm
  rhodes = new Tone.FMSynth({
    harmonicity: 2,
    modulationIndex: 3,
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 1.2 },
    modulationEnvelope: { attack: 0.02, decay: 0.2, sustain: 0, release: 0.2 },
  });
  const chorus = new Tone.Chorus(2, 2.5, 0.3).start();
  const trem = new Tone.Tremolo(4, 0.2).start();
  rhodes.chain(chorus, trem, Tone.getContext().createGain()); // placeholder — route below
  Tone.connect(trem, musicOut);

  bass = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    filter: { Q: 2, type: 'lowpass', frequency: 400 },
    envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.4 },
  });
  Tone.connect(bass, musicOut);

  pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 1.5, decay: 0.5, sustain: 0.8, release: 2.5 },
    volume: -12,
  });
  Tone.connect(pad, musicOut);

  Tone.Transport.bpm.value = K.MUSIC_BPM;
}
```

Note: the Tone v14 API for inter-node routing is `Tone.connect(source, dest)` where dest is a raw AudioNode. The routing above intentionally goes through one effect chain for Rhodes only — bass and pad are dry.

**Step 2:** Verify the module loads and voices exist.

In console after page load + title click:
```javascript
import('./src/audio/music.js').then(async m => { await m.init(); console.log('music init ok'); });
```
Expected: `"music init ok"` with no errors. No sound yet — no notes triggered.

**Step 3:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/audio/music.js
git commit -m "audio: music.js voices — Rhodes (FM + chorus + tremolo), bass, pad"
```

### Task 2.2: Chord voicer

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/audio/music.js`

**Step 1:** Add a voicer that converts chord symbols to note arrays with register spread. Keep it in-module — it's not reused elsewhere.

```javascript
const CHORD_TONES = {
  'C':      [0, 4, 7],
  'Cmaj7':  [0, 4, 7, 11],
  'Dm7':    [2, 5, 9, 12],
  'Em7':    [4, 7, 11, 14],
  'Fmaj7':  [5, 9, 12, 16],
  'F':      [5, 9, 12],
  'G':      [7, 11, 14],
  'G7':     [7, 11, 14, 17],
  'Am':     [9, 12, 16],
  'Am7':    [9, 12, 16, 19],
};

const MIDI_C4 = 60;

function voiceChord(symbol, octave = 4) {
  const tones = CHORD_TONES[symbol] || CHORD_TONES['C'];
  return tones.map(t => MIDI_C4 + (octave - 4) * 12 + t);
}

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
```

**Step 2:** Verify.

```javascript
import('./src/audio/music.js').then(m => console.log(m.voiceChord?.('Cmaj7')));
```
If not exported: temporarily export for the check, then un-export. Expected output: `[60, 64, 67, 71]`.

**Step 3:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/audio/music.js
git commit -m "audio: chord voicer with 10-symbol palette"
```

### Task 2.3: Progression engine + Transport scheduling

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/audio/music.js`

**Step 1:** Add the beat loop. One chord per bar (4 beats) to start — we'll add intra-bar rhythm later if needed.

```javascript
export function start() {
  if (started) return;
  started = true;
  let bar = 0;
  Tone.Transport.scheduleRepeat((time) => {
    const prog = PROGRESSIONS[progressionIndex % PROGRESSIONS.length];
    const sym  = prog[bar % 4];
    const chord = voiceChord(sym, 4).map(midiToFreq);
    const bassNote = midiToFreq(voiceChord(sym, 2)[0]);

    // Humanize timing
    const jitter = () => (Math.random() - 0.5) * K.MUSIC_HUMANIZE_MS / 1000;

    // Rhodes: staggered voicing, velocity varies
    chord.forEach((f, i) => {
      rhodes.triggerAttackRelease(f, '2n', time + jitter(), 0.5 + Math.random() * 0.3);
    });

    // Bass: root on beat 1, 5th on beat 3
    bass.triggerAttackRelease(bassNote, '4n', time);
    bass.triggerAttackRelease(midiToFreq(voiceChord(sym, 2)[1] || voiceChord(sym, 2)[0]), '4n', time + Tone.Time('2n').toSeconds());

    // Pad: long sustain, whole bar
    pad.triggerAttackRelease(chord, '1m', time);

    bar++;
    if (bar % 4 === 0) {
      // Advance progression with voice-leading preference: pick the next whose first tone is close
      progressionIndex = pickNextProgression(progressionIndex);
    }
  }, '1m');

  Tone.Transport.start();
}

function pickNextProgression(current) {
  const currentEnd = PROGRESSIONS[current % PROGRESSIONS.length][3];
  const currentEndRoot = CHORD_TONES[currentEnd][0];
  let best = current, bestDist = 99;
  for (let i = 0; i < PROGRESSIONS.length; i++) {
    if (i === current % PROGRESSIONS.length) continue;
    const startRoot = CHORD_TONES[PROGRESSIONS[i][0]][0];
    const dist = Math.min(
      Math.abs(startRoot - currentEndRoot),
      12 - Math.abs(startRoot - currentEndRoot)
    );
    if (dist < bestDist || (dist === bestDist && Math.random() < 0.5)) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function stop() {
  Tone.Transport.stop();
  started = false;
}
```

**Step 2:** Wire into main.js — call `music.init()` after `mixer.init()`, and `music.start()` when game state transitions to play.

In `main.js`:
```javascript
import * as music from './audio/music.js';
```

Replace title click:
```javascript
document.getElementById('ts').addEventListener('click', async () => {
  await mixer.init();
  await music.init();
  music.start();
  start();
});
```

**Step 3:** Verify by ear.

Play for one full minute. Expected: a 92 BPM chord progression that changes every bar, drifts across progression families without hard cuts, passes through the crowd filter so gets muffled when crowded. Rhodes is the melodic center, bass holds roots, pad is a soft bed.

Open `?audioDebug=1`. The filter should move as NPCs enter/exit. The music should track that.

If it sounds: (a) mechanical → humanize more aggressively, (b) out of tune → check voicer MIDI offsets, (c) too loud → reduce MUSIC_MASTER_GAIN.

**Step 4:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/audio/music.js prototypes/pussyphus_prototype/src/main.js
git commit -m "audio: progression engine with common-tone voice leading, 6-phrase pool"
```

### Phase 2 Checkpoint

Listen for 3 minutes. The music should:
- Never feel like it's looping. If it does, the progression pool is too small — add two more phrases from the genre DNA in Section 2 of the design doc.
- Muffle convincingly when 5+ shoppers are on the belt.
- Never click, pop, or distort. If it does, drop MUSIC_MASTER_GAIN and re-commit.

---

## Phase 3 — Per-NPC proximity occlusion and flow modulation

Goal: threading between bodies produces a momentary acoustic brightening.

### Task 3.1: NPC acoustic profile tagging

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/world/npcs.js:45-50` (userData)

**Step 1:** In `buildNPC`, after the existing `g.userData = {...}` assignment, set `absorb` and `spread` based on type:

```javascript
const PROFILE = {
  shopper:  { absorb: 0.5, spread: 0.4 },
  phone:    { absorb: 0.6, spread: 0.3 },
  salesrep: { absorb: 0.3, spread: 0.6 },
};
Object.assign(g.userData, PROFILE[type] || PROFILE.shopper);
```

Then in the `hasBag` block, bump `spread` to 0.7:
```javascript
if (type === 'shopper' && Math.random() > 0.4) {
  // ... existing bag mesh code ...
  g.userData.hasBag = true;
  g.userData.spread = 0.7;
}
```

**Step 2:** Verify.

In console, after a few NPCs spawn:
```javascript
import('./src/world/npcs.js').then(m => console.table(m.npcs.map(n => n.userData)));
```
Expected: every NPC has `absorb` and `spread` fields matching its type.

**Step 3:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/world/npcs.js
git commit -m "npcs: tag each NPC with absorb/spread acoustic profile on spawn"
```

### Task 3.2: Per-NPC occlusion in crowd.js

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/audio/crowd.js`

**Step 1:** Add per-NPC filter contribution. Each nearby NPC subtracts from cutoff proportional to `absorb * (1 - d/radius)`. Sum, cap, apply on top of macro.

```javascript
export function update(dt, npcs, catHeadX, catStepZ, flow) {
  // Macro density (unchanged)
  let count = 0;
  let occlusionDip = 0;
  const flow01 = Math.min(1, flow / 15);
  const attenuation = 1 - flow01 * K.FLOW_OCCLUSION_ATTEN;

  for (const n of npcs) {
    const z = n.userData.beltZ;
    if (z > -3.5 && z < 1.5) count++;

    // Proximity: distance from cat
    const dx = n.userData.lane - catHeadX;
    const dz = z - (catStepZ ?? 0);
    const d = Math.sqrt(dx * dx + dz * dz);
    const effectiveRadius = K.CROWD_PROX_RADIUS * (1 + (n.userData.spread || 0.4) * 0.5);
    if (d < effectiveRadius) {
      const absorb = n.userData.absorb ?? 0.5;
      occlusionDip += absorb * (1 - d / effectiveRadius) * attenuation;
    }
  }

  _density = Math.min(1, count / SARDINE_COUNT);

  const macroCutoff = K.CROWD_FILTER_MAX + (K.CROWD_FILTER_MIN - K.CROWD_FILTER_MAX) * _density;
  const proxDip = Math.min(1, occlusionDip) * 3000;
  const cutoff = Math.max(K.CROWD_FILTER_MIN, macroCutoff - proxDip);
  const q = K.CROWD_FILTER_Q_MIN + (K.CROWD_FILTER_Q_MAX - K.CROWD_FILTER_Q_MIN) * _density;

  mixer.setCrowdFilter(cutoff, q);

  const wet = K.FLOW_REVERB_MIN + (K.FLOW_REVERB_MAX - K.FLOW_REVERB_MIN) * flow01;
  mixer.setReverbWet(wet);
  mixer.setDroneFlow(flow01);
}
```

**Step 2:** Update the main.js call to pass `catStepZ`:

```javascript
crowd.update(dt, npcs.npcs, cat.headX, cat.stepZ, flow);
```

**Step 3:** Verify by ear + debug overlay.

Play. Steer Bo directly adjacent to a lone shopper. Expected: the music notably darkens. Steer through a gap between two shoppers. Expected: a split-second brightening as you pass between them. Raise flow to max — proximity effect should attenuate noticeably.

**Step 4:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/audio/crowd.js prototypes/pussyphus_prototype/src/main.js
git commit -m "audio: per-NPC proximity occlusion with flow-attenuated intensity"
```

---

## Phase 4 — Foley layer

Goal: subliminal textural accents per NPC. No sample files — Tone.js noise bursts only.

### Task 4.1: Foley bus in mixer

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/audio/mixer.js`

**Step 1:** Add a foley bus parallel to music, bypassing the crowd filter:

```javascript
let foleyBus;
// inside init(), after masterGain:
foleyBus = ctx.createGain();
foleyBus.gain.value = K.FOLEY_MASTER_GAIN;
foleyBus.connect(masterGain);

export function getFoleyBus() { return foleyBus; }
```

**Step 2:** Verify.

```javascript
import('./src/audio/mixer.js').then(m => console.log(!!m.getFoleyBus()));
```
Expected: `true` after init.

**Step 3:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/audio/mixer.js
git commit -m "audio: foley bus — unfiltered parallel to music"
```

### Task 4.2: Foley synthesis

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/audio/crowd.js` (add foley triggering)

**Step 1:** Add a `foley.js` for clarity, or inline — this plan puts it in crowd.js since that's where NPC state is already read per-frame.

Append to `crowd.js`:

```javascript
import * as Tone from 'tone';

const _npcFoley = new Map();  // npc → { lastStepT }

function triggerFoley(type, panX, vel = 1) {
  const ctx = Tone.getContext().rawContext;
  const when = ctx.currentTime;
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, panX * K.FOLEY_PAN_SCALE));
  const g = ctx.createGain();
  g.gain.value = 0;
  panner.connect(g).connect(mixer.getFoleyBus());

  if (type === 'shopper' || type === 'shopper_bag') {
    // Sneaker: filtered noise burst, 200Hz center, 40ms decay
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 200; bp.Q.value = 4;
    noise.connect(bp).connect(panner);
    g.gain.setValueAtTime(0.6 * vel, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
    noise.start(when); noise.stop(when + 0.06);

    if (type === 'shopper_bag' && Math.random() < 0.5) {
      // Bag rustle on off-beat
      const n2 = ctx.createBufferSource();
      n2.buffer = getPinkNoiseBuffer(ctx);
      const bp2 = ctx.createBiquadFilter();
      bp2.type = 'bandpass'; bp2.frequency.value = 3000; bp2.Q.value = 2;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.4, when + 0.12);
      g2.gain.exponentialRampToValueAtTime(0.001, when + 0.26);
      n2.connect(bp2).connect(g2).connect(panner);
      n2.start(when + 0.12); n2.stop(when + 0.3);
    }
  } else if (type === 'phone') {
    // Phone notification: pure sine, C6
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 1046.5;
    osc.connect(panner);
    g.gain.setValueAtTime(0.2, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
    osc.start(when); osc.stop(when + 0.1);
  } else if (type === 'salesrep') {
    // Dress shoe: brighter click
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 6;
    noise.connect(bp).connect(panner);
    g.gain.setValueAtTime(0.8 * vel, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.03);
    noise.start(when); noise.stop(when + 0.05);
  }
}

let _noiseBuf, _pinkBuf;
function getNoiseBuffer(ctx) {
  if (_noiseBuf) return _noiseBuf;
  const len = ctx.sampleRate * 0.2;
  _noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = _noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return _noiseBuf;
}
function getPinkNoiseBuffer(ctx) {
  if (_pinkBuf) return _pinkBuf;
  const len = ctx.sampleRate * 0.3;
  _pinkBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = _pinkBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return _pinkBuf;
}
```

**Step 2:** Call `triggerFoley` on each NPC's step cycle. Inside `update()`:

```javascript
for (const n of npcs) {
  // ... existing proximity logic ...

  // Foley: step every ~0.5s based on swingPhase
  if (d < K.FOLEY_PROX_RANGE * 2) {
    const foleyState = _npcFoley.get(n) || { lastStepT: 0 };
    const now = performance.now() / 1000;
    const stepInterval = 0.5 + (n.userData.type === 'salesrep' ? (Math.random() - 0.5) * 0.15 : 0);
    if (now - foleyState.lastStepT > stepInterval) {
      const ftype = n.userData.hasBag ? 'shopper_bag' : n.userData.type;
      const vel = Math.max(0.2, 1 - d / (K.FOLEY_PROX_RANGE * 2));
      triggerFoley(ftype, dx, vel);
      foleyState.lastStepT = now;
      _npcFoley.set(n, foleyState);
    }
  }
}
```

Also clean up `_npcFoley` of departed NPCs once per second to avoid a map leak — cheap enough to skip for now; note in code.

**Step 3:** Verify by ear.

Play. Expected: a low sneaker patter under the music, picking up with density. Phone zombies chirp occasionally. Sales reps click sharper than shoppers. Bags produce the paper rustle on the off-beat. Nothing individually loud.

If any single foley sound stands out: reduce per-event gain, not the bus gain (the bus is already tuned low).

**Step 4:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/audio/crowd.js
git commit -m "audio: per-NPC synthesized foley — sneakers, phones, dress shoes, bag rustle"
```

---

## Phase 5 — Sampled melodic fragments

Goal: 6–10 short clips, base64-inlined, triggered at flow thresholds.

### Task 5.1: Source or synthesize fragments

**Files:**
- Create: `prototypes/pussyphus_prototype/assets/fragments/` (raw WAV/OGG, not committed if large)
- Create: `prototypes/pussyphus_prototype/src/audio/fragments.generated.js` (base64 strings, generated)

**Step 1:** Create 6 fragments, 1–3 seconds, mono, 22050 Hz, OGG Vorbis q3 or MP3 96kbps. Options:
- Record/synth in a DAW and export.
- Use Tone.js offline rendering to generate them from code (fully deterministic, small, no external assets). Recommended for Phase 5 first pass — we can replace with real recordings later.

Offline-render approach. Create `scripts/render-fragments.mjs`:

```javascript
// Run with: node scripts/render-fragments.mjs
// Generates ogg fragments from Tone.js Offline renders.
// (Requires tone + ffmpeg locally. Outputs to assets/fragments/.)
```

Defer the full script — for the TDD path, stub with 6 silent 1-second buffers so the trigger plumbing can be verified, and swap in real audio later.

**Step 2:** Write `fragments.generated.js` with 6 keys mapping to base64 data URLs. Start with 6 placeholder sines at different pitches so the trigger system is audible.

**Step 3:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/audio/fragments.generated.js
git commit -m "audio: 6 placeholder melodic fragments (to be replaced with real recordings)"
```

### Task 5.2: Fragment trigger engine

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/audio/music.js`

**Step 1:** Load fragments on init:

```javascript
import * as F from './fragments.generated.js';

const fragmentBuffers = {};
async function loadFragments() {
  const ctx = Tone.getContext().rawContext;
  for (const [key, dataUrl] of Object.entries(F.default)) {
    const res = await fetch(dataUrl);
    const arr = await res.arrayBuffer();
    fragmentBuffers[key] = await ctx.decodeAudioData(arr);
  }
}
```

Call `await loadFragments()` in `music.init()`.

**Step 2:** Add `triggerFragment(key)` that plays through the music bus so it shares the crowd filter:

```javascript
export function triggerFragment(key) {
  const buf = fragmentBuffers[key];
  if (!buf) return;
  const ctx = Tone.getContext().rawContext;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.6;
  src.connect(g).connect(musicOut);
  src.start();
}
```

**Step 3:** Trigger on flow threshold crossings from main.js. Track previous flow, fire at each integer crossing above 5:

```javascript
// In main.js, alongside flow update
if (state === 'play') {
  const prev = Math.floor(flowPrev ?? 0);
  const next = Math.floor(flow);
  if (next > prev && next >= 5) {
    const keys = Object.keys(F.default ?? {});
    music.triggerFragment(keys[Math.floor(Math.random() * keys.length)]);
  }
  flowPrev = flow;
}
```

**Step 4:** Verify.

Play and rack up dodges fast. Expected: as flow crosses 5, 6, 7… a fragment plays each time, filtered by the current crowd density. Fragments don't pile up.

**Step 5:** Commit.

```bash
git add prototypes/pussyphus_prototype/src/audio/music.js prototypes/pussyphus_prototype/src/main.js
git commit -m "audio: fragment trigger engine, fires on flow integer thresholds ≥5"
```

### Task 5.3: Update build.sh to inline fragments

**Files:**
- Modify: `prototypes/pussyphus_prototype/build.sh`

**Step 1:** Read current build.sh, understand its pipeline. If it already inlines source modules, fragments.generated.js will be inlined automatically. No change needed beyond confirming file size is still <1MB target.

**Step 2:** Run build and verify the output HTML still opens and plays audio.

```bash
cd prototypes/pussyphus_prototype
./build.sh
```

**Step 3:** Commit if any build tweaks were needed.

---

## Phase 6 — Tuning pass

Goal: play for 30 minutes across multiple sessions. Adjust constants, never the architecture.

### Task 6.1: Tuning log

**Files:**
- Create: `docs/notes/2026-04-audio-tuning.md`

**Step 1:** Log every constant change with rationale as you play. Format:

```markdown
## 2026-04-14 session 1
- CROWD_FILTER_MIN: 800 → 600. At sardine density music was still too present; needed more submersion.
- FOLEY_MASTER_GAIN: 0.15 → 0.10. Sneakers were becoming noticeable individually on quiet belts.
```

**Step 2:** After each session, commit constants + log together:

```bash
git add prototypes/pussyphus_prototype/src/constants.js docs/notes/2026-04-audio-tuning.md
git commit -m "audio: tuning pass N — <summary>"
```

### Task 6.2: Preflight update

**Files:**
- Modify: `preflight.sh`

**Step 1:** Add the three new audio modules to `EXPECTED_MODULES`:

```bash
"src/audio/mixer.js"
"src/audio/music.js"
"src/audio/crowd.js"
"src/audio/fragments.generated.js"
```

**Step 2:** Run `./preflight.sh`. Expected: all new modules green.

**Step 3:** Commit.

```bash
git add preflight.sh
git commit -m "preflight: track new audio modules"
```

---

## Final Integration Checklist

Before merging `feat/audio-system` → `main`:

1. `./preflight.sh` → 0 failed.
2. `./build.sh` → single HTML opens cleanly, audio works.
3. 30-minute listening session with debug overlay off. No pops, no clicks, no stuck filter, no looping feel in the music, no individual foley sound standing out.
4. Flow 0 → 15 sweep: music opens up audibly, reverb lengthens, proximity occlusion fades.
5. Density 0 → sardine sweep: music muffles convincingly, doesn't disappear.
6. Mobile Safari smoke test (iOS autoplay is strict). AudioContext starts on first touch.
7. CHANGELOG.md updated with v0.5 entry.

---

## Remember
- Commit after every subtask. "Audio broke" is much easier to bisect with small commits.
- Every constant change lives in `constants.js` — never hardcode in module bodies.
- No module reaches into another's internals. `crowd.js` does not touch AudioNodes; it goes through `mixer.set*()`.
- The escalator does not stop. The drone never turns off, even on title screen and after collisions.
- Ear-verify every phase checkpoint before continuing. Audio bugs compound fast.
