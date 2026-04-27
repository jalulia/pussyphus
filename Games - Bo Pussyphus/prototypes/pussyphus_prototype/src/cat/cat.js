// ════════════════════════════════════════
// CAT — Bo the Cornish Rex: entity state
// Movement model: world motion vs intent vs body animation
// ════════════════════════════════════════
import * as K from '../constants.js';

// Spring chain positions (X = lateral, Z = along escalator)
export let headX = 0, headZ = 0;
export let bodyX = 0, bodyZ = 0;
export let buttX = 0, buttZ = 0;
export const tailX = new Float32Array(K.TAIL_SEGMENTS);
export const tailZ = new Float32Array(K.TAIL_SEGMENTS);

// Smoothed input
export let smoothX = 0;

// Normalized flow (0–1), updated each frame by updateSpringChain
let _flow01 = 0;
export function getFlow01() { return _flow01; }

// Step tracking
export let stepZ = 0;
export let stepYVal = 0;
export let groundY = 0;      // front (head) step surface — NOW direct, not lerped
export let backGroundY = 0;   // back (butt) step surface — NOW direct, not lerped

// ── Gait phase — driven by relative speed over escalator ──
export let gaitPhase = 0;
export let relativeSpeed = 0;     // Bo's speed relative to the belt surface

// ── Gait body offsets — set each frame, read by catAnim ──
export let gaitShoulderDip = 0;   // how much shoulder drops on front plant
export let gaitHipLift = 0;       // how much hip rises on rear push
export let gaitSpineStretch = 0;  // spine length delta (+ = longer, - = shorter)
export let gaitHeadCounter = 0;   // tiny head counter-motion (dampened)

// ── Micro-slip accumulator ──
export let slipOffset = 0;        // accumulated backward slip (decays)

// ── Locomotion state ──
// 0=careful, 1=threading, 2=flowClimb, 3=composureBreak, 4=recompose
export let locoState = 0;
let _locoTimer = 0;               // timer for break/recompose duration
let _prevLateralVel = 0;          // for threading detection

// ── Lateral velocity tracking (for body-chain threading) ──
export let lateralVelocity = 0;
let _prevSmX = 0;

// ── Delayed hip lateral (for sequential body commitment) ──
export let delayedLateralVel = 0;
const _lateralHistory = [];       // ring buffer of {t, v} for delay
const LATERAL_HISTORY_MAX = 30;   // enough frames for 120ms at 60fps

function lerp(a, b, t) { return a + (b - a) * t; }

