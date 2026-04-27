# Foley Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract step clatter, paw steps, and fluorescent hum from the Phase 1 standalone audio module and integrate them into the existing Tone.js mixer architecture as `src/audio/foley.js`.

**Architecture:** New ES module at `src/audio/foley.js` receives bus refs from mixer at init time. Transients (clatter, paw steps) route to `foleyBus` (bypasses crowd filter — correct for diegetic foreground). Fluorescent hum routes to `masterBus` (persistent ambient, same as drone). Uses shared `Tone.getContext().rawContext`. Walk cycle zero-crossings in catAnim.js fire paw step triggers.

**Tech Stack:** Web Audio API via Tone.js shared context, ES modules, constants.js tuning pattern.

**Design doc:** `docs/plans/2026-04-27-foley-integration-design.md`

---

### Task 1: Add foley constants to constants.js

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/constants.js:141-144` (expand existing `// ── Audio — foley ──` section)

**Step 1: Add clatter, paw, and fluorescent constants**

Insert after line 144 (`export const FOLEY_PAN_SCALE = 0.8;`):

```js
// ── Audio — foley: step clatter ──
export const CLATTER_DURATION = 0.020;        // seconds (20ms noise burst)
export const CLATTER_FILTER_FREQ = 3000;      // Hz — bandpass center
export const CLATTER_FILTER_Q = 2.5;
export const CLATTER_GAIN = 0.12;
export const CLATTER_JITTER_MAX = 0.15;       // ±15% timing jitter at zero flow
export const CLATTER_STEP_LENGTH = 0.4;       // meters — escalator step depth
export const CLATTER_SCHEDULE_AHEAD = 0.05;   // seconds — look-ahead window

// ── Audio — foley: paw steps (Bo) ──
export const PAW_DURATION = 0.008;            // seconds (8ms — lighter than clatter)
export const PAW_FILTER_FREQ = 1500;          // Hz — bandpass center
export const PAW_FILTER_Q = 3.0;
export const PAW_GAIN = 0.10;
export const PAW_JITTER_MAX = 0.12;           // timing irregularity at zero flow
export const PAW_SCHEDULE_AHEAD = 0.05;       // seconds

// ── Audio — foley: fluorescent hum ──
export const FLUOR_FREQ = 60;                 // Hz — mains fundamental
export const FLUOR_GAIN_60 = 0.015;
export const FLUOR_GAIN_120 = 0.008;
export const FLUOR_GAIN_180 = 0.004;
```

**Step 2: Verify no name collisions**

Run: search `constants.js` for `CLATTER_`, `PAW_`, `FLUOR_` — should only appear in the block just added. No existing constants use these prefixes.

**Step 3: Commit**

```bash
git add prototypes/pussyphus_prototype/src/constants.js
git commit -m "feat(audio): add clatter, paw step, and fluorescent hum constants"
```

---

### Task 2: Create foley.js — noise buffer + fluorescent hum

**Files:**
- Create: `prototypes/pussyphus_prototype/src/audio/foley.js`

**Step 1: Create the module skeleton with noise buffer and fluorescent hum**

