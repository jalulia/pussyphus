// ════════════════════════════════════════
// CAT — Bo the Cornish Rex: entity state
// ════════════════════════════════════════
import * as K from '../constants.js';

// Spring chain positions
export let headX = 0, headZ = 0;
export let bodyX = 0, bodyZ = 0;
export let buttX = 0, buttZ = 0;
export const tailX = new Float32Array(K.TAIL_SEGMENTS);
export const tailZ = new Float32Array(K.TAIL_SEGMENTS);

// Smoothed input
export let smoothX = 0;

// Step tracking
export let stepZ = 0;
export let stepYVal = 0;
export let groundY = 0;      // front (head) step surface
export let backGroundY = 0;   // back (butt) step surface

function lerp(a, b, t) { return a + (b - a) * t; }

export function updateSpringChain(dt, inputX, stepTarget, frontStepY, backStepY, flow) {
  const maxX = K.ESC_WIDTH / 2 - K.CAT_MAX_X_MARGIN;

  // Flow-based spring interpolation: 0 = stiff/deliberate, 1 = loose/fluid
  const flowT = Math.min(flow / K.FLOW_MAX, 1);
  const sHead    = lerp(K.SPRING_HEAD_STIFF,      K.SPRING_HEAD_LOOSE,      flowT);
  const sBody    = lerp(K.SPRING_BODY_STIFF,      K.SPRING_BODY_LOOSE,      flowT);
  const sButt    = lerp(K.SPRING_BUTT_STIFF,      K.SPRING_BUTT_LOOSE,      flowT);
  const sTailB   = lerp(K.SPRING_TAIL_BASE_STIFF,  K.SPRING_TAIL_BASE_LOOSE, flowT);
  const sTailD   = lerp(K.SPRING_TAIL_DECAY_STIFF, K.SPRING_TAIL_DECAY_LOOSE, flowT);

  // Smooth lateral input
  smoothX += (inputX - smoothX) * K.CAT_LATERAL_SMOOTH * dt;
  smoothX = Math.max(-1, Math.min(1, smoothX));

  // Smooth step position
  const targetZ = stepTarget * (-K.STEP_SPACING);
  const targetY = stepTarget * K.INCLINE;
  stepZ += (targetZ - stepZ) * K.CAT_STEP_SMOOTH * dt;
  stepYVal += (targetY - stepYVal) * K.CAT_STEP_SMOOTH * dt;

  // Ground tracking
  groundY += (frontStepY - groundY) * K.GROUND_TRACK_SPEED * dt;
  backGroundY += (backStepY - backGroundY) * K.GROUND_TRACK_SPEED * dt;

  // Spring chain: head → body → butt → tail (flow-interpolated)
  const targetHeadX = smoothX * maxX;
  headX += (targetHeadX - headX) * sHead * dt;
  headZ = stepZ;

  bodyX += (headX - bodyX) * sBody * dt;
  bodyZ += (headZ + 0.055 - bodyZ) * sBody * dt;

  buttX += (bodyX - buttX) * sButt * dt;
  buttZ += (bodyZ + 0.045 - buttZ) * sButt * dt;

  // Tail chain — also flow-interpolated
  let prevX = buttX, prevZ = buttZ + 0.01;
  for (let i = 0; i < K.TAIL_SEGMENTS; i++) {
    const spring = sTailB - i * sTailD;
    tailX[i] += (prevX - tailX[i]) * spring * dt;
    tailZ[i] += (prevZ + 0.012 - tailZ[i]) * spring * dt;
    prevX = tailX[i];
    prevZ = tailZ[i];
  }
}

export function reset() {
  headX = bodyX = buttX = smoothX = 0;
  headZ = bodyZ = buttZ = stepZ = stepYVal = 0;
  groundY = backGroundY = 0;
  tailX.fill(0);
  tailZ.fill(0);
}

// Allow main.js to write these (module exports are live bindings for let)
export function setHeadX(v) { headX = v; }
export function setSmooth(v) { smoothX = v; }
