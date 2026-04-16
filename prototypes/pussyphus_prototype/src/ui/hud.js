// ════════════════════════════════════════
// HUD — in-game UI overlays
// ════════════════════════════════════════
import * as K from '../constants.js';
import * as mixer from '../audio/mixer.js';
import * as crowd from '../audio/crowd.js';

let fbar;
const PIP_COUNT = 15;

const AUDIO_DEBUG = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('audioDebug') === '1';
let dbgEl = null;

export function init() {
  fbar = document.getElementById('fbar');
  for (let i = 0; i < PIP_COUNT; i++) {
    const p = document.createElement('div');
    p.className = 'fp';
    fbar.appendChild(p);
  }
  if (AUDIO_DEBUG) {
    dbgEl = document.createElement('div');
    dbgEl.style.cssText =
      'position:fixed;bottom:4px;right:4px;background:#000a;color:#0f8;' +
      'font:11px monospace;padding:4px;z-index:999;white-space:pre;pointer-events:none';
    document.body.appendChild(dbgEl);
  }
}

export function update(flow, alt, npcCount) {
  const fi = Math.min(Math.floor(flow), K.MOODS.length - 1);

  document.getElementById('mt').textContent = 'MOOD: ' + K.MOODS[fi];
  document.getElementById('at').textContent = 'ALT: ' + alt;

  // Flow bar pips
  const pips = fbar.children;
  for (let i = 0; i < pips.length; i++) {
    pips[i].className = 'fp' + (i < flow ? (i > 10 ? ' h' : ' a') : '');
  }

  document.getElementById('ft').textContent = K.FLOW_WORDS[fi];

  // Zone depth
  const zoneNames = ['YOU ARE HERE','ASCENDING','ASCENDING','LEVEL 2','LEVEL 2','DEEP KIOSK','THE CANYON','THE CANYON'];
  document.getElementById('dt').textContent = zoneNames[Math.min(Math.floor(alt / 50), zoneNames.length - 1)];

  // Status bar
  document.getElementById('sb1').textContent = 'scent index: ' + (flow > 5 ? 'elevated' : 'nominal');
  const di = Math.min(Math.floor(npcCount / 3), K.DENSITY_WORDS.length - 1);
  document.getElementById('sb2').textContent = 'social density: ' + K.DENSITY_WORDS[di];
  document.getElementById('sb3').textContent = flow > 12 ? '✧✧✧' : flow > 6 ? '✧✧' : flow > 2 ? '✧' : '☆';

  if (AUDIO_DEBUG && dbgEl) {
    const ff = mixer._debug.filterFreq, fq = mixer._debug.filterQ, rw = mixer._debug.reverbWet;
    dbgEl.textContent =
      'density  ' + crowd._debug.density.toFixed(2) + '\n' +
      'occlude  ' + crowd._debug.occlusion.toFixed(2) + '\n' +
      'cutoff   ' + (ff !== undefined ? ff.toFixed(0) + ' Hz' : '—') + '\n' +
      'Q        ' + (fq !== undefined ? fq.toFixed(2) : '—') + '\n' +
      'revwet   ' + (rw !== undefined ? rw.toFixed(2) : '—');
  }
}