```js
// ════════════════════════════════════════
// FOLEY — escalator clatter, Bo's paw steps, fluorescent hum
// Routing:
//   [clatter / paw steps] → foleyBus (bypasses crowd filter — diegetic foreground)
//   [fluorescent hum]     → masterBus (persistent ambient, same routing as drone)
// ════════════════════════════════════════
import * as K from '../constants.js';
import * as Tone from 'tone';

let _foleyBus = null;   // transients route here
let _masterBus = null;  // fluorescent hum routes here
let _ctx = null;        // raw AudioContext
let _noiseBuffer = null; // shared white noise, reused by all transients
let _started = false;

// ── Fluorescent hum nodes (persistent, always on) ──
let _fluorOscs = [];    // [osc60, osc120, osc180]
let _fluorGains = [];   // gain nodes for MallFM control

// ── Step clatter scheduling state ──
let _nextClatterTime = 0;

// ── Paw step state ──
let _prevW = 0;         // previous walk sine value, for zero-crossing detection

// ── Noise buffer ──────────────────────────────────
function _createNoiseBuffer(seconds) {
  const len = Math.ceil(_ctx.sampleRate * seconds);
  const buf = _ctx.createBuffer(1, len, _ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// ── Init ──────────────────────────────────────────
export function init(foleyBus, masterBus) {
  if (_started) return;
  _started = true;
  _foleyBus = foleyBus;
  _masterBus = masterBus;
  _ctx = Tone.getContext().rawContext;

  // Shared noise buffer — 0.1s, longer than any transient
  _noiseBuffer = _createNoiseBuffer(0.1);

  // Fluorescent hum: 60Hz + 120Hz + 180Hz, always on, routes to masterBus
  const harmonics = [
    { freq: K.FLUOR_FREQ,     gain: K.FLUOR_GAIN_60  },
    { freq: K.FLUOR_FREQ * 2, gain: K.FLUOR_GAIN_120 },
    { freq: K.FLUOR_FREQ * 3, gain: K.FLUOR_GAIN_180 },
  ];
  harmonics.forEach(({ freq, gain }) => {
    const osc = _ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = _ctx.createGain();
    g.gain.value = gain;
    osc.connect(g).connect(_masterBus);
    osc.start();
    _fluorOscs.push(osc);
    _fluorGains.push(g);
  });

  // Seed first clatter event slightly in the future
  _nextClatterTime = _ctx.currentTime + 0.5;
}

export function update(dt, flow01, beltSpeed) {
  // placeholder — Task 3 fills this in
}

export function triggerPawStep(flow01) {
  // placeholder — Task 4 fills this in
}

export function reset() {
  _nextClatterTime = _ctx ? _ctx.currentTime + 0.5 : 0;
  _prevW = 0;
}

// ── MallFM gain setters ──────────────────────────
export function setClatterGain(v) { /* Task 5 */ }
export function setPawGain(v) { /* Task 5 */ }
export function setFluorGain(v) {
  _fluorGains.forEach(g => {
    if (!g) return;
    const now = _ctx.currentTime;
    g.gain.setTargetAtTime(g.gain.value * v, now, 0.05);
  });
}
```

**Step 2: Verify syntax**

Open `prototypes/pussyphus_prototype/` in browser. Console should show no import errors from foley.js (it isn't imported yet, but the file should be valid ES module syntax — we'll import in Task 6).

**Step 3: Commit**

```bash
git add prototypes/pussyphus_prototype/src/audio/foley.js
git commit -m "feat(audio): foley module skeleton — noise buffer + fluorescent hum"
```

---

### Task 3: Implement step clatter scheduling in foley.update()

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/audio/foley.js` — replace `update()` placeholder

**Step 1: Implement the clatter fire function**

Add before `export function update(...)`:

```js
// ── Step clatter (transient) ──────────────────────
// Noise burst → bandpass @ 3kHz → gain envelope. Fires rhythmically
// at beltSpeed / stepLength rate. Jitter decreases with flow.
function _fireClatter(when) {
  const src = _ctx.createBufferSource();
  src.buffer = _noiseBuffer;

  const bp = _ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = K.CLATTER_FILTER_FREQ;
  bp.Q.value = K.CLATTER_FILTER_Q;

  const env = _ctx.createGain();
  env.gain.setValueAtTime(K.CLATTER_GAIN, when);
  env.gain.exponentialRampToValueAtTime(0.001, when + K.CLATTER_DURATION);

  src.connect(bp).connect(env).connect(_foleyBus);
  src.start(when);
  src.stop(when + K.CLATTER_DURATION + 0.01);
}
```

**Step 2: Implement the scheduling loop in update()**

Replace the `update()` placeholder:

```js
export function update(dt, flow01, beltSpeed) {
  if (!_ctx || _ctx.state === 'suspended') return;
  const now = _ctx.currentTime;

  // ── Step clatter scheduling ──
  if (beltSpeed > 0.01) {
    const baseInterval = K.CLATTER_STEP_LENGTH / beltSpeed;

    while (_nextClatterTime < now + K.CLATTER_SCHEDULE_AHEAD + baseInterval) {
      const jitterRange = K.CLATTER_JITTER_MAX * (1 - flow01);
      const jitter = (Math.random() * 2 - 1) * jitterRange;
      const actualTime = _nextClatterTime + baseInterval * jitter;

      if (actualTime > now) {
        _fireClatter(actualTime);
      }
      _nextClatterTime += baseInterval;
    }
  }
}
```

**Step 3: Verify mentally**

The scheduling loop is a direct port from `PussyphusAudio.update()` in `pussyphus_audio_phase1.js` (lines 254-278). Key differences: uses `K.CLATTER_*` constants instead of `A.*`, routes to `_foleyBus` instead of `masterGain`, receives pre-normalized `flow01` instead of raw flow.

**Step 4: Commit**

```bash
git add prototypes/pussyphus_prototype/src/audio/foley.js
git commit -m "feat(audio): step clatter scheduling in foley.update()"
```

---

### Task 4: Implement paw step transients in foley.triggerPawStep()

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/audio/foley.js` — replace `triggerPawStep()` placeholder

