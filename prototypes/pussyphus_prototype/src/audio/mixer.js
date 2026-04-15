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

  _drone = { oscA, oscB, gain: droneGain };
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

export function setDroneFlow(flow01) {
  if (!_drone) return;
  const now = Tone.getContext().rawContext.currentTime;
  _drone.oscA.frequency.setTargetAtTime(
    K.DRONE_FREQ_A + flow01 * K.DRONE_FLOW_FREQ_SHIFT, now, 0.5);
  _drone.oscB.frequency.setTargetAtTime(
    K.DRONE_FREQ_B + flow01 * K.DRONE_FLOW_FREQ_SHIFT, now, 0.5);
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
