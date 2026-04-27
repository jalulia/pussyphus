// ════════════════════════════════════════
// NPCs — humans towering over the kitten
// Tube-geometry silhouettes: each type reads distinct through dither.
// ════════════════════════════════════════
import * as THREE from 'three';
import * as K from '../constants.js';
import * as M from '../render/materials.js';
import { findStepSurface } from './escalator.js';

const npcs = [];
const NPC_TYPES = ['shopper', 'shopper', 'shopper', 'phone', 'salesrep'];

// Acoustic profile per type — used by audio/crowd.js for proximity occlusion.
// absorb = how much high-end the body eats; spread = effective soft radius.
const ACOUSTIC_PROFILE = {
  shopper:  { absorb: 0.5, spread: 0.4 },
  phone:    { absorb: 0.6, spread: 0.3 },
  salesrep: { absorb: 0.3, spread: 0.6 },
};

const NPC_RADII = {
  shopper:  K.NPC_RADII_SHOPPER,
  phone:    K.NPC_RADII_PHONE,
  salesrep: K.NPC_RADII_SALESREP,
};

const NPC_BODY_POOLS = {
  shopper:  M.npcBodyShopper,
  phone:    M.npcBodyPhone,
  salesrep: M.npcBodySalesRep,
};

// Heights per type — feet to head
const NPC_HEIGHTS = { shopper: 1.1, phone: 1.0, salesrep: 1.05 };