**Step 1: Implement the paw step fire function**

Add before `export function triggerPawStep(...)`:

```js
// ── Paw step (transient) ──────────────────────────
// Lighter, higher, shorter than clatter. Bo's feet on metal.
// Volume scales 70%→100% with flow (careful → confident).
function _firePawStep(when, flow01) {
  const src = _ctx.createBufferSource();
  src.buffer = _noiseBuffer;

  const bp = _ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = K.PAW_FILTER_FREQ;
  bp.Q.value = K.PAW_FILTER_Q;

  const env = _ctx.createGain();
  const vol = K.PAW_GAIN * (0.7 + 0.3 * flow01);
  env.gain.setValueAtTime(vol, when);
  env.gain.exponentialRampToValueAtTime(0.001, when + K.PAW_DURATION);

  src.connect(bp).connect(env).connect(_foleyBus);
  src.start(when);
  src.stop(when + K.PAW_DURATION + 0.01);
}
```

**Step 2: Replace the triggerPawStep placeholder**

```js
export function triggerPawStep(flow01) {
  if (!_ctx || _ctx.state === 'suspended') return;
  const now = _ctx.currentTime;

  // Jitter: at low flow, the step lands slightly early/late
  const jitterRange = K.PAW_JITTER_MAX * (1 - flow01);
  const jitter = (Math.random() * 2 - 1) * jitterRange * 0.02;
  const when = now + K.PAW_SCHEDULE_AHEAD + jitter;

  _firePawStep(Math.max(when, now + 0.001), flow01);
}
```

**Step 3: Commit**

```bash
git add prototypes/pussyphus_prototype/src/audio/foley.js
git commit -m "feat(audio): paw step transients in foley.triggerPawStep()"
```

---

### Task 5: Add MallFM gain control helpers

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/audio/foley.js` — fill in `setClatterGain` and `setPawGain` stubs

**Step 1: Add private gain tracking variables**

Add to the module state block (near `let _fluorGains`):

```js
let _clatterGainScale = 1;  // multiplier applied to CLATTER_GAIN by MallFM
let _pawGainScale = 1;      // multiplier applied to PAW_GAIN by MallFM
```

**Step 2: Implement the setters**

Replace the stub `setClatterGain` and `setPawGain`:

```js
export function setClatterGain(v) { _clatterGainScale = Math.max(0, v); }
export function setPawGain(v) { _pawGainScale = Math.max(0, v); }
```

**Step 3: Apply the scale in _fireClatter and _firePawStep**

In `_fireClatter`, change the gain line:

```js
  env.gain.setValueAtTime(K.CLATTER_GAIN * _clatterGainScale, when);
```

In `_firePawStep`, change the vol line:

```js
  const vol = K.PAW_GAIN * _pawGainScale * (0.7 + 0.3 * flow01);
```

**Step 4: Fix setFluorGain to use absolute scaling**

Replace the `setFluorGain` function with a version that scales relative to the original constant values rather than current gain (which would compound):

```js
export function setFluorGain(scale) {
  const bases = [K.FLUOR_GAIN_60, K.FLUOR_GAIN_120, K.FLUOR_GAIN_180];
  _fluorGains.forEach((g, i) => {
    if (!g) return;
    const now = _ctx.currentTime;
    g.gain.setTargetAtTime(bases[i] * Math.max(0, scale), now, 0.05);
  });
}
```

**Step 5: Commit**

```bash
git add prototypes/pussyphus_prototype/src/audio/foley.js
git commit -m "feat(audio): foley gain setters for MallFM control"
```

---

### Task 6: Wire foley into main.js

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/main.js:22` (imports) and `unlockAndStart()` and game loop

**Step 1: Add the import**

After line 21 (`import * as shepard from './audio/shepard.js';`), add:

```js
import * as foley from './audio/foley.js';
```

