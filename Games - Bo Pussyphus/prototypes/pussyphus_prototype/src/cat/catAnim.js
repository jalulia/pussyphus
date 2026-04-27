// ════════════════════════════════════════
// CAT ANIM — per-frame skeleton → mesh update
// ════════════════════════════════════════
import * as K from '../constants.js';
import * as cat from './cat.js';
import * as catTail from './catTail.js';
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

/**
 * Update all cat meshes from current spring chain state.
 * nearestDist/nearestDir come from NPC proximity sensing.
 */
export function animate(t, nearestDist, nearestDir) {
  const frontFloor = cat.groundY;
  const backFloor  = cat.backGroundY;
  const headY = frontFloor + 0.09;
  const buttY = backFloor + 0.065;

  // ═══ Body spine — 10 points, nose → butt ═══
  for (let i = 0; i < K.BODY_SPINE_PTS; i++) {
    const prog = i / (K.BODY_SPINE_PTS - 1);
    const sx = cat.headX + (cat.buttX - cat.headX) * prog;
    const sz = cat.headZ + (cat.buttZ - cat.headZ) * prog;
    const sy = headY + (buttY - headY) * prog;
    const noseExtend = (1 - prog) * (1 - prog) * 0.04;
    const sag = Math.sin(prog * Math.PI) * 0.008;
    _bodyPts[i].x = sx;
    _bodyPts[i].z = sz - noseExtend;
    _bodyPts[i].y = sy - sag;
    _bodyRad[i] = K.BODY_RADII[i];
  }
  updateTube(bodyGeo, _bodyPts, _bodyRad);

  // Belly — offset down, smaller
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

  // ═══ Legs — long Cornish Rex stilts ═══
  const wt = t * (3 + Math.abs(headX - cat.buttX) * 30);
  const w = Math.sin(wt);
  // Front legs — cylinder center raised for 0.08 height
  catLegs[0].position.set(headX - 0.028, frontFloor + 0.05, headZ + 0.02); catLegs[0].rotation.x = w * 0.3;
  catLegs[1].position.set(headX - 0.028, frontFloor + 0.008, headZ + 0.02);
  catLegs[2].position.set(headX + 0.028, frontFloor + 0.05, headZ + 0.02); catLegs[2].rotation.x = -w * 0.3;
  catLegs[3].position.set(headX + 0.028, frontFloor + 0.008, headZ + 0.02);
  // Back legs — slightly wider stance
  catLegs[4].position.set(cat.buttX - 0.03, backFloor + 0.048, cat.buttZ); catLegs[4].rotation.x = -w * 0.3;
  catLegs[5].position.set(cat.buttX - 0.03, backFloor + 0.008, cat.buttZ);
  catLegs[6].position.set(cat.buttX + 0.03, backFloor + 0.048, cat.buttZ); catLegs[6].rotation.x = w * 0.3;
  catLegs[7].position.set(cat.buttX + 0.03, backFloor + 0.008, cat.buttZ);
}
