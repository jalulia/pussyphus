// ════════════════════════════════════════
// MALL FM — audio testing lab. Collapsed tab at the bottom of the screen.
// Clicking expands a barebones panel with live audio controls: master/music/
// drone/foley/shepard levels, drone beat Hz, shepard period, reverb wet,
// crowd filter freeze, fragment + foley trigger buttons.
//
// The panel bypasses crowd analysis (mixer.setLabFrozen) when "freeze" is on,
// so sliders stay put instead of being overwritten per frame.
// ════════════════════════════════════════
import * as K from '../constants.js';
import * as mixer from '../audio/mixer.js';
import * as music from '../audio/music.js';
import * as shepard from '../audio/shepard.js';
import * as foley from '../audio/foley.js';
import * as Tone from 'tone';

const CSS = `
#mallfm-tab {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  background: #c0c0c0;
  color: #000;
  font: 10px 'Courier New', monospace;
  letter-spacing: 0.5px;
  padding: 4px 12px;
  border: 1px solid #fff;
  border-bottom: none;
  border-right: 1px solid #808080;
  cursor: pointer;
  user-select: none;
  z-index: 9000;
  box-shadow: inset 1px 1px 0 #fff, inset -1px 0 0 #808080;
}
#mallfm-tab:hover { background: #d4d0c8; }
#mallfm-panel {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  /* Natural 440px on desktop; on narrow screens fit the viewport so the
     panel never extends past the blue margin. */
  width: min(440px, calc(100vw - 16px));
  max-height: 70vh;
  overflow-y: auto;
  background: #c0c0c0;
  color: #000;
  font: 10px 'Courier New', monospace;
  border: 1px solid #fff;
  border-bottom: none;
  border-right: 1px solid #808080;
  box-shadow: inset 1px 1px 0 #fff, inset -1px 0 0 #808080, 0 -2px 8px rgba(0,0,0,0.2);
  z-index: 9000;
  display: none;
}
#mallfm-panel.open { display: block; }
.mf-header {
  background: linear-gradient(90deg, #000080, #1084d0);
  color: #fff;
  padding: 3px 6px;
  font-weight: bold;
  letter-spacing: 1px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.mf-header .close {
  cursor: pointer;
  background: #c0c0c0;
  color: #000;
  padding: 0 5px;
  border: 1px solid #fff;
  border-right-color: #808080;
  border-bottom-color: #808080;
  font-weight: bold;
  line-height: 1;
}
.mf-section {
  padding: 6px 10px;
  border-bottom: 1px solid #808080;
}
.mf-section:last-child { border-bottom: none; }
.mf-section h4 {
  margin: 0 0 4px 0;
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #000080;
}
.mf-row {
  display: grid;
  grid-template-columns: 90px 1fr 40px;
  gap: 6px;
  align-items: center;
  margin: 2px 0;
}
.mf-row label { text-transform: uppercase; font-size: 9px; }
.mf-row input[type=range] { width: 100%; }
.mf-row .mf-val { text-align: right; font-variant-numeric: tabular-nums; }
.mf-btnrow { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.mf-btnrow button {
  background: #c0c0c0;
  border: 1px solid #fff;
  border-right-color: #808080;
  border-bottom-color: #808080;
  font: 9px 'Courier New', monospace;
  padding: 3px 6px;
  cursor: pointer;
  text-transform: uppercase;
}
.mf-btnrow button:active {
  border: 1px solid #808080;
  border-right-color: #fff;
  border-bottom-color: #fff;
}
.mf-toggle { display: inline-block; margin-left: 6px; }
.mf-note { font-size: 9px; color: #404040; margin-top: 4px; font-style: italic; }
`;

const FRAGMENT_KEYS = ['rise', 'descend', 'pivot', 'drift', 'spark', 'rest'];
const FOLEY_TYPES = ['shopper', 'shopper_bag', 'salesrep', 'phone'];

let tabEl, panelEl, open = false;
let initialized = false;