**Step 2: Init foley in unlockAndStart()**

In `unlockAndStart()`, after `shepard.init(mixer.getMasterBus());` (line 77), add:

```js
      foley.init(mixer.getFoleyBus(), mixer.getMasterBus());
```

**Step 3: Update foley in the game loop**

In `loop()`, after `shepard.update(dt);` (line 151), add:

```js
  // Foley — clatter scheduling, driven by belt speed and flow.
  const flow01 = flow / K.FLOW_MAX;
  foley.update(dt, flow01, beltSpeed);
```

**Step 4: Add foley.reset() to start()**

In `start()`, after `input.reset();` (line 57), add:

```js
  foley.reset();
```

**Step 5: Verify in browser**

Open the prototype. Click to start. You should hear:
- Fluorescent hum immediately (60Hz + harmonics, very quiet — subliminal)
- Step clatter at a rhythm matching the belt speed (~4 clicks/sec at default speed)
- Clatter jitter should be noticeable at low flow, tightening as flow builds

No paw steps yet — those wire through catAnim.js in Task 7.

**Step 6: Commit**

```bash
git add prototypes/pussyphus_prototype/src/main.js
git commit -m "feat(audio): wire foley init/update/reset into main.js"
```

---

### Task 7: Wire paw step trigger into catAnim.js

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/cat/catAnim.js:1-9` (imports) and walk cycle section

**Step 1: Add the import**

After line 1 (`import * as K from '../constants.js';`), add:

```js
import * as foley from '../audio/foley.js';
```

**Step 2: Add zero-crossing state**

After line 19 (`const _tailOff = { dx: 0, dy: 0, dz: 0 };`), add:

```js
let _prevWSign = 1;  // track walk sine sign for zero-crossing detection
```

**Step 3: Add zero-crossing detection after the walk sine**

The walk sine is computed at line 117-118:
```js
  const wt = t * (3 + Math.abs(headX - cat.buttX) * 30);
  const w = Math.sin(wt);
```

After `const w = Math.sin(wt);` (line 118), add:

```js
  // Paw step trigger — fire at zero-crossings of walk sine (paw contacts step surface)
  const wSign = w >= 0 ? 1 : -1;
  if (wSign !== _prevWSign) {
    foley.triggerPawStep(cat.flow01 ?? 0);
  }
  _prevWSign = wSign;
