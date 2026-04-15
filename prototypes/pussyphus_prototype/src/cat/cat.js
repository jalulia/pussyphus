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

export function updateSpringChain(dt, inputX, stepTarget, frontStepY, backStepY) {
  const maxX = K.ESC_WIDTH / 2 - K.CAT_MAX_X_MARGIN;

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

  // Spring chain: head → body → butt → tail
  const targetHeadX = smoothX * maxX;
  headX += (targetHeadX - headX) * K.SPRING_HEAD * dt;
  headZ = stepZ;

  bodyX += (headX - bodyX) * K.SPRING_BODY * dt;
  bodyZ += (headZ + 0.055 - bodyZ) * K.SPRING_BODY * dt;

  buttX += (bodyX - buttX) * K.SPRING_BUTT * dt;
  buttZ += (bodyZ + 0.045 - buttZ) * K.SPRING_BUTT * dt;

  // Tail chain
  let prevX = buttX, prevZ = buttZ + 0.01;
  for (let i = 0; i < K.TAIL_SEGMENTS; i++) {
    const spring = K.SPRING_TAIL_BASE - i * K.SPRING_TAIL_DECAY;
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