// Tube geometry builder (same algorithm as catModel, lighter cross-section)
function makeNpcTubeGeo() {
  const S = K.NPC_TUBE_CROSS_SEGS;
  const N = K.NPC_SPINE_PTS;
  const nv = N * S + 2;
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  const indices = [];
  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < S; j++) {
      const a = i * S + j, b = i * S + (j + 1) % S;
      const c = (i + 1) * S + j, d = (i + 1) * S + (j + 1) % S;
      indices.push(a, c, b, b, c, d);
    }
  }
  const capA = N * S, capB = capA + 1;
  for (let j = 0; j < S; j++) {
    indices.push(capA, j, (j + 1) % S);
    const last = (N - 1) * S;
    indices.push(capB, last + (j + 1) % S, last + j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

// Update NPC tube spine — vertical column with lateral sway and forward lean
function updateNpcTube(geo, radii, height, x, y, sway, fwdLean) {
  const lean = fwdLean || 0;
  const N = K.NPC_SPINE_PTS;
  const S = K.NPC_TUBE_CROSS_SEGS;
  const pos = geo.attributes.position.array;
  for (let i = 0; i < N; i++) {
    const prog = i / (N - 1);
    const px = x + sway * prog * prog;          // lateral sway increases toward head
    const py = y + height * prog;
    const pz = -lean * prog * prog;              // forward lean increases toward head
    const r = radii[i];

    // Tangent is mostly vertical
    let tx = sway * 2 * prog / (N - 1), ty = height / (N - 1);
    let tz = -lean * 2 * prog / (N - 1);
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;

    // Right = cross(tangent, forward≈Z)
    let rx = ty, ry = -tx, rz = 0;
    const rl = Math.sqrt(rx * rx + ry * ry) || 1;
    rx /= rl; ry /= rl;
    // Up = cross(right, tangent)
    let ux = ry * tz - rz * ty;
    let uy = rz * tx - rx * tz;
    let uz = rx * ty - ry * tx;

    for (let j = 0; j < S; j++) {
      const a = (j / S) * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      const idx = (i * S + j) * 3;
      pos[idx]     = px + rx * cx * r + ux * cy * r;
      pos[idx + 1] = py + ry * cx * r + uy * cy * r;
      pos[idx + 2] = pz + rz * cx * r + uz * cy * r;
    }
  }
  const capA = N * S;
  pos[capA * 3] = x; pos[capA * 3 + 1] = y; pos[capA * 3 + 2] = 0;
  const capB = capA + 1;
  pos[capB * 3] = x + sway;
  pos[capB * 3 + 1] = y + height;
  pos[capB * 3 + 2] = -lean;
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}

// ── NPC dimensions ──
// Leg proportions — two-segment: wider thigh, narrower lower leg
const NPC_LEG_HEIGHT  = { shopper: 0.35, phone: 0.38, salesrep: 0.36 };
const NPC_THIGH_R_TOP = 0.05;    // hip end (matches body taper)
const NPC_THIGH_R_BOT = 0.035;   // knee end
const NPC_LOWER_R_TOP = 0.033;   // knee
const NPC_LOWER_R_BOT = 0.022;   // ankle
const NPC_LEG_GAP     = { shopper: 0.08, phone: 0.06, salesrep: 0.07 };
// Shoe proportions — low-profile, proportional to ankle
const NPC_SHOE_W = 0.05;   // slightly wider than ankle
const NPC_SHOE_H = 0.025;  // low profile
const NPC_SHOE_D = 0.09;   // longer front-to-back (shoe-shaped)
// Posture — random lean variation ± this amount (radians)
const NPC_LEAN_JITTER = 0.04;  // ~2-3 degrees

function buildNPC(type) {
  const g = new THREE.Group();
  const bodyMat = M.pick(NPC_BODY_POOLS[type] || NPC_BODY_POOLS.shopper);

  // Main body tube — starts above legs
  const bodyGeo = makeNpcTubeGeo();
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.frustumCulled = false;
  g.add(bodyMesh);

  // Head — sphere on top (skin-toned)
  const sk = M.pick(M.skinPool);
  const headSize = type === 'shopper' ? 0.12 : type === 'salesrep' ? 0.11 : 0.10;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headSize, 5, 4), sk);
  g.add(head);

  // ── Legs — two-segment per leg (thigh + lower) + shoe ──
  const legH = NPC_LEG_HEIGHT[type] || 0.35;
  const thighH = legH * 0.52;   // thigh slightly longer
  const lowerH = legH * 0.48;
  const gap = NPC_LEG_GAP[type] || 0.07;
  const pantsMat = M.pick(M.pantsPool);
  const shoeMat = M.pick(M.shoePool);

  // Left thigh + lower
  const thighL = new THREE.Mesh(
    new THREE.CylinderGeometry(NPC_THIGH_R_TOP, NPC_THIGH_R_BOT, thighH, 6), pantsMat);
  const lowerL = new THREE.Mesh(
    new THREE.CylinderGeometry(NPC_LOWER_R_TOP, NPC_LOWER_R_BOT, lowerH, 6), pantsMat);
  thighL.position.set(-gap, lowerH + thighH / 2, 0);
  lowerL.position.set(-gap, lowerH / 2, 0);
  g.add(thighL, lowerL);

  // Right thigh + lower
  const thighR = new THREE.Mesh(
    new THREE.CylinderGeometry(NPC_THIGH_R_TOP, NPC_THIGH_R_BOT, thighH, 6), pantsMat);
  const lowerR = new THREE.Mesh(
    new THREE.CylinderGeometry(NPC_LOWER_R_TOP, NPC_LOWER_R_BOT, lowerH, 6), pantsMat);
  thighR.position.set(gap, lowerH + thighH / 2, 0);
  lowerR.position.set(gap, lowerH / 2, 0);
  g.add(thighR, lowerR);

  // Shoes — low-profile, proportional
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(NPC_SHOE_W, NPC_SHOE_H, NPC_SHOE_D), shoeMat);
  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(NPC_SHOE_W, NPC_SHOE_H, NPC_SHOE_D), shoeMat);
  shoeL.position.set(-gap, NPC_SHOE_H / 2, 0.01);
  shoeR.position.set( gap, NPC_SHOE_H / 2, 0.01);
  g.add(shoeL, shoeR);

  // Hip connector — wider block bridging body taper to leg tops
  const hipMat = pantsMat;
  const hipW = gap * 2 + NPC_THIGH_R_TOP * 2;  // spans both leg tops
  const hipH = 0.06;
  const hip = new THREE.Mesh(
    new THREE.BoxGeometry(hipW, hipH, NPC_THIGH_R_TOP * 1.8), hipMat);
  hip.position.set(0, legH + hipH / 2, 0);
  g.add(hip);

  // Random lean variation — ±2-3 degrees
  const leanJitter = (Math.random() - 0.5) * NPC_LEAN_JITTER * 2;

  const bodyBase = legH + hipH;   // body tube starts above legs + hip connector

  g.userData = {
    type, passed: false,
    beltZ: 0, lane: 0,
    swingPhase: Math.random() * 6.28,
    leanDir: 0, hasBag: false,
    bodyGeo, bodyBase,
    radii: NPC_RADII[type] || K.NPC_RADII_SHOPPER,
    height: NPC_HEIGHTS[type] || 1.1,
    legH, gap, thighH, lowerH, hipH,
    driftPhase: Math.random() * 6.28,
    headMesh: head, hip,
    thighL, thighR, lowerL, lowerR,
    shoeL, shoeR,
    leanJitter,                            // subtle random lean
    forwardLean: 0,                        // type-specific lean (set below)
    lateralLean: 0,                        // type-specific lean (set below)
  };
  const prof = ACOUSTIC_PROFILE[type] || ACOUSTIC_PROFILE.shopper;
  g.userData.absorb = prof.absorb;
  g.userData.spread = prof.spread;

  // ── Type-specific accessories + posture ──

  // Shopper: wider stance (already via NPC_LEG_GAP), bags at Bo's head height
  if (type === 'shopper') {
    // 80% of shoppers get at least one bag
    if (Math.random() > 0.2) {
      const bagColors = [0xc0a030, 0xc07080, 0xd0d0d0];
      const bc = bagColors[Math.floor(Math.random() * bagColors.length)];
      const bagMat = new THREE.MeshLambertMaterial({ color: bc });
      // Bag hangs at hand height (~0.35 from ground = Bo's head height)
      const bagW = 0.14, bagH = 0.20, bagD = 0.08;
      const bg = new THREE.Mesh(new THREE.BoxGeometry(bagW, bagH, bagD), bagMat);
      bg.position.set(0.22, 0.35, 0);
      bg.userData.isBag = true;
      g.add(bg);
      g.userData.hasBag = true;
      g.userData.spread = 0.7;
      // 50% chance of second bag on opposite side
      if (Math.random() > 0.5) {
        const bc2 = bagColors[Math.floor(Math.random() * bagColors.length)];
        const bg2 = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.18, 0.07),
          new THREE.MeshLambertMaterial({ color: bc2 }));
        bg2.position.set(-0.20, 0.32, 0);
        bg2.userData.isBag = true;
        g.add(bg2);
      }
    }
    // Shopper stands upright — no lean
    g.userData.forwardLean = 0;
    g.userData.lateralLean = 0;
  }

  // Phone Zombie: narrow, 10-15° forward lean, arm + phone
  if (type === 'phone') {
    g.userData.forwardLean = 0.20 + Math.random() * 0.08;  // 12-16° forward lean
    g.userData.lateralLean = 0;
    // Arm extending forward-down (attached to body, not floating)
    const armMat = M.pick(M.shirtPool);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.28, 5), armMat);
    arm.position.set(0.08, 0.60 + bodyBase, 0.14);
    arm.rotation.x = -0.7;
    arm.rotation.z = 0.2;
    g.add(arm);
    // Phone in hand — white or light gray, small rectangle (no teal — that's Bo's color)
    const phoneColor = Math.random() > 0.5 ? 0xd0d0d0 : 0xb0b0b0;
    const ph = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.06, 0.008),
      new THREE.MeshBasicMaterial({ color: phoneColor }));
    ph.position.set(0.12, 0.48 + bodyBase, 0.24);
    g.add(ph);
    g.userData.phoneMesh = ph;
    g.userData.armMesh = arm;
  }

  // Sales Rep: lateral lean toward center, extended arm, yellow-green vest
  if (type === 'salesrep') {
    g.userData.leanDir = Math.random() > 0.5 ? 1 : -1;
    g.userData.forwardLean = 0;
    g.userData.lateralLean = g.userData.leanDir * (0.08 + Math.random() * 0.04);  // 5-7°
    // Yellow-green vest
    const vest = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.22, 0.09),
      new THREE.MeshLambertMaterial({ color: 0xc0b030 }));
    vest.position.set(0, 0.55 + bodyBase, 0.03);
    g.add(vest);
    g.userData.vestMesh = vest;
    // Extended arm gesturing toward center
    const armMat = M.pick(M.shirtPool);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.25, 5), armMat);
    arm.position.set(g.userData.leanDir * 0.18, 0.65 + bodyBase, 0.06);
    arm.rotation.z = -g.userData.leanDir * 0.8;   // arm extends toward center
    arm.rotation.x = -0.3;
    g.add(arm);
    g.userData.armMesh = arm;
  }

  // ── Contact shadow — dark ellipse at feet, grounds NPC on the step ──
  const shadowGeo = new THREE.PlaneGeometry(0.22, 0.14);
  const shadow = new THREE.Mesh(shadowGeo, M.npcShadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.005, 0);   // just above step surface
  g.add(shadow);
  g.userData.shadowMesh = shadow;

  // Initial tube shape — body starts above legs + hip
  updateNpcTube(bodyGeo, g.userData.radii, g.userData.height, 0, bodyBase, 0);

  return g;
}

