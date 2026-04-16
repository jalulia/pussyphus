// ════════════════════════════════════════
// SHEPARD — Shepard-Risset glissando. Infinite-rise illusion.
// Six sine voices stacked evenly in log-frequency space, all sliding upward
// at the same rate. Each voice's amplitude follows a Gaussian centered at the
// middle of its octave band, so voices fade in at the bottom and fade out at
// the top. The composite never stops ascending.
//
// Routing: directly to the master bus (bypasses crowd filter + reverb).
// Controls: setLevel(0..1), setPeriod(seconds per octave), update(dt).
// ════════════════════════════════════════
import * as Tone from 'tone';
import * as K from '../constants.js';

let ctx = null;
let started = false;
let masterOut = null;          // summed shepard output
let voices = [];               // { osc, gain, offset }
let phase = 0;                 // normalized position [0,1]
let period = K.SHEPARD_PERIOD_S;
let targetLevel = 0;
let currentLevel = 0;

export function init(destination) {
  if (started) return;
  ctx = Tone.getContext().rawContext;

  masterOut = ctx.createGain();
  masterOut.gain.value = 0;
  masterOut.connect(destination || ctx.destination);

  for (let i = 0; i < K.SHEPARD_VOICES; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = K.SHEPARD_BASE_FREQ;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(masterOut);
    osc.start();
    voices.push({ osc, gain, offset: i / K.SHEPARD_VOICES });
  }

  started = true;
}

export function update(dt) {
  if (!started) return;

  // Advance phase.
  phase = (phase + dt / period) % 1;

  const now = ctx.currentTime;
  const sigma = K.SHEPARD_SIGMA;
  for (const v of voices) {
    const p = (phase + v.offset) % 1;
    const freq = K.SHEPARD_BASE_FREQ * Math.pow(2, p * K.SHEPARD_OCTAVES);
    // Gaussian amplitude envelope: peak at p=0.5, zero at edges
    const d = p - 0.5;
    const amp = Math.exp(-(d * d) / (2 * sigma * sigma));
    v.osc.frequency.setTargetAtTime(freq, now, 0.02);
    v.gain.gain.setTargetAtTime(amp, now, 0.05);
  }

  // Smooth master toward target level.
  currentLevel += (targetLevel - currentLevel) * Math.min(1, dt * 2.5);
  masterOut.gain.setTargetAtTime(currentLevel, now, 0.05);
}

export function setLevel(v) {
  targetLevel = Math.max(0, Math.min(1, v));
}

export function setPeriod(seconds) {
  period = Math.max(2, seconds);
}

export function getLevel() { return targetLevel; }
export function getPeriod() { return period; }
export function isStarted() { return started; }

export function reset() { /* shepard persists across resets like drone */ }