export function init() {
  if (initialized) return;
  initialized = true;

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // Tab
  tabEl = document.createElement('div');
  tabEl.id = 'mallfm-tab';
  tabEl.textContent = '📻 MALL FM';
  tabEl.addEventListener('click', toggle);
  document.body.appendChild(tabEl);

  // Panel
  panelEl = document.createElement('div');
  panelEl.id = 'mallfm-panel';
  panelEl.innerHTML = buildPanelHTML();
  document.body.appendChild(panelEl);

  wireControls();
}

function toggle() {
  open = !open;
  panelEl.classList.toggle('open', open);
  tabEl.style.display = open ? 'none' : 'block';
}

function buildPanelHTML() {
  return `
    <div class="mf-header">
      <span>📻 MALL FM · AUDIO LAB</span>
      <span class="close" id="mf-close">×</span>
    </div>

    <div class="mf-section">
      <h4>Master</h4>
      ${rangeRow('mf-master', 'MASTER',  0, 1,    0.01, K.AUDIO_MASTER_GAIN)}
      ${rangeRow('mf-music',  'MUSIC',   0, 1,    0.01, 1.0)}
      ${rangeRow('mf-foley',  'FOLEY',   0, 0.5,  0.005, K.FOLEY_MASTER_GAIN)}
    </div>

    <div class="mf-section">
      <h4>Drone</h4>
      ${rangeRow('mf-drone',   'LEVEL',    0, 0.3, 0.005, K.DRONE_GAIN)}
      ${rangeRow('mf-beat',    'BEAT HZ',  0, 12,  0.1,   Math.abs(K.DRONE_FREQ_B - K.DRONE_FREQ_A))}
    </div>

    <div class="mf-section">
      <h4>Shepard-Risset ∞</h4>
      ${rangeRow('mf-shep-lvl', 'LEVEL',        0, 0.4, 0.005, 0)}
      ${rangeRow('mf-shep-per', 'OCTAVE / S',   4, 30,  0.5,   K.SHEPARD_PERIOD_S)}
      <div class="mf-note">0 = off. Rises for as long as you listen.</div>
    </div>

    <div class="mf-section">
      <h4>Room</h4>
      ${rangeRow('mf-rev',   'REVERB WET', 0, 0.6,  0.01, K.FLOW_REVERB_MIN)}
      ${rangeRow('mf-cut',   'FILTER HZ',  200, 12000, 50, K.CROWD_FILTER_MAX)}
      <div class="mf-row">
        <label>FREEZE CROWD</label>
        <input type="checkbox" id="mf-freeze" style="justify-self: start">
        <span class="mf-val"></span>
      </div>
      <div class="mf-note">Freeze to stop crowd analysis from overwriting sliders.</div>
    </div>

    <div class="mf-section">
      <h4>Fragments</h4>
      <div class="mf-btnrow" id="mf-frags">
        ${FRAGMENT_KEYS.map(k => `<button data-frag="${k}">${k}</button>`).join('')}
        <button data-frag="__random">random</button>
      </div>
    </div>

    <div class="mf-section">
      <h4>Foley</h4>
      ${rangeRow('mf-clatter', 'CLATTER', 0, 3, 0.05, 1)}
      ${rangeRow('mf-paw',     'PAW',     0, 3, 0.05, 1)}
      ${rangeRow('mf-fluor',   'FLUOR',   0, 3, 0.05, 1)}
      <div class="mf-btnrow" id="mf-foley-btns">
        ${FOLEY_TYPES.map(t => `<button data-foley="${t}">${t}</button>`).join('')}
      </div>
    </div>
  `;
}

function rangeRow(id, label, min, max, step, val) {
  return `
    <div class="mf-row">
      <label>${label}</label>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
      <span class="mf-val" id="${id}-v">${formatVal(val)}</span>
    </div>
  `;
}

function formatVal(v) {
  const n = Number(v);
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

function bindRange(id, onChange) {
  const el = document.getElementById(id);
  const valEl = document.getElementById(id + '-v');
  if (!el) return;
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    if (valEl) valEl.textContent = formatVal(v);
    onChange(v);
  });
}

