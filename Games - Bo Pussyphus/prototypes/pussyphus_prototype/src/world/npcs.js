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

// Update NPC tube spine — vertical column, slight sway
function updateNpcTube(geo, radii, height, x, y, sway) {
  const N = K.NPC_SPINE_PTS;
  const S = K.NPC_TUBE_CROSS_SEGS;
  const pos = geo.attributes.position.array;
  for (let i = 0; i < N; i++) {
    const prog = i / (N - 1);
    const px = x + sway * prog * prog;    // sway increases toward head
    const py = y + height * prog;
    const pz = 0;
    const r = radii[i];

    // Tangent is mostly vertical
    let tx = sway * 2 * prog / (N - 1), ty = height / (N - 1), tz = 0;
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tl; ty /= tl;

    // Right = cross(tangent, forward)
    let rx = ty, ry = -tx, rz = 0;
    // Up = cross(right, tangent) — for vertical tubes this is roughly Z
    let ux = 0, uy = 0, uz = 1;

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
  pos[capB * 3] = x + sway; pos[capB * 3 + 1] = y + height; pos[capB * 3 + 2] = 0;
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}

function buildNPC(type) {
  const g = new THREE.Group();
  const bodyMat = M.pick(NPC_BODY_POOLS[type] || NPC_BODY_POOLS.shopper);

  // Main body tube
  const bodyGeo = makeNpcTubeGeo();
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.frustumCulled = false;
  g.add(bodyMesh);

  // Head — sphere on top (skin-toned)
  const sk = M.pick(M.skinPool);
  const headSize = type === 'shopper' ? 0.12 : type === 'salesrep' ? 0.11 : 0.10;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headSize, 5, 4), sk);
  g.add(head);

  // Feet — two dark blocks at base
  const sho = M.pick(M.shoePool);
  for (const s of [-0.08, 0.08]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.05, 0.16), sho);
    foot.position.set(s, 0.025, 0.02);
    g.add(foot);
  }

  g.userData = {
    type, passed: false,
    beltZ: 0, lane: 0,
    swingPhase: Math.random() * 6.28,
    leanDir: 0, hasBag: false,
    bodyGeo,                               // ref for per-frame tube update
    radii: NPC_RADII[type] || K.NPC_RADII_SHOPPER,
    height: NPC_HEIGHTS[type] || 1.1,
    driftPhase: Math.random() * 6.28,      // for phone zombie drift
    headMesh: head,
  };
  const prof = ACOUSTIC_PROFILE[type] || ACOUSTIC_PROFILE.shopper;
  g.userData.absorb = prof.absorb;
  g.userData.spread = prof.spread;

  // Type-specific accessories
  if (type === 'shopper' && Math.random() > 0.4) {
    const bg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.08), M.pick(M.bagPool));
    bg.position.set(0.28, 0.5, 0);
    g.add(bg);
    g.userData.hasBag = true;
    g.userData.spread = 0.7;
  }
  if (type === 'salesrep') {
    g.userData.leanDir = Math.random() > 0.5 ? 1 : -1;
  }
  if (type === 'phone') {
    const ph = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.015), M.catPupil);
    ph.position.set(0.12, 0.75, 0.08);
    g.add(ph);
  }

  // Initial tube shape
  updateNpcTube(bodyGeo, g.userData.radii, g.userData.height, 0, 0, 0);

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

    // ── Per-frame tube body update — stiff sway ──
    const sway = ud.type === 'salesrep'
      ? ud.leanDir * (0.06 + Math.sin(t * 1.5) * 0.02)   // forward lean
      : Math.sin(t * 1.2 + ud.swingPhase) * 0.02;         // subtle walk sway
    updateNpcTube(ud.bodyGeo, ud.radii, ud.height, 0, 0, sway);

    // Head tracks tube top
    ud.headMesh.position.set(sway, ud.height + 0.06, 0);

    // Bag swing animation
    if (ud.hasBag) {
      // Bag is the last child before shoes/phone — find it
      for (const child of n.children) {
        if (child.geometry && child.geometry.type === 'BoxGeometry'
            && child.position.x > 0.2) {
          child.position.x = 0.28 + Math.sin(t * 2 + ud.swingPhase) * 0.06;
          break;
        }
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
