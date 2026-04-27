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

// ── MallFM gain scales ──
let _clatterGainScale = 1;  // multiplier applied to CLATTER_GAIN by MallFM
let _pawGainScale = 1;      // multiplier applied to PAW_GAIN by MallFM

// ── Noise buffer ──────────────────────────────────
function _createNoiseBuffer(seconds) {
  const len = Math.ceil(_ctx.sampleRate * seconds);
  const buf = _ctx.createBuffer(1, len, _ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

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
  env.gain.setValueAtTime(K.CLATTER_GAIN * _clatterGainScale, when);
  env.gain.exponentialRampToValueAtTime(0.001, when + K.CLATTER_DURATION);

  src.connect(bp).connect(env).connect(_foleyBus);
  src.start(when);
  src.stop(when + K.CLATTER_DURATION + 0.01);
}

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
  const vol = K.PAW_GAIN * _pawGainScale * (0.7 + 0.3 * flow01);
  env.gain.setValueAtTime(vol, when);
  env.gain.exponentialRampToValueAtTime(0.001, when + K.PAW_DURATION);

  src.connect(bp).connect(env).connect(_foleyBus);
  src.start(when);
  src.stop(when + K.PAW_DURATION + 0.01);
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

// ── Per-frame update ──────────────────────────────
// Called every frame from main.js:
//   foley.update(dt, flow / K.FLOW_MAX, beltSpeed)
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

// ── Paw step trigger ──────────────────────────────
// Called from catAnim.js at walk-cycle zero-crossings.
export function triggerPawStep(flow01) {
  if (!_ctx || _ctx.state === 'suspended') return;
  const now = _ctx.currentTime;

  // Jitter: at low flow, the step lands slightly early/late
  const jitterRange = K.PAW_JITTER_MAX * (1 - flow01);
  const jitter = (Math.random() * 2 - 1) * jitterRange * 0.02;
  const when = now + K.PAW_SCHEDULE_AHEAD + jitter;

  _firePawStep(Math.max(when, now + 0.001), flow01);
}

export function reset() {
  _nextClatterTime = _ctx ? _ctx.currentTime + 0.5 : 0;
}

// ── MallFM gain setters ──────────────────────────
export function setClatterGain(v) { _clatterGainScale = Math.max(0, v); }
export function setPawGain(v) { _pawGainScale = Math.max(0, v); }
export function setFluorGain(scale) {
  const bases = [K.FLUOR_GAIN_60, K.FLUOR_GAIN_120, K.FLUOR_GAIN_180];
  _fluorGains.forEach((g, i) => {
    if (!g) return;
    const now = _ctx.currentTime;
    g.gain.setTargetAtTime(bases[i] * Math.max(0, scale), now, 0.05);
  });
}
