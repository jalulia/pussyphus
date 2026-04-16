// ════════════════════════════════════════
// INPUT — unified input state
// ════════════════════════════════════════
import { CAT_LATERAL_SPEED, CAT_STEP_MIN, CAT_STEP_MAX } from './constants.js';

// Exported state — read by main loop
export const input = {
  lateralTarget: 0,   // -1..1 desired X position
  stepTarget: 0,      // discrete step offset
  startPressed: false, // title screen trigger
};

const held = {};       // currently-held keys
const taps = {};       // single-press keys (consumed after read)

export function init(container) {
  // ── Keyboard ──
  document.addEventListener('keydown', e => {
    if (!held[e.key]) taps[e.key] = true;
    held[e.key] = true;
    if (e.key === ' ' || e.key === 'Enter') input.startPressed = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  });
  document.addEventListener('keyup', e => { held[e.key] = false; });

  // ── Mouse ──
  container.addEventListener('mousemove', e => {
    const r = container.getBoundingClientRect();
    input.lateralTarget = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const my = 1 - ((e.clientY - r.top) / r.height);
    const step = Math.round(my * 3 - 1.5);
    input.stepTarget = clampStep(step);
  });

  // ── Touch ──
  container.addEventListener('touchstart', e => {
    e.preventDefault();
    input.startPressed = true;
    const r = container.getBoundingClientRect();
    const ty = (e.touches[0].clientY - r.top) / r.height;
    if (ty < 0.35) input.stepTarget = clampStep(input.stepTarget + 1);
    else if (ty > 0.65) input.stepTarget = clampStep(input.stepTarget - 1);
    else input.lateralTarget = ((e.touches[0].clientX - r.left) / r.width - 0.5) * 2;
  }, { passive: false });

  container.addEventListener('touchmove', e => {
    e.preventDefault();
    const r = container.getBoundingClientRect();
    input.lateralTarget = ((e.touches[0].clientX - r.left) / r.width - 0.5) * 2;
  }, { passive: false });

  // ── Scroll wheel ──
  container.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.deltaY < 0) input.stepTarget = clampStep(input.stepTarget + 1);
    if (e.deltaY > 0) input.stepTarget = clampStep(input.stepTarget - 1);
  }, { passive: false });
}

/** Call once per frame to process held keys into lateral target. */
export function update(dt) {
  if (held.ArrowLeft || held.a) input.lateralTarget = Math.max(-1, input.lateralTarget - CAT_LATERAL_SPEED * dt);
  if (held.ArrowRight || held.d) input.lateralTarget = Math.min(1, input.lateralTarget + CAT_LATERAL_SPEED * dt);

  if (taps.ArrowUp || taps.w) { input.stepTarget = clampStep(input.stepTarget + 1); taps.ArrowUp = taps.w = false; }
  if (taps.ArrowDown || taps.s) { input.stepTarget = clampStep(input.stepTarget - 1); taps.ArrowDown = taps.s = false; }
}

/** Consume the start press flag (returns true once). */
export function consumeStart() {
  if (input.startPressed) { input.startPressed = false; return true; }
  return false;
}

export function reset() {
  input.lateralTarget = 0;
  input.stepTarget = 0;
  input.startPressed = false;
}

function clampStep(v) { return Math.max(CAT_STEP_MIN, Math.min(CAT_STEP_MAX, v)); }
