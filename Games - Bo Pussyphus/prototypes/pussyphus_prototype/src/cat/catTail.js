// ════════════════════════════════════════
// CAT TAIL — emotional state machine
// Drives per-segment target offsets on top of the spring chain in cat.js.
// States: IDLE (ascending), MOVING (lateral input), IMPACT (collision flick).
// ════════════════════════════════════════
import * as K from '../constants.js';

const STATE_IDLE = 0, STATE_MOVING = 1;

let state = STATE_IDLE;
let prevState = STATE_IDLE;
let blendT = 1;       // 0 = mid-transition, 1 = settled
let impactX = 0;      // decaying lateral impulse
let impactT = 0;      // seconds remaining on impact

export function reset() {
  state = STATE_IDLE;
  prevState = STATE_IDLE;
  blendT = 1;
  impactX = 0;
  impactT = 0;
}

// dirX = sign AWAY from the collider (tail flicks away).
export function impact(dirX) {
  impactX = (dirX || 1) * K.TAIL_IMPACT_IMPULSE;
  impactT = K.TAIL_IMPACT_DECAY_S;
}

let flowT = 0;   // cached flow interpolant 0..1

export function update(dt, smoothX, flow) {
  flowT = Math.min((flow || 0) / K.FLOW_MAX, 1);
  const target = Math.abs(smoothX) > K.TAIL_MOVING_THRESHOLD ? STATE_MOVING : STATE_IDLE;
  if (target !== state) {
    prevState = state;
    state = target;
    blendT = 0;
  }
  if (blendT < 1) blendT = Math.min(1, blendT + dt / K.TAIL_STATE_BLEND_S);
  if (impactT > 0) {
    impactT = Math.max(0, impactT - dt);
    impactX *= Math.pow(0.1, dt / K.TAIL_IMPACT_DECAY_S);
  }
}

function stateOffsets(s, prog, t, out) {
  if (s === STATE_IDLE) {
    const swish = Math.sin(t * K.TAIL_IDLE_SWISH_FREQ + prog * 1.8)
                * K.TAIL_IDLE_SWISH_AMP * prog;
    out.dx = swish;
    // Base drops slightly; tip curls upward (quadratic rise toward tip).
    out.dy = -K.TAIL_IDLE_BASE_DROP * (1 - prog) + K.TAIL_IDLE_TIP_CURL * prog * prog;
    out.dz = -0.006 * prog * prog;   // gentle forward curl at tip
  } else {
    const swish = Math.sin(t * K.TAIL_MOVING_SWISH_FREQ + prog * 1.2)
                * K.TAIL_MOVING_SWISH_AMP * (0.4 + prog * 0.8);
    out.dx = swish;
    // Base perks up; tip trails.
    out.dy = K.TAIL_MOVING_PERK_GAIN * (1 - prog * 0.6);
    out.dz = 0.002 * prog;
  }
}

const _a = { dx: 0, dy: 0, dz: 0 };
const _b = { dx: 0, dy: 0, dz: 0 };

// Writes blended state offset + flow posture + decaying impact impulse into `out`.
export function offset(prog, t, out) {
  stateOffsets(state, prog, t, _a);
  if (blendT < 1) {
    stateOffsets(prevState, prog, t, _b);
    const k = blendT;
    out.dx = _b.dx * (1 - k) + _a.dx * k;
    out.dy = _b.dy * (1 - k) + _a.dy * k;
    out.dz = _b.dz * (1 - k) + _a.dz * k;
  } else {
    out.dx = _a.dx; out.dy = _a.dy; out.dz = _a.dz;
  }

  // Flow posture — lowered+still at 0, raised+S-curve at max
  // Raise: tail lifts progressively toward tip
  out.dy += flowT * K.TAIL_FLOW_RAISE * prog;
  // S-curve: gentle lateral sine that increases with flow
  out.dx += flowT * K.TAIL_FLOW_SCURVE_AMP * Math.sin(prog * Math.PI * 2 + t * 0.8);
  // Swish amplitude boost at high flow
  out.dx *= 1 + flowT * (K.TAIL_FLOW_SWISH_BOOST - 1);

  if (impactT > 0) {
    out.dx += impactX * (1 - prog * 0.5);
    out.dy += -0.006 * (impactT / K.TAIL_IMPACT_DECAY_S);
  }
}
