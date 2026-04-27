// ════════════════════════════════════════
// MIXER — AudioContext, master bus, filter chain, reverb, drone, foley bus
// Routing:
//   [music] → [crowd lowpass] → [reverb send]    ↘
//                              → [dry path]       → [master] → destination
//   [foley] → [master]       (bypasses crowd filter — diegetic foreground)
//   [drone] → [master]       (always-on escalator throb, bypasses crowd)
// ════════════════════════════════════════
import * as Tone from 'tone';
import * as K from '../constants.js';

let started = false;
let masterGain, musicBus, foleyBus, crowdFilter, reverb, reverbWet;
let _drone = null;
let _droneGain = null;
let _droneBaseA = 0;         // anchor freq for oscA; oscB = baseA + beatHz
let _droneBeatHz = 0;        // detune between oscA/oscB; drives psychoacoustic throb
let _labFrozen = false;      // when true, crowd.js no-ops so MallFM sliders hold
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

  // Foley — parallel to music, bypasses crowd filter. Sneakers, phone chirps,
  // bag rustle. Already perceptually "near" so it shouldn't be acoustically
  // occluded the same way music is.
  foleyBus = ctx.createGain();
  foleyBus.gain.value = K.FOLEY_MASTER_GAIN;
  foleyBus.connect(masterGain);

  // Drone — two detuned sines, beat frequency ~3Hz. Diegetic to Bo, always on.
  const droneGain = ctx.createGain();
  droneGain.gain.value = K.DRONE_GAIN;
  droneGain.connect(masterGain);

  _droneBaseA = K.DRONE_FREQ_A;
  _droneBeatHz = K.DRONE_FREQ_B - K.DRONE_FREQ_A;

  const oscA = ctx.createOscillator();
  oscA.type = 'sine';
  oscA.frequency.value = _droneBaseA;
  oscA.connect(droneGain);
  oscA.start();

  const oscB = ctx.createOscillator();
  oscB.type = 'sine';
  oscB.frequency.value = _droneBaseA + _droneBeatHz;
  oscB.connect(droneGain);
  oscB.start();

  _drone = { oscA, oscB, gain: droneGain };
  _droneGain = droneGain;
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

// Called by crowd.js every frame. Gated by _labFrozen so MallFM sliders
// aren't stomped during auditioning. MallFM uses labSetCrowdFilter instead.
export function setCrowdFilter(cutoff, q) {
  if (!crowdFilter || _labFrozen) return;
  const now = Tone.getContext().rawContext.currentTime;
  crowdFilter.frequency.setTargetAtTime(cutoff, now, 1 / K.CROWD_FILTER_SMOOTH);
  crowdFilter.Q.setTargetAtTime(q, now, 1 / K.CROWD_FILTER_SMOOTH);
}

export function setReverbWet(wet) {
  if (!reverbWet || _labFrozen) return;
  const now = Tone.getContext().rawContext.currentTime;
  reverbWet.gain.setTargetAtTime(wet, now, 0.3);
}

export function setDroneFlow(flow01) {
  if (!_drone || _labFrozen) return;
  const now = Tone.getContext().rawContext.currentTime;
  const a = _droneBaseA + flow01 * K.DRONE_FLOW_FREQ_SHIFT;
  _drone.oscA.frequency.setTargetAtTime(a, now, 0.5);
  _drone.oscB.frequency.setTargetAtTime(a + _droneBeatHz, now, 0.5);
}

// ── Lab setters (MallFM) ──
// Always write, even when frozen — these represent a deliberate user action.

export function setLabFrozen(on) { _labFrozen = !!on; }
export function isLabFrozen() { return _labFrozen; }

export function labSetCrowdFilter(cutoff, q) {
  if (!crowdFilter) return;
  const now = Tone.getContext().rawContext.currentTime;
  crowdFilter.frequency.setTargetAtTime(cutoff, now, 0.1);
  crowdFilter.Q.setTargetAtTime(q, now, 0.1);
}

export function labSetReverbWet(wet) {
  if (!reverbWet) return;
  const now = Tone.getContext().rawContext.currentTime;
  reverbWet.gain.setTargetAtTime(wet, now, 0.1);
}

export function setMasterGain(v) {
  if (!masterGain) return;
  const now = Tone.getContext().rawContext.currentTime;
  masterGain.gain.setTargetAtTime(v, now, 0.05);
}

export function setMusicBusGain(v) {
  if (!musicBus) return;
  const now = Tone.getContext().rawContext.currentTime;
  musicBus.gain.setTargetAtTime(v, now, 0.05);
}

export function setFoleyBusGain(v) {
  if (!foleyBus) return;
  const now = Tone.getContext().rawContext.currentTime;
  foleyBus.gain.setTargetAtTime(v, now, 0.05);
}

export function setDroneGain(v) {
  if (!_droneGain) return;
  const now = Tone.getContext().rawContext.currentTime;
  _droneGain.gain.setTargetAtTime(v, now, 0.05);
}

// Sets the beat-frequency detune between the two drone sines. 0 = pure tone
// (no throb), 3 = default, 12 = fast flutter. Anchor stays at _droneBaseA.
export function setDroneBeatHz(hz) {
  if (!_drone) return;
  _droneBeatHz = Math.max(0, hz);
  const now = Tone.getContext().rawContext.currentTime;
  _drone.oscB.frequency.setTargetAtTime(
    _drone.oscA.frequency.value + _droneBeatHz, now, 0.1);
}

export function getMusicBus() { return musicBus; }
export function getMasterBus() { return masterGain; }
export function getFoleyBus() { return foleyBus; }
export function isStarted() { return started; }

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

export function update(_dt) { /* reserved */ }
export function reset() { /* reserved — drone persists across resets */ }

// Debug accessors — used by ?audioDebug=1 overlay, not game code.
export const _debug = {
  get filterFreq() { return crowdFilter?.frequency.value; },
  get filterQ() { return crowdFilter?.Q.value; },
  get reverbWet() { return reverbWet?.gain.value; },
};
