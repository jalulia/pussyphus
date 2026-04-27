// ════════════════════════════════════════
// CAT ANIM — per-frame skeleton → mesh update
// ════════════════════════════════════════
import * as K from '../constants.js';
import * as cat from './cat.js';
import * as catTail from './catTail.js';
import * as foley from '../audio/foley.js';
import { updateTube, bodyGeo, bellyGeo, tailGeo, tailTipGeo,
         catGroup, catEarL, catEarR, catEarLIn, catEarRIn,
         catMask, catNose, catLegs } from './catModel.js';

// Pre-allocated working arrays
const _bodyPts = [], _bodyRad = [];
const _tailPts = [], _tailRad = [];
const _tipPts  = [], _tipRad  = [];

for (let i = 0; i < K.BODY_SPINE_PTS; i++) { _bodyPts.push({x:0,y:0,z:0}); _bodyRad.push(0); }
for (let i = 0; i < K.TAIL_SEGMENTS;  i++) { _tailPts.push({x:0,y:0,z:0}); _tailRad.push(0); }
for (let i = 0; i < 4;                i++) { _tipPts.push({x:0,y:0,z:0});  _tipRad.push(0);  }
const _tailOff = { dx: 0, dy: 0, dz: 0 };

// ── Procedural walk cycle state ──
// 4 legs: FL=0, FR=1, BL=2, BR=3
// Diagonal pairs: (FL+BR) and (FR+BL) alternate, offset by π.
const _legs = [];
for (let i = 0; i < 4; i++) {
  _legs.push({
    pawX: 0, pawY: 0, pawZ: 0,       // current paw world position (smoothed)
    lastSinP: 0,                       // previous sin(phase) for audio trigger
    inited: false,                     // set true once paw snaps to anchor on first frame
  });
}
let _walkPhase = 0;      // continuous phase, drives all four legs

// ── Helpers ──
function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Position a two-segment leg (upper + lower cylinder + paw sphere)
 * given hip/shoulder anchor and paw target. Simple IK: upper rotates
 * from anchor toward paw, knee bends to fill the gap.
 */
function positionLeg(legIdx, anchorX, anchorY, anchorZ, pawX, pawY, pawZ) {
  const base = legIdx * 3;  // each leg = [upper, lower, paw]
  const upper = catLegs[base];
  const lower = catLegs[base + 1];
  const paw   = catLegs[base + 2];

  // Vector from anchor to paw
  const dx = pawX - anchorX;
  const dy = pawY - anchorY;
  const dz = pawZ - anchorZ;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const totalLen = K.LEG_UPPER_LEN + K.LEG_LOWER_LEN;

  // Clamp reach
  const reach = Math.min(dist, totalLen * 0.98);

  // Midpoint (knee) — offset sideways for visible bend
  // Simple: knee is at halfway point, pushed backward (positive Z) for natural cat knee bend
  const midX = anchorX + dx * 0.5;
  const midZ = anchorZ + dz * 0.5 + 0.012;  // knee pushes back
  const midY = anchorY + dy * 0.5 + (totalLen - reach) * 0.4; // raise knee when leg compressed

  // Upper segment: anchor → knee
  upper.position.set(
    (anchorX + midX) / 2,
    (anchorY + midY) / 2,
    (anchorZ + midZ) / 2
  );
  const uDx = midX - anchorX, uDy = midY - anchorY, uDz = midZ - anchorZ;
  const uLen = Math.sqrt(uDx * uDx + uDy * uDy + uDz * uDz) || 0.01;
  upper.rotation.set(0, 0, 0);
  upper.lookAt(midX, midY, midZ);
  upper.rotateX(Math.PI / 2);
  upper.scale.set(1, uLen / K.LEG_UPPER_LEN, 1);

  // Lower segment: knee → paw
  lower.position.set(
    (midX + pawX) / 2,
    (midY + pawY) / 2,
    (midZ + pawZ) / 2
  );
  const lDx = pawX - midX, lDy = pawY - midY, lDz = pawZ - midZ;
  const lLen = Math.sqrt(lDx * lDx + lDy * lDy + lDz * lDz) || 0.01;
  lower.rotation.set(0, 0, 0);
  lower.lookAt(pawX, pawY, pawZ);
  lower.rotateX(Math.PI / 2);
  lower.scale.set(1, lLen / K.LEG_LOWER_LEN, 1);

  // Paw
  paw.position.set(pawX, pawY, pawZ);
}

