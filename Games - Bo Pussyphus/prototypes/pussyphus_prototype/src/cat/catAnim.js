// ════════════════════════════════════════
// CAT ANIM — per-frame skeleton → mesh update
// Gait-driven compression/extension, surface-anchored paws,
// lateral body-chain threading, locomotion state posture.
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
    anchorX: 0, anchorZ: 0,           // where paw planted on the step surface
    lastSinP: 0,                       // previous sin(phase) for audio trigger
    planted: false,                    // is the paw currently on the ground?
    inited: false,                     // set true once paw snaps to anchor on first frame
    slipZ: 0,                          // accumulated backward slip on this paw
  });
}

// ── Smoothed head Y (more stable than torso) ──
let _smoothHeadY = 0;

// ── Helpers ──
function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Position a two-segment leg (upper + lower cylinder + paw sphere)
 * given hip/shoulder anchor and paw target. Simple IK.
 */
function positionLeg(legIdx, anchorX, anchorY, anchorZ, pawX, pawY, pawZ) {
  const base = legIdx * 3;
  const upper = catLegs[base];
  const lower = catLegs[base + 1];
  const paw   = catLegs[base + 2];

  const dx = pawX - anchorX;
  const dy = pawY - anchorY;
  const dz = pawZ - anchorZ;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const totalLen = K.LEG_UPPER_LEN + K.LEG_LOWER_LEN;
  const reach = Math.min(dist, totalLen * 0.98);

  const midX = anchorX + dx * 0.5;
  const midZ = anchorZ + dz * 0.5 + 0.012;
  const midY = anchorY + dy * 0.5 + (totalLen - reach) * 0.4;

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

  paw.position.set(pawX, pawY, pawZ);
}

/**
 * Update all cat meshes from current spring chain state.
 * Gait driven by cat.gaitPhase (relative speed). nearestDist/nearestDir drive ear rotation.
 */