export function updateSpringChain(dt, inputX, stepTarget, frontStepY, backStepY, flow, beltSpeed) {
  const maxX = K.ESC_WIDTH / 2 - K.CAT_MAX_X_MARGIN;

  // Flow-based spring interpolation: 0 = stiff/deliberate, 1 = loose/fluid
  const flowT = Math.min(flow / K.FLOW_MAX, 1);
  _flow01 = flowT;
  const sHead    = lerp(K.SPRING_HEAD_STIFF,      K.SPRING_HEAD_LOOSE,      flowT);
  const sBody    = lerp(K.SPRING_BODY_STIFF,      K.SPRING_BODY_LOOSE,      flowT);
  const sButt    = lerp(K.SPRING_BUTT_STIFF,      K.SPRING_BUTT_LOOSE,      flowT);
  const sTailB   = lerp(K.SPRING_TAIL_BASE_STIFF,  K.SPRING_TAIL_BASE_LOOSE, flowT);
  const sTailD   = lerp(K.SPRING_TAIL_DECAY_STIFF, K.SPRING_TAIL_DECAY_LOOSE, flowT);

  // Smooth lateral input
  smoothX += (inputX - smoothX) * K.CAT_LATERAL_SMOOTH * dt;
  smoothX = Math.max(-1, Math.min(1, smoothX));

  // ── Lateral velocity tracking ──
  lateralVelocity = (smoothX - _prevSmX) / Math.max(dt, 0.001);
  _prevSmX = smoothX;

  // Delayed lateral velocity (for hip lag — ~120ms behind)
  const now = performance.now();
  _lateralHistory.push({ t: now, v: lateralVelocity });
  if (_lateralHistory.length > LATERAL_HISTORY_MAX) _lateralHistory.shift();
  const delayTarget = now - K.LATERAL_HIP_DELAY_MS;
  delayedLateralVel = 0;
  for (let i = _lateralHistory.length - 1; i >= 0; i--) {
    if (_lateralHistory[i].t <= delayTarget) {
      delayedLateralVel = _lateralHistory[i].v;
      break;
    }
  }

  // Smooth step position
  const targetZ = stepTarget * (-K.STEP_SPACING);
  const targetY = stepTarget * K.INCLINE;
  stepZ += (targetZ - stepZ) * K.CAT_STEP_SMOOTH * dt;
  stepYVal += (targetY - stepYVal) * K.CAT_STEP_SMOOTH * dt;

  // ══ P1: Direct surface anchoring — no lerp, Bo IS on the step ══
  groundY = frontStepY;
  backGroundY = backStepY;

  // ══ P3: Gait phase driven by relative speed over escalator ══
  // Bo's climb rate vs the belt pulling her down.
  // stepTarget changes discretely; smoothed stepZ gives continuous uphill intent.
  // beltSpeed is the escalator's downward pull in world units/sec.
  // Bo's uphill effort: how fast she's climbing relative to the belt.
  const climbRate = beltSpeed;  // Bo compensates for full belt speed when climbing
  relativeSpeed = climbRate + Math.abs(lateralVelocity) * 0.3; // lateral adds cadence

  // Gait phase only advances when there's relative motion
  const gaitInput = Math.abs(relativeSpeed);
  // Cadence jitter at low flow
  const jitter = locoState === 0 ? (1 + (Math.sin(gaitPhase * 7.3) * K.LOCO_CADENCE_JITTER * (1 - flowT))) : 1;
  gaitPhase += gaitInput * K.WALK_RATE * dt * jitter;

  // ══ P2: Gait-driven compression/extension ══
  const plantFront = Math.max(0, Math.sin(gaitPhase));               // front paws planting
  const pushRear   = Math.max(0, Math.sin(gaitPhase + Math.PI * 0.55)); // rear paws pushing

  const targetShoulderDip = plantFront * K.GAIT_SHOULDER_DIP;
  const targetHipLift     = pushRear * K.GAIT_HIP_LIFT;
  const targetSpineStretch = pushRear * K.GAIT_SPINE_STRETCH - plantFront * K.GAIT_SPINE_COMPRESS;
  const targetHeadCounter = -plantFront * K.GAIT_HEAD_COUNTER + pushRear * K.GAIT_HEAD_COUNTER * 0.5;

  // Springs resolve gait targets — stiffness matches flow
  const gaitSpring = lerp(12, 6, flowT);  // stiffer at low flow, looser at high
  gaitShoulderDip += (targetShoulderDip - gaitShoulderDip) * gaitSpring * dt;
  gaitHipLift     += (targetHipLift - gaitHipLift)         * gaitSpring * dt;
  gaitSpineStretch += (targetSpineStretch - gaitSpineStretch) * gaitSpring * dt;
  // Head is MORE stable — much lower spring rate
  gaitHeadCounter += (targetHeadCounter - gaitHeadCounter) * K.GAIT_HEAD_SMOOTH * gaitSpring * dt;

  // ══ P5: Micro-slips ══
  // On each front paw plant peak, accumulate backward slip scaled by (1 - flow)
  const plantPeak = Math.sin(gaitPhase);
  // Detect plant-peak crossing (sin goes from rising to falling near 1.0)
  const prevPlant = Math.sin(gaitPhase - gaitInput * K.WALK_RATE * dt * jitter);
  if (plantPeak < prevPlant && prevPlant > 0.9) {
    // Paw just planted — slip backward
    const slipAmount = K.SLIP_PAW_AMOUNT * (1 - flowT);
    if (locoState === 3) {
      // Composure break: burst of slip
      slipOffset += K.LOCO_BREAK_SLIP_BURST;
    } else {
      slipOffset += slipAmount;
    }
  }
  // Decay slip — Bo recovers ground
  slipOffset *= Math.max(0, 1 - K.SLIP_DECAY * dt);
  if (slipOffset < 0.0001) slipOffset = 0;

  // ══ P7: Locomotion state machine ══
  _updateLocoState(dt, flowT);

  // ══ Spring chain: head → body → butt → tail ══
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

// ── Locomotion state transitions ──
let _npcHitFlag = false;
export function signalNpcHit() { _npcHitFlag = true; }

// Internal: variable used to track whether we got an NPC hit this frame
let npcHit = false;

function _updateLocoState(dt, flowT) {
  npcHit = _npcHitFlag;
  _npcHitFlag = false;

  if (_locoTimer > 0) _locoTimer -= dt * 1000;

  switch (locoState) {
    case 0: // Careful Climb
    case 2: // Flow Climb
      if (npcHit) {
        locoState = 3; // composure break
        _locoTimer = K.LOCO_COMPOSURE_BREAK_MS;
        break;
      }
      if (Math.abs(lateralVelocity) > 1.5) {
        locoState = 1; // threading
        break;
      }
      // Flow-based state selection
      if (flowT >= K.LOCO_FLOW_MIN) locoState = 2;
      else locoState = 0;
      break;

    case 1: // Threading
      if (npcHit) {
        locoState = 3;
        _locoTimer = K.LOCO_COMPOSURE_BREAK_MS;
        break;
      }
      if (Math.abs(lateralVelocity) < 0.8) {
        // Exit threading
        locoState = flowT >= K.LOCO_FLOW_MIN ? 2 : 0;
      }
      break;

    case 3: // Composure Break
      if (_locoTimer <= 0) {
        locoState = 4; // recompose
        _locoTimer = K.LOCO_RECOMPOSE_MS;
      }
      break;

    case 4: // Recompose
      if (npcHit) {
        locoState = 3;
        _locoTimer = K.LOCO_COMPOSURE_BREAK_MS;
        break;
      }
      if (_locoTimer <= 0) {
        locoState = flowT >= K.LOCO_FLOW_MIN ? 2 : 0;
      }
      break;
  }
}

export function getLocoTimer01() {
  // Returns 0..1 progress through current break/recompose
  if (locoState === 3) return 1 - Math.max(0, _locoTimer / K.LOCO_COMPOSURE_BREAK_MS);
  if (locoState === 4) return 1 - Math.max(0, _locoTimer / K.LOCO_RECOMPOSE_MS);
  return 0;
}

export function reset() {
  headX = bodyX = buttX = smoothX = 0;
  headZ = bodyZ = buttZ = stepZ = stepYVal = 0;
  groundY = backGroundY = 0;
  gaitPhase = 0;
  relativeSpeed = 0;
  gaitShoulderDip = gaitHipLift = gaitSpineStretch = gaitHeadCounter = 0;
  slipOffset = 0;
  locoState = 0;
  _locoTimer = 0;
  lateralVelocity = 0;
  delayedLateralVel = 0;
  _prevSmX = 0;
  _prevLateralVel = 0;
  _lateralHistory.length = 0;
  _npcHitFlag = false;
  npcHit = false;
  tailX.fill(0);
  tailZ.fill(0);
}

// Allow main.js to write these (module exports are live bindings for let)
export function setHeadX(v) { headX = v; }
export function setSmooth(v) { smoothX = v; }
