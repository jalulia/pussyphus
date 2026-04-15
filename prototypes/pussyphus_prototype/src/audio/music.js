// ════════════════════════════════════════
// MUSIC — procedural Rhodes / bass / pad + progression engine + fragments
// Routes: [rhodes→chorus→tremolo] + [bass] + [pad] → musicOut → mixer.musicBus
// Progression engine: common-tone voice leading between pre-authored
// 4-bar phrases drawn from city pop / bossa / cumbia / synth-pop pools.
// Fragments: short melodic one-shots triggered at flow integer thresholds.
// ════════════════════════════════════════
import * as Tone from 'tone';
import * as K from '../constants.js';
import * as mixer from './mixer.js';
import * as F from './fragments.generated.js';

let rhodes, bass, pad, musicOut;
let progressionIndex = 0;
let started = false;
let initialized = false;
let repeatId = null;

// Common-tone progression pool. Roman numerals in C major; engine doesn't
// modulate keys yet — common-tone picking keeps it from feeling samey.
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
  // Madonna-ish add9 drift
  ['Fmaj7', 'G', 'Am7', 'G'],
  ['Dm7', 'G7', 'Cmaj7', 'Am7'],
];

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

export async function init() {
  if (initialized) return;
  const ctx = Tone.getContext().rawContext;

  musicOut = ctx.createGain();
  musicOut.gain.value = K.MUSIC_MASTER_GAIN;
  musicOut.connect(mixer.getMusicBus());

  // Rhodes — FM, warm, with chorus + tremolo for city pop shimmer.
  rhodes = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 2,
    modulationIndex: 3,
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 1.2 },
    modulationEnvelope: { attack: 0.02, decay: 0.2, sustain: 0, release: 0.2 },
    volume: -6,
  });
  const chorus = new Tone.Chorus(2, 2.5, 0.3).start();
  const trem = new Tone.Tremolo(4, 0.2).start();
  rhodes.chain(chorus, trem);
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

  // Load fragment buffers.
  await loadFragments();

  initialized = true;
}

export function start() {
  if (started || !initialized) return;
  started = true;
  let bar = 0;

  repeatId = Tone.Transport.scheduleRepeat((time) => {
    const prog = PROGRESSIONS[progressionIndex % PROGRESSIONS.length];
    const sym  = prog[bar % 4];
    const chord = voiceChord(sym, 4).map(midiToFreq);
    const bassNotes = voiceChord(sym, 2);
    const bassRoot = midiToFreq(bassNotes[0]);
    const bassFifth = midiToFreq(bassNotes[1] ?? bassNotes[0]);

    const jitter = () => Math.max(0, Math.random() * K.MUSIC_HUMANIZE_MS / 1000);

    // Rhodes: staggered voicing, varied velocity
    chord.forEach((f) => {
      rhodes.triggerAttackRelease(f, '2n', time + jitter(), 0.4 + Math.random() * 0.3);
    });

    // Bass: root on beat 1, 5th on beat 3
    bass.triggerAttackRelease(bassRoot, '4n', time);
    bass.triggerAttackRelease(bassFifth, '4n', time + Tone.Time('2n').toSeconds());

    // Pad: long sustain whole bar
    pad.triggerAttackRelease(chord, '1m', time);

    bar++;
    if (bar % 4 === 0) {
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
  if (!started) return;
  Tone.Transport.stop();
  if (repeatId !== null) {
    Tone.Transport.clear(repeatId);
    repeatId = null;
  }
  started = false;
}

// ══════════════ Fragments ══════════════
const fragmentBuffers = {};

async function loadFragments() {
  const ctx = Tone.getContext().rawContext;
  const bank = (F && F.default) || {};
  for (const [key, dataUrl] of Object.entries(bank)) {
    try {
      const res = await fetch(dataUrl);
      const arr = await res.arrayBuffer();
      fragmentBuffers[key] = await ctx.decodeAudioData(arr);
    } catch (e) {
      console.warn('fragment load failed', key, e);
    }
  }
}

export function triggerFragment(key) {
  const buf = fragmentBuffers[key];
  if (!buf || !musicOut) return;
  const ctx = Tone.getContext().rawContext;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.6;
  src.connect(g).connect(musicOut);
  src.start();
}

export function triggerRandomFragment() {
  const keys = Object.keys(fragmentBuffers);
  if (!keys.length) return;
  triggerFragment(keys[Math.floor(Math.random() * keys.length)]);
}

export function update(_dt) { /* Transport drives itself */ }
export function reset() { /* keep transport running across game resets */ }

export { voiceChord, midiToFreq };
