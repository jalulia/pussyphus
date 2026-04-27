// ════════════════════════════════════════
// FRAGMENTS — melodic one-shots, base64 WAV data URLs
// Currently procedurally synthesized at module load (no external assets).
// Replace with real recordings later by swapping this file.
// ════════════════════════════════════════

const SR = 22050;

/** Write a 16-bit PCM mono WAV file into a Uint8Array. */
function encodeWav(samples, sampleRate) {
  const len = samples.length;
  const buf = new ArrayBuffer(44 + len * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF');
  v.setUint32(4, 36 + len * 2, true);
  w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Uint8Array(buf);
}

function toDataUrl(u8) {
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return 'data:audio/wav;base64,' + btoa(bin);
}

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

/**
 * Synthesize a short melodic fragment as a sum of decaying sines over a
 * chord outline with a soft pluck envelope. Melody defined as a sequence
 * of [midiNote, beatStart, beatDur].
 */
function synthFragment(notes, bpm = 92, tailSec = 0.4) {
  const beatSec = 60 / bpm;
  const end = notes.reduce((m, [, s, d]) => Math.max(m, (s + d) * beatSec), 0) + tailSec;
  const len = Math.floor(end * SR);
  const out = new Float32Array(len);

  for (const [midi, start, dur] of notes) {
    const freq = midiToFreq(midi);
    const startI = Math.floor(start * beatSec * SR);
    const durI   = Math.floor(dur * beatSec * SR);
    const totI   = Math.min(len - startI, durI + Math.floor(tailSec * SR));
    for (let i = 0; i < totI; i++) {
      const t = i / SR;
      // Pluck envelope
      const env = i < durI
        ? Math.exp(-t * 4) * (1 - Math.exp(-t * 200))
        : Math.exp(-t * 4) * Math.exp(-(i - durI) / SR * 8);
      // Rhodes-ish: fundamental + 2f at 0.4 + 3f at 0.15
      const phase = 2 * Math.PI * freq * t;
      const s = env * (
        0.7  * Math.sin(phase)
      + 0.25 * Math.sin(phase * 2)
      + 0.08 * Math.sin(phase * 3)
      );
      out[startI + i] += s * 0.5;
    }
  }
  // Final soft limiter
  for (let i = 0; i < len; i++) out[i] = Math.tanh(out[i] * 1.2);
  return out;
}

// Six short motifs. Midi values chosen from C major scale;
// durations in beats at 92 bpm.
const MOTIFS = {
  rise:    [[60,0,0.5],[64,0.5,0.5],[67,1,0.5],[72,1.5,1.0]],
  descend: [[79,0,0.5],[76,0.5,0.5],[72,1,0.5],[69,1.5,1.0]],
  pivot:   [[67,0,0.5],[71,0.5,0.5],[72,1,0.5],[67,1.5,1.0]],
  drift:   [[64,0,1.0],[67,1,0.5],[69,1.5,0.5],[72,2,1.0]],
  spark:   [[76,0,0.25],[79,0.25,0.25],[83,0.5,0.5],[79,1,1.0]],
  rest:    [[60,0,1.0],[64,1,0.5],[67,1.5,1.0]],
};

const BANK = {};
for (const [key, notes] of Object.entries(MOTIFS)) {
  BANK[key] = toDataUrl(encodeWav(synthFragment(notes), SR));
}

export default BANK;