function wireControls() {
  document.getElementById('mf-close').addEventListener('click', toggle);

  // Master
  bindRange('mf-master', v => mixer.setMasterGain(v));
  bindRange('mf-music',  v => mixer.setMusicBusGain(v));
  bindRange('mf-foley',  v => mixer.setFoleyBusGain(v));

  // Drone
  bindRange('mf-drone', v => mixer.setDroneGain(v));
  bindRange('mf-beat',  v => mixer.setDroneBeatHz(v));

  // Shepard
  bindRange('mf-shep-lvl', v => shepard.setLevel(v));
  bindRange('mf-shep-per', v => shepard.setPeriod(v));

  // Foley layer gains
  bindRange('mf-clatter', v => foley.setClatterGain(v));
  bindRange('mf-paw',     v => foley.setPawGain(v));
  bindRange('mf-fluor',   v => foley.setFluorGain(v));

  // Room
  bindRange('mf-rev', v => mixer.labSetReverbWet(v));
  bindRange('mf-cut', v => mixer.labSetCrowdFilter(v, K.CROWD_FILTER_Q_MIN));

  // Crowd freeze
  const freezeEl = document.getElementById('mf-freeze');
  freezeEl.addEventListener('change', () => {
    mixer.setLabFrozen(freezeEl.checked);
  });

  // Fragments
  const fragsEl = document.getElementById('mf-frags');
  fragsEl.addEventListener('click', e => {
    const key = e.target?.dataset?.frag;
    if (!key) return;
    if (key === '__random') music.triggerRandomFragment();
    else music.triggerFragment(key);
  });

  // Foley
  const foleyEl = document.getElementById('mf-foley-btns');
  foleyEl.addEventListener('click', e => {
    const type = e.target?.dataset?.foley;
    if (!type) return;
    triggerFoleyDirect(type);
  });
}

// Lab-fired foley — bypasses the crowd distance/velocity logic so you can
// audition each sound in isolation at a known level.
function triggerFoleyDirect(type) {
  const bus = mixer.getFoleyBus();
  if (!bus) return;
  const ctx = Tone.getContext().rawContext;
  const when = ctx.currentTime;

  const panner = ctx.createStereoPanner();
  panner.pan.value = 0;
  const g = ctx.createGain();
  g.gain.value = 0;
  panner.connect(g).connect(bus);

  if (type === 'shopper' || type === 'shopper_bag') {
    const noise = ctx.createBufferSource();
    noise.buffer = _noise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 200; bp.Q.value = 4;
    noise.connect(bp).connect(panner);
    g.gain.setValueAtTime(0.6, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
    noise.start(when); noise.stop(when + 0.06);
    if (type === 'shopper_bag') {
      const n2 = ctx.createBufferSource();
      n2.buffer = _pink(ctx);
      const bp2 = ctx.createBiquadFilter();
      bp2.type = 'bandpass'; bp2.frequency.value = 3000; bp2.Q.value = 2;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.4, when + 0.12);
      g2.gain.exponentialRampToValueAtTime(0.001, when + 0.26);
      n2.connect(bp2).connect(g2).connect(panner);
      n2.start(when + 0.12); n2.stop(when + 0.3);
    }
  } else if (type === 'phone') {
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 1046.5;
    osc.connect(panner);
    g.gain.setValueAtTime(0.2, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
    osc.start(when); osc.stop(when + 0.1);
  } else if (type === 'salesrep') {
    const noise = ctx.createBufferSource();
    noise.buffer = _noise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 6;
    noise.connect(bp).connect(panner);
    g.gain.setValueAtTime(0.8, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.03);
    noise.start(when); noise.stop(when + 0.05);
  }
}

let _nb, _pb;
function _noise(ctx) {
  if (_nb) return _nb;
  const len = ctx.sampleRate * 0.2;
  _nb = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = _nb.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return _nb;
}
function _pink(ctx) {
  if (_pb) return _pb;
  const len = ctx.sampleRate * 0.3;
  _pb = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = _pb.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return _pb;
}

export function update(_dt) { /* reserved — nothing per-frame yet */ }
export function reset() { /* panel persists */ }
