// ════════════════════════════════════════
// CROWD — per-frame NPC acoustic analysis, drives mixer filter + foley
// Reads npcs array, computes macro density + per-NPC proximity occlusion,
// triggers per-NPC foley (sneakers, phone chirps, dress clicks, bag rustle).
// ════════════════════════════════════════
import * as Tone from 'tone';
import * as K from '../constants.js';
import * as mixer from './mixer.js';

const SARDINE_COUNT = 8;
let _density = 0;
let _occlusion = 0;
let _lastCutoff = K.CROWD_FILTER_MAX;

// Per-NPC foley state — tracks last step time per NPC.
const _npcFoley = new WeakMap();
let _foleyCleanupT = 0;

export function init() { /* no-op */ }

/**
 * Called every frame from main.js with the live npcs array, cat position,
 * and current flow. Drives mixer's filter/reverb/drone params.
 */
export function update(dt, npcs, catHeadX, catStepZ, flow) {
  if (!mixer.isStarted()) return;

  let count = 0;
  let occlusionDip = 0;
  const flow01 = Math.min(1, flow / 15);
  const attenuation = 1 - flow01 * K.FLOW_OCCLUSION_ATTEN;

  for (const n of npcs) {
    const z = n.userData.beltZ;
    if (z > -3.5 && z < 1.5) count++;

    // Proximity occlusion: each nearby body subtracts cutoff
    const dx = n.userData.lane - catHeadX;
    const dz = z - (catStepZ ?? 0);
    const d = Math.sqrt(dx * dx + dz * dz);
    const effectiveRadius = K.CROWD_PROX_RADIUS * (1 + (n.userData.spread ?? 0.4) * 0.5);
    if (d < effectiveRadius) {
      const absorb = n.userData.absorb ?? 0.5;
      occlusionDip += absorb * (1 - d / effectiveRadius) * attenuation;
    }

    // Foley: nearby NPCs trigger stepping sounds on a per-NPC cadence
    if (d < K.FOLEY_PROX_RANGE * 2) {
      let fs = _npcFoley.get(n);
      if (!fs) { fs = { lastStepT: 0 }; _npcFoley.set(n, fs); }
      const now = performance.now() / 1000;
      const stepInterval = 0.5 + (n.userData.type === 'salesrep'
        ? (Math.random() - 0.5) * 0.15
        : (Math.random() - 0.5) * 0.08);
      if (now - fs.lastStepT > stepInterval) {
        const ftype = n.userData.hasBag ? 'shopper_bag' : n.userData.type;
        const vel = Math.max(0.2, 1 - d / (K.FOLEY_PROX_RANGE * 2));
        triggerFoley(ftype, dx, vel);
        fs.lastStepT = now;
      }
    }
  }

  _density = Math.min(1, count / SARDINE_COUNT);
  _occlusion = Math.min(1, occlusionDip);

  // Macro cutoff from density, then dip further for per-NPC occlusion.
  const macroCutoff = K.CROWD_FILTER_MAX + (K.CROWD_FILTER_MIN - K.CROWD_FILTER_MAX) * _density;
  const proxDip = _occlusion * 3000;
  const cutoff = Math.max(K.CROWD_FILTER_MIN, macroCutoff - proxDip);
  const q = K.CROWD_FILTER_Q_MIN + (K.CROWD_FILTER_Q_MAX - K.CROWD_FILTER_Q_MIN) * _density;
  _lastCutoff = cutoff;

  mixer.setCrowdFilter(cutoff, q);

  const wet = K.FLOW_REVERB_MIN + (K.FLOW_REVERB_MAX - K.FLOW_REVERB_MIN) * flow01;
  mixer.setReverbWet(wet);
  mixer.setDroneFlow(flow01);

  // Weak-map cleanup is automatic but clear local clock occasionally.
  _foleyCleanupT += dt;
  if (_foleyCleanupT > 5) _foleyCleanupT = 0;
}

export function reset() {
  _density = 0;
  _occlusion = 0;
}

// ══════════════ Foley synthesis ══════════════
// All foley is Web Audio noise/osc bursts — no sample files.

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

function triggerFoley(type, panX, vel = 1) {
  const bus = mixer.getFoleyBus();
  if (!bus) return;
  const ctx = Tone.getContext().rawContext;
  const when = ctx.currentTime;

  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, panX * K.FOLEY_PAN_SCALE));
  const g = ctx.createGain();
  g.gain.value = 0;
  panner.connect(g).connect(bus);

  if (type === 'shopper' || type === 'shopper_bag') {
    // Sneaker: filtered noise burst, 200Hz center, ~40ms decay
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 200; bp.Q.value = 4;
    noise.connect(bp).connect(panner);
    g.gain.setValueAtTime(0.6 * vel, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
    noise.start(when); noise.stop(when + 0.06);

    if (type === 'shopper_bag' && Math.random() < 0.5) {
      // Bag rustle on off-beat — pink noise, brighter band
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
    // Phone notification: pure sine, C6 — rare but recognizable
    if (Math.random() > 0.15) return;  // most steps silent
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 1046.5;
    osc.connect(panner);
    g.gain.setValueAtTime(0.2, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
    osc.start(when); osc.stop(when + 0.1);
  } else if (type === 'salesrep') {
    // Dress shoe: brighter, tighter click
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

export const _debug = {
  get density() { return _density; },
  get occlusion() { return _occlusion; },
  get cutoff() { return _lastCutoff; },
};