export function spawn(scene) {
  const n = buildNPC(NPC_TYPES[Math.floor(Math.random() * NPC_TYPES.length)]);
  n.userData.beltZ = -3.5 - Math.random() * 2.5;
  n.userData.lane = (Math.random() - 0.5) * 1.4;
  scene.add(n);
  npcs.push(n);
}

/**
 * Update all NPCs. Returns { dodged, hit, nearestDist, nearestDir }.
 * dodged/hit are counts this frame.
 */
export function update(dt, beltSpeed, t, catHeadX, catStepZ, scene) {
  let dodged = 0, hit = 0;
  let nearestDist = 999, nearestDir = 0;

  for (let i = npcs.length - 1; i >= 0; i--) {
    const n = npcs[i];
    const ud = n.userData;
    ud.beltZ += beltSpeed * dt;
    const z = ud.beltZ;

    // ── Type-specific movement ──
    if (ud.type === 'phone') {
      // Phone Zombie: unpredictable lateral drift
      ud.driftPhase += dt * K.NPC_PHONE_DRIFT_FREQ;
      ud.lane += Math.sin(ud.driftPhase * 3.7 + Math.sin(ud.driftPhase * 1.3) * 2)
                 * K.NPC_PHONE_DRIFT_SPEED * dt;
      ud.lane = Math.max(-0.9, Math.min(0.9, ud.lane));
    }
    if (ud.type === 'salesrep' && !ud.passed) {
      // Sales Rep: drifts toward cat's lane (invasive)
      const dir = catHeadX > ud.lane ? 1 : -1;
      ud.lane += dir * K.NPC_SALES_APPROACH_SPEED * dt;
      ud.lane = Math.max(-0.9, Math.min(0.9, ud.lane));
    }

    // Floor tracking
    const npcStepY = findStepSurface(z);
    n.position.set(ud.lane, npcStepY, z);

    // ── Posture — type-specific lean + random jitter ──
    const fwdLean = ud.forwardLean + ud.leanJitter;   // phone zombie leans forward
    const latLean = ud.lateralLean;                     // sales rep leans sideways
    const bodyBase = ud.bodyBase;

    // Body sway — subtle walk oscillation (bolt-upright NPCs + posture lean)
    const walkSway = Math.sin(t * 1.2 + ud.swingPhase) * 0.015;
    const totalSway = walkSway + latLean;

    // Update tube body with posture (lateral sway + forward lean)
    updateNpcTube(ud.bodyGeo, ud.radii, ud.height, 0, bodyBase, totalSway, fwdLean);

    // Head tracks tube top
    ud.headMesh.position.set(totalSway, bodyBase + ud.height + 0.06, -fwdLean * 0.4);

    // Hip connector follows body
    ud.hip.position.set(totalSway * 0.3, ud.legH + ud.hipH / 2, 0);

    // ── Two-segment leg sway — thighs and lower legs ──
    const legSwing = Math.sin(t * 2.5 + ud.swingPhase) * 0.12;
    const gap = ud.gap;
    const lowerH = ud.lowerH;
    const thighH = ud.thighH;

    // Left leg swings forward, right back (opposite phase)
    ud.thighL.position.set(-gap, lowerH + thighH / 2, legSwing * 0.04);
    ud.thighR.position.set( gap, lowerH + thighH / 2, -legSwing * 0.04);
    ud.thighL.rotation.x = legSwing * 0.5;
    ud.thighR.rotation.x = -legSwing * 0.5;
    ud.lowerL.position.set(-gap, lowerH / 2, legSwing * 0.06);
    ud.lowerR.position.set( gap, lowerH / 2, -legSwing * 0.06);
    ud.lowerL.rotation.x = legSwing * 0.3;
    ud.lowerR.rotation.x = -legSwing * 0.3;

    // Shoes track ankle position
    ud.shoeL.position.set(-gap, NPC_SHOE_H / 2, legSwing * 0.07 + 0.01);
    ud.shoeR.position.set( gap, NPC_SHOE_H / 2, -legSwing * 0.07 + 0.01);

    // ── Bag swing — bags at Bo's head height ──
    if (ud.hasBag) {
      const bagSwing = Math.sin(t * 2 + ud.swingPhase) * 0.03;
      for (const child of n.children) {
        if (child.userData && child.userData.isBag) {
          // Use stored base X so swing doesn't accumulate
          if (child.userData.baseX === undefined) child.userData.baseX = child.position.x;
          const side = child.userData.baseX > 0 ? 1 : -1;
          child.position.x = child.userData.baseX + bagSwing * side;
        }
      }
    }

    // ── Phone zombie: arm + phone bob ──
    if (ud.type === 'phone' && ud.armMesh) {
      const phoneBob = Math.sin(t * 2.5 + ud.driftPhase) * 0.015;
      ud.armMesh.position.y = 0.60 + bodyBase + phoneBob;
      if (ud.phoneMesh) ud.phoneMesh.position.y = 0.48 + bodyBase + phoneBob;
    }

    // ── Sales rep: vest + arm track body lean ──
    if (ud.type === 'salesrep') {
      if (ud.vestMesh) {
        ud.vestMesh.position.x = totalSway * 0.4;
        ud.vestMesh.position.y = 0.55 + bodyBase;
      }
      if (ud.armMesh) {
        ud.armMesh.position.x = ud.leanDir * 0.18 + totalSway * 0.3;
        ud.armMesh.position.y = 0.65 + bodyBase;
      }
    }

    // Proximity sensing for ear tracking
    if (!ud.passed) {
      const nd = Math.sqrt((ud.lane - catHeadX) ** 2 + z ** 2);
      if (nd < nearestDist) { nearestDist = nd; nearestDir = ud.lane > catHeadX ? 1 : -1; }
    }

    // Off screen — dodged
    if (z > 1.5) {
      scene.remove(n);
      if (!ud.passed) dodged++;
      npcs.splice(i, 1);
      continue;
    }

    // Collision
    if (!ud.passed) {
      const dx = Math.abs(ud.lane - catHeadX);
      const dz = Math.abs(z - catStepZ);
      if (dx < K.NPC_HIT_RADIUS_X && dz < K.NPC_HIT_RADIUS_Z) {
        ud.passed = true;
        hit++;
      }
    }
  }

  return { dodged, hit, nearestDist, nearestDir };
}

export function reset(scene) {
  for (const n of npcs) scene.remove(n);
  npcs.length = 0;
}

export { npcs };