/**
 * Update all cat meshes from current spring chain state.
 * dt/beltSpeed drive the walk cycle. nearestDist/nearestDir drive ear rotation.
 */
export function animate(t, dt, beltSpeed, nearestDist, nearestDir) {
  const frontFloor = cat.groundY;
  const backFloor  = cat.backGroundY;
  const flow01 = cat.getFlow01();

  // Body rides higher when legs are longer — daylight under the body
  const legLift = K.LEG_UPPER_LEN + K.LEG_LOWER_LEN - K.PAW_RADIUS;
  const headY = frontFloor + legLift + 0.02;
  const buttY = backFloor + legLift + 0.005;

  // ═══ Body spine — 10 points, nose → butt ═══
  for (let i = 0; i < K.BODY_SPINE_PTS; i++) {
    const prog = i / (K.BODY_SPINE_PTS - 1);
    const sx = cat.headX + (cat.buttX - cat.headX) * prog;
    const sz = cat.headZ + (cat.buttZ - cat.headZ) * prog;
    const sy = headY + (buttY - headY) * prog;
    const noseExtend = (1 - prog) * (1 - prog) * 0.04;
    // Cornish Rex arched back: spine curves UP at the middle, not down
    const arch = Math.sin(prog * Math.PI) * 0.006;
    _bodyPts[i].x = sx;
    _bodyPts[i].z = sz - noseExtend;
    _bodyPts[i].y = sy + arch;
    _bodyRad[i] = K.BODY_RADII[i];
  }
  updateTube(bodyGeo, _bodyPts, _bodyRad);

  // Belly — offset down, smaller (greyhound tuck-up)
  for (let i = 0; i < K.BODY_SPINE_PTS; i++) {
    _bodyPts[i].y -= 0.012;
    _bodyRad[i] = K.BODY_RADII[i] * 0.75;
  }
  updateTube(bellyGeo, _bodyPts, _bodyRad);
  // Restore
  for (let i = 0; i < K.BODY_SPINE_PTS; i++) {
    _bodyPts[i].y += 0.012;
    _bodyRad[i] = K.BODY_RADII[i];
  }

  // ═══ Tail spine — spring chain + state-driven offsets (catTail) ═══
  for (let i = 0; i < K.TAIL_SEGMENTS; i++) {
    const prog = i / (K.TAIL_SEGMENTS - 1);
    catTail.offset(prog, t, _tailOff);
    _tailPts[i].x = cat.tailX[i] + _tailOff.dx;
    _tailPts[i].z = cat.tailZ[i] + _tailOff.dz;
    _tailPts[i].y = buttY + 0.01 + i * 0.006 + _tailOff.dy;
    // Whip taper — sharp Cornish Rex tail: cubic falloff + extra pinch at tip
    const base = 0.018;
    const taper = (1 - prog) * (1 - prog) * (1 - prog);   // cubic = whip
    _tailRad[i] = base * taper + 0.0012;
  }
  updateTube(tailGeo, _tailPts, _tailRad);

  // Tail tip highlight
  for (let i = 0; i < 4; i++) {
    const si = K.TAIL_SEGMENTS - 4 + i;
    _tipPts[i].x = _tailPts[si].x;
    _tipPts[i].y = _tailPts[si].y;
    _tipPts[i].z = _tailPts[si].z;
    _tipRad[i] = _tailRad[si] * 1.02;
  }
  updateTube(tailTipGeo, _tipPts, _tipRad);

  // ═══ Face ═══
  const headX = cat.headX, headZ = cat.headZ;

  // Ears — oversized Cornish Rex, wider spacing for 1.75x scale
  const earY = headY + 0.016;
  catEarL.position.set(headX - 0.038, earY, headZ);
  catEarR.position.set(headX + 0.038, earY, headZ);
  catEarLIn.position.set(headX - 0.038, earY + 0.006, headZ - 0.001);
  catEarRIn.position.set(headX + 0.038, earY + 0.006, headZ - 0.001);

  const earAlert = Math.max(0, 1 - nearestDist / 1.5);
  const earRotBase = 0.04 + earAlert * 0.35;
  catEarL.rotation.z = -(earRotBase + (nearestDir < 0 ? earAlert * 0.3 : 0));
  catEarR.rotation.z =   earRotBase + (nearestDir > 0 ? earAlert * 0.3 : 0);
  catEarL.rotation.x = earAlert * 0.25;
  catEarR.rotation.x = earAlert * 0.25;

  // Eyes
  catGroup.traverse(c => {
    if (c.userData && c.userData.eyeSide !== undefined) {
      c.position.set(headX + c.userData.eyeSide * 0.025, headY + 0.008, headZ - 0.05);
    }
  });

  // Nose + mask — egg-shaped head with Roman nose hint
  catNose.position.set(headX, headY - 0.016, headZ - 0.06);
  catMask.position.set(headX, headY - 0.003, headZ - 0.03);
  catMask.scale.set(0.62, 0.7, 0.8);   // narrow + tall + deep = egg shape

  // Whiskers
  catGroup.traverse(c => {
    if (c.userData && c.userData.whisk) c.position.set(headX, headY - 0.006, headZ - 0.04);
  });

  // ═══ Legs — procedural quadruped gait ═══
  // Phase advances with belt speed — ~2.5 full cycles/sec at base speed
  _walkPhase += beltSpeed * K.WALK_RATE * dt;

  // Flow-responsive stride parameters
  const strideAmp  = lerp(K.STRIDE_AMP_STIFF,  K.STRIDE_AMP_LOOSE,  flow01);
  const stepHeight = lerp(K.STEP_HEIGHT_STIFF,  K.STEP_HEIGHT_LOOSE, flow01);

  // Anchor points — where legs attach to the body spine
  const anchors = [
    // FL: shoulder, left
    { x: headX - K.FRONT_STANCE_X, y: headY - 0.02, z: headZ + K.FRONT_STANCE_Z,
      floorY: frontFloor },
    // FR: shoulder, right
    { x: headX + K.FRONT_STANCE_X, y: headY - 0.02, z: headZ + K.FRONT_STANCE_Z,
      floorY: frontFloor },
    // BL: hip, left
    { x: cat.buttX - K.BACK_STANCE_X, y: buttY - 0.005, z: cat.buttZ - K.BACK_STANCE_Z,
      floorY: backFloor },
    // BR: hip, right
    { x: cat.buttX + K.BACK_STANCE_X, y: buttY - 0.005, z: cat.buttZ - K.BACK_STANCE_Z,
      floorY: backFloor },
  ];

  // Diagonal gait: FL(0)+BR(3) in phase, FR(1)+BL(2) offset by π
  for (let i = 0; i < 4; i++) {
    const leg = _legs[i];
    const anc = anchors[i];
    const isPairA = (i === 0 || i === 3);
    const phase = _walkPhase + (isPairA ? 0 : Math.PI);
    const sinP = Math.sin(phase);

    // Target paw: below anchor, offset forward/back by stride
    const targetX = anc.x;
    const targetZ = anc.z + sinP * strideAmp;
    // Lift paw during forward swing only (sinP > 0 = swinging forward)
    const lift = Math.max(0, sinP) * stepHeight;
    const targetY = anc.floorY + lift;

    // Initialize paw to anchor position on first frame (no wild lerp from origin)
    if (!leg.inited) {
      leg.pawX = targetX;
      leg.pawZ = targetZ;
      leg.pawY = anc.floorY;
      leg.inited = true;
    }

    // Smooth paw toward target — eases into position, never snaps
    leg.pawX += (targetX - leg.pawX) * K.PAW_SMOOTH * dt;
    leg.pawZ += (targetZ - leg.pawZ) * K.PAW_SMOOTH * dt;
    leg.pawY += (targetY - leg.pawY) * K.PAW_GROUND_SNAP * dt;

    // Audio: trigger paw step when paw lands (sin crosses zero going negative)
    if (sinP < 0 && leg.lastSinP >= 0) {
      foley.triggerPawStep(flow01);
    }
    leg.lastSinP = sinP;

    // IK: position the upper/lower/paw meshes
    positionLeg(i, anc.x, anc.y, anc.z, leg.pawX, leg.pawY, leg.pawZ);
  }
}