```

**Step 4: Expose flow01 from cat.js**

The `cat.js` module doesn't currently expose a normalized flow value. We need catAnim.js to know the current flow. Two options:

Option A: catAnim.js imports from main.js — creates circular dependency, bad.
Option B: cat.js stores and exposes `flow01` — clean, follows existing pattern.

Modify `prototypes/pussyphus_prototype/src/cat/cat.js`:

Find where `updateSpringChain` receives and uses `flow`:

```js
export function updateSpringChain(dt, lateralTarget, stepTarget, frontStepY, backStepY, flow) {
```

After `const flowT = flow / K.FLOW_MAX;` (or wherever flowT is computed), add:

```js
  _flow01 = flowT;
```

Add to module state:

```js
let _flow01 = 0;
```

Add export:

```js
export function getFlow01() { return _flow01; }
```

Then in catAnim.js, change the trigger line to:

```js
    foley.triggerPawStep(cat.getFlow01());
```

**Step 5: Verify in browser**

Start the game and move Bo laterally. You should hear:
- Lighter, higher clicks (1.5kHz) synced to leg movement
- Volume 70% at low flow, 100% at max flow
- Slight timing jitter at low flow

Paw steps and clatter should drift independently — no quantized lock.

**Step 6: Commit**

```bash
git add prototypes/pussyphus_prototype/src/cat/catAnim.js
git add prototypes/pussyphus_prototype/src/cat/cat.js
git commit -m "feat(audio): paw step trigger from walk cycle zero-crossing"
```

---

### Task 8: Add foley controls to MallFM panel

**Files:**
- Modify: `prototypes/pussyphus_prototype/src/ui/mallfm.js`

**Step 1: Import foley module**

After line 13 (`import * as shepard from '../audio/shepard.js';`), add:

```js
import * as foley from '../audio/foley.js';
```

**Step 2: Add foley gain sliders to the panel HTML**

In `buildPanelHTML()`, find the existing Foley section (lines 204-209):

```html
    <div class="mf-section">
      <h4>Foley</h4>
      <div class="mf-btnrow" id="mf-foley-btns">
        ${FOLEY_TYPES.map(t => `<button data-foley="${t}">${t}</button>`).join('')}
      </div>
    </div>
```

Replace it with:

```html
    <div class="mf-section">
      <h4>Foley</h4>
      ${rangeRow('mf-clatter', 'CLATTER', 0, 3, 0.05, 1)}
      ${rangeRow('mf-paw',     'PAW',     0, 3, 0.05, 1)}
      ${rangeRow('mf-fluor',   'FLUOR',   0, 3, 0.05, 1)}
      <div class="mf-btnrow" id="mf-foley-btns">
        ${FOLEY_TYPES.map(t => `<button data-foley="${t}">${t}</button>`).join('')}
      </div>
    </div>
```

The range 0–3 allows boosting above default for tuning, with 1.0 as the "design default."

**Step 3: Wire the new sliders in wireControls()**

After the Shepard bindings (line 254-255), add:

```js
  // Foley layer gains
  bindRange('mf-clatter', v => foley.setClatterGain(v));
  bindRange('mf-paw',     v => foley.setPawGain(v));
  bindRange('mf-fluor',   v => foley.setFluorGain(v));
```

**Step 4: Verify in browser**

Open MallFM panel. The Foley section should now show three sliders (CLATTER, PAW, FLUOR) plus the existing trigger buttons. Drag each slider — clatter and paw volume should scale live, fluorescent hum should fade in/out.

**Step 5: Commit**

```bash
git add prototypes/pussyphus_prototype/src/ui/mallfm.js
git commit -m "feat(ui): add clatter/paw/fluor gain sliders to MallFM panel"
```

---

### Task 9: Folder cleanup — archive phase files, delete duplicates

**Files:**
- Move to `prototypes/archive/`: `pussyphus_audio_phase1.js`, `INTEGRATION.md`, `pussyphus_audio_test.html`
- Delete: `pussyphus-notes copy.md` (duplicate of `pussyphus-notes.md`)

**Step 1: Create the archive moves**

```bash
cd "Games - Bo Pussyphus"
git mv pussyphus_audio_phase1.js prototypes/archive/pussyphus_audio_phase1.js
git mv INTEGRATION.md prototypes/archive/INTEGRATION.md
git mv pussyphus_audio_test.html prototypes/archive/pussyphus_audio_test.html
```

**Step 2: Delete the duplicate notes file**

```bash
git rm "pussyphus-notes copy.md"
```

**Step 3: Verify archive contents**

```bash
ls prototypes/archive/
```

Should show the three newly archived files alongside any existing archive contents.

**Step 4: Verify no dangling references**

Search active source files for `pussyphus_audio_phase1`, `INTEGRATION.md`, `pussyphus_audio_test`:

```bash
grep -r "pussyphus_audio_phase1\|pussyphus_audio_test\|INTEGRATION.md" prototypes/pussyphus_prototype/src/
```

Expected: zero matches. These files were standalone; no module imports them.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: archive phase 1 audio files, delete duplicate notes"
```

---

### Task 10: Verify integration end-to-end

**Step 1: Run preflight.sh**

```bash
./preflight.sh
```

Should pass all checks — no stale references, no missing modules.

**Step 2: Open prototype in browser**

Serve from `prototypes/pussyphus_prototype/` and verify:

1. **Fluorescent hum** — audible immediately on start (very quiet 60Hz + harmonics). Constant. Doesn't change with gameplay.
2. **Step clatter** — rhythmic metallic clicks matching belt speed. At low flow: sloppy timing. At high flow: tight, mechanical.
3. **Paw steps** — lighter clicks synced to Bo's walk animation. Louder as flow increases (70%→100%).
4. **No double drone** — only the existing mixer.js 55/58Hz drone, not the Phase 1 motor drone (which was deliberately omitted).
5. **MallFM panel** — CLATTER, PAW, FLUOR sliders work. Existing foley trigger buttons still work.
6. **No console errors** — clean load, no import failures.

**Step 3: Test reset**

Let flow build, then collide to reset flow. Clatter jitter should loosen back up. Paw step volume should decrease. Fluorescent hum unchanged.

**Step 4: Commit any fixes, then final commit**

If everything's clean:

```bash
git add -A
git commit -m "feat(audio): foley integration complete — clatter, paw steps, fluorescent hum"
```