export function animate(t, dt, beltSpeed, nearestDist, nearestDir) {
  const frontFloor = cat.groundY;
  const backFloor  = cat.backGroundY;
  const flow01 = cat.getFlow01();
  const loco = cat.locoState;

  // ══ P2: Gait-driven body height — not a sine bob ══
  const legLift = K.LEG_UPPER_LEN + K.LEG_LOWER_LEN - K.PAW_RADIUS;

  // Composure break compression
  let breakCompress = 0;
  if (loco === 3) {
    const breakT = cat.getLocoTimer01();
    breakCompress = K.LOCO_BREAK_COMPRESS * (1 - breakT); // sharp compress, then release
  }

  // Shoulder dips on front-plant, hip lifts on rear-push (from gait in cat.js)
  const rawHeadY = frontFloor + legLift + 0.02 + cat.gaitHeadCounter - breakCompress;
  const shoulderY = frontFloor + legLift + 0.02 - cat.gaitShoulderDip - breakCompress;
  const buttY = backFloor + legLift + 0.005 + cat.gaitHipLift - breakCompress * 0.6;

  // Head is more stable than torso — smooth it heavily
  // Low factor = stable head that floats above the torso compression/extension
  if (_smoothHeadY === 0) _smoothHeadY = rawHeadY; // init
  const headSmooth = 1 - Math.pow(1 - K.GAIT_HEAD_SMOOTH, dt * 60); // framerate-independent
  _smoothHeadY += (rawHeadY - _smoothHeadY) * headSmooth;
  const headY = _smoothHeadY;

  // Slip pulls Bo backward slightly (body root follows paw slip)
  const slipBodyDelta = -cat.slipOffset * K.SLIP_BODY_FRACTION;

  // ══ P6: Lateral body-chain yaw — sequential commitment ══
  const latV = cat.lateralVelocity;
  const dLatV = cat.delayedLateralVel;
  const headYaw = latV * K.LATERAL_HEAD_YAW;
  const shoulderYaw = latV * K.LATERAL_SHOULDER_YAW;
  const hipYaw = dLatV * K.LATERAL_HIP_YAW;       // delayed
  const tailYaw = latV * K.LATERAL_TAIL_YAW;       // counters

  // ═══ Body spine — 10 points, nose → butt ═══
  // Spine endpoints incorporate gait compression + spine stretch
  const spineLen = 1 + cat.gaitSpineStretch;  // normalized
  for (let i = 0; i < K.BODY_SPINE_PTS; i++) {
    const prog = i / (K.BODY_SPINE_PTS - 1);

    // Lateral: head leads, butt lags (yaw creates S-curve through spring chain)
    const yawOffset = lerp(headYaw, hipYaw, prog) * 0.015; // subtle X offset from yaw
    const sx = cat.headX + (cat.buttX - cat.headX) * prog + yawOffset;
    const sz = cat.headZ + (cat.buttZ - cat.headZ) * prog * spineLen + slipBodyDelta;

    // Height: head is stable, shoulders dip, hips lift
    let sy;
    if (prog < 0.3) {
      // Head to shoulder region
      sy = headY + (shoulderY - headY) * (prog / 0.3);
    } else {
      // Shoulder to butt
      const subProg = (prog - 0.3) / 0.7;
      sy = shoulderY + (buttY - shoulderY) * subProg;
    }

    const noseExtend = (1 - prog) * (1 - prog) * 0.04;
    // Cornish Rex arched back — enforce minimum arch
    const rawArch = Math.sin(prog * Math.PI) * (0.006 + cat.gaitSpineStretch * 0.5);
    const arch = Math.max(rawArch, K.MIN_SPINE_ARCH * Math.sin(prog * Math.PI));

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
    _tailPts[i].x = cat.tailX[i] + _tailOff.dx + tailYaw * prog * 0.01; // tail counters lateral
    _tailPts[i].z = cat.tailZ[i] + _tailOff.dz;
    _tailPts[i].y = buttY + 0.01 + i * 0.006 + _tailOff.dy;
    const base = 0.018;
    const taper = (1 - prog) * (1 - prog) * (1 - prog);
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
  const faceHeadX = cat.headX + headYaw * 0.008; // head turns toward intent
  const headZ = cat.headZ;

  // ══ P7: Ear behavior by locomotion state ══
  const earY = headY + 0.016;
  catEarL.position.set(faceHeadX - 0.038, earY, headZ);
  catEarR.position.set(faceHeadX + 0.038, earY, headZ);
  catEarLIn.position.set(faceHeadX - 0.038, earY + 0.006, headZ - 0.001);
  catEarRIn.position.set(faceHeadX + 0.038, earY + 0.006, headZ - 0.001);

  const earAlert = Math.max(0, 1 - nearestDist / 1.5);
  let earRotBase = 0.04 + earAlert * 0.35;
  let earFlattenX = earAlert * 0.25;

  // Composure break: ears flatten back hard
  if (loco === 3) {
    const breakT = cat.getLocoTimer01();
    earRotBase += 0.4 * (1 - breakT);
    earFlattenX += 0.5 * (1 - breakT);
  }
  // Recompose: ears slowly return
  if (loco === 4) {
    const recompT = cat.getLocoTimer01();
    earRotBase += 0.15 * (1 - recompT);
    earFlattenX += 0.2 * (1 - recompT);
  }

  catEarL.rotation.z = -(earRotBase + (nearestDir < 0 ? earAlert * 0.3 : 0));
  catEarR.rotation.z =   earRotBase + (nearestDir > 0 ? earAlert * 0.3 : 0);
  catEarL.rotation.x = earFlattenX;
  catEarR.rotation.x = earFlattenX;

  // Eyes — follow head yaw
  catGroup.traverse(c => {
    if (c.userData && c.userData.eyeSide !== undefined) {
      c.position.set(faceHeadX + c.userData.eyeSide * 0.025, headY + 0.008, headZ - 0.05);
    }
  });

  // Nose + mask
  catNose.position.set(faceHeadX, headY - 0.016, headZ - 0.06);
  catMask.position.set(faceHeadX, headY - 0.003, headZ - 0.03);
  catMask.scale.set(0.62, 0.7, 0.8);

  // Whiskers
  catGroup.traverse(c => {
    if (c.userData && c.userData.whisk) c.position.set(faceHeadX, headY - 0.006, headZ - 0.04);
  });

  // ═══ Legs — P3+P4: gait-driven diagonal quadruped ═══
  // Phase comes from cat.gaitPhase (driven by relative speed, not wall clock)
  const walkPhase = cat.gaitPhase;

  // Flow-responsive stride parameters
  const strideAmp  = lerp(K.STRIDE_AMP_STIFF,  K.STRIDE_AMP_LOOSE,  flow01);
  const stepHeight = lerp(K.STEP_HEIGHT_STIFF,  K.STEP_HEIGHT_LOOSE, flow01);

  // Anchor points — where legs attach to the body spine
  // Incorporate lateral yaw: shoulders lead, hips lag
  const shoulderXOff = shoulderYaw * 0.008;
  const hipXOff = hipYaw * 0.008;

  const anchors = [
    // FL: shoulder, left
    { x: faceHeadX - K.FRONT_STANCE_X + shoulderXOff, y: shoulderY - 0.02, z: headZ + K.FRONT_STANCE_Z,
      floorY: frontFloor, isFront: true },
    // FR: shoulder, right
    { x: faceHeadX + K.FRONT_STANCE_X + shoulderXOff, y: shoulderY - 0.02, z: headZ + K.FRONT_STANCE_Z,
      floorY: frontFloor, isFront: true },
    // BL: hip, left
    { x: cat.buttX - K.BACK_STANCE_X + hipXOff, y: buttY - 0.005, z: cat.buttZ - K.BACK_STANCE_Z,
      floorY: backFloor, isFront: false },
    // BR: hip, right
    { x: cat.buttX + K.BACK_STANCE_X + hipXOff, y: buttY - 0.005, z: cat.buttZ - K.BACK_STANCE_Z,
      floorY: backFloor, isFront: false },
  ];

  // Diagonal gait: FL(0)+BR(3) in phase, FR(1)+BL(2) offset by π
  for (let i = 0; i < 4; i++) {
    const leg = _legs[i];
    const anc = anchors[i];
    const isPairA = (i === 0 || i === 3);
    const phase = walkPhase + (isPairA ? 0 : Math.PI);
    const sinP = Math.sin(phase);
    const cosP = Math.cos(phase);

    // ── P4: Differentiate front vs rear paw behavior ──
    const isFront = anc.isFront;
    const contactFrac = isFront ? K.FRONT_PAW_CONTACT : K.REAR_PAW_CONTACT;
    const strideScale = isFront ? 1.0 : K.REAR_PUSH_STRIDE;

    // Plant/swing: paw is planted when sin(phase) < contactFrac threshold
    // (we use cosP to define: planted when cosP < 0, i.e. descending half of cycle)
    const isSwinging = sinP > 0;
    const isPlanting = !isSwinging;

    // Target paw: stride differs front vs rear
    const strideZ = sinP * strideAmp * strideScale;
    const targetX = anc.x;
    const targetZ = anc.z + strideZ + slipBodyDelta;

    // Lift during forward swing only; rear paws stay lower longer
    const liftScale = isFront ? 1.0 : 0.7; // rear paws hug the surface more
    const lift = Math.max(0, sinP) * stepHeight * liftScale;
    const targetY = anc.floorY + lift;

    // Init paw position on first frame
    if (!leg.inited) {
      leg.pawX = targetX;
      leg.pawZ = targetZ;
      leg.pawY = anc.floorY;
      leg.anchorX = targetX;
      leg.anchorZ = targetZ;
      leg.inited = true;
    }

    // ── P4: Paw anchoring ──
    if (isPlanting && !leg.planted) {
      // Paw just touched down — anchor it to the surface
      leg.anchorX = targetX;
      leg.anchorZ = targetZ;
      leg.planted = true;
      leg.slipZ = 0;

      // ── P5: Micro-slip on plant ──
      if (loco !== 2) { // not in flow climb (clean footfalls)
        const slipAmount = K.SLIP_PAW_AMOUNT * (1 - flow01);
        leg.slipZ = slipAmount;
      }
    }
    if (isSwinging) {
      leg.planted = false;
    }

    // Planted paw stays at anchor (+ slip drift); swinging paw tracks target
    let goalX, goalZ, goalY;
    if (leg.planted) {
      // Paw anchored to step surface — slip drifts it backward
      goalX = leg.anchorX;
      goalZ = leg.anchorZ + leg.slipZ; // slip = positive Z = backward on escalator
      goalY = anc.floorY;
      // Decay slip (Bo pushes against it)
      leg.slipZ *= Math.max(0, 1 - K.SLIP_DECAY * dt);
    } else {
      // Swinging — reach forward to next plant position
      goalX = targetX;
      goalZ = targetZ;
      goalY = targetY;
    }

    // Smooth paw toward goal
    const pawSpd = leg.planted ? K.PAW_GROUND_SNAP : K.PAW_SMOOTH;
    leg.pawX += (goalX - leg.pawX) * pawSpd * dt;
    leg.pawZ += (goalZ - leg.pawZ) * pawSpd * dt;
    leg.pawY += (goalY - leg.pawY) * pawSpd * dt;

    // Audio: trigger paw step when paw lands (sin crosses zero going negative)
    if (sinP < 0 && leg.lastSinP >= 0) {
      foley.triggerPawStep(flow01);
    }
    leg.lastSinP = sinP;

    // IK: position the upper/lower/paw meshes
    positionLeg(i, anc.x, anc.y, anc.z, leg.pawX, leg.pawY, leg.pawZ);
  }
}
