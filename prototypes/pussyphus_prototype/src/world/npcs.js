// ════════════════════════════════════════
// NPCs — humans towering over the kitten
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

function buildNPC(type) {
  const g = new THREE.Group();
  const sk = M.pick(M.skinPool);
  const sh = M.pick(M.shirtPool);
  const pa = M.pick(M.pantsPool);
  const sho = M.pick(M.shoePool);

  // Legs
  for (const s of [-0.09, 0.09]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.14), pa);
    leg.position.set(s, 0.22, 0);
    g.add(leg);
  }
  // Shoes
  for (const s of [-0.09, 0.09]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.2), sho);
    shoe.position.set(s, 0.02, 0.03);
    g.add(shoe);
  }
  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45, 0.22), sh);
  torso.position.set(0, 0.68, 0);
  g.add(torso);
  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), sk);
  head.position.set(0, 1.05, 0);
  g.add(head);
  // Hair
  const hairCols = [0x2a2428, 0x3a3230, 0x282830, 0x4a3828, 0x1a1818];
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 5, 4),
    new THREE.MeshLambertMaterial({ color: hairCols[Math.floor(Math.random() * hairCols.length)] })
  );
  hair.position.set(0, 1.12, 0);
  hair.scale.set(1, 0.7, 1);
  g.add(hair);

  g.userData = {
    type, passed: false,
    beltZ: 0, lane: 0,
    swingPhase: Math.random() * 6.28,
    leanDir: 0, hasBag: false,
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
    g.userData.spread = 0.7;  // shopping bag adds soft-edge to occlusion
  }
  if (type === 'salesrep') {
    g.userData.leanDir = Math.random() > 0.5 ? 1 : -1;
    g.rotation.y = g.userData.leanDir * 0.3;
  }
  if (type === 'phone') {
    const ph = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.015), M.catPupil);
    ph.position.set(0.14, 0.85, 0.1);
    g.add(ph);
  }

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
    n.userData.beltZ += beltSpeed * dt;
    const z = n.userData.beltZ;

    // Floor tracking
    const npcStepY = findStepSurface(z);
    n.position.set(n.userData.lane, npcStepY, z);

    // Animations
    if (n.userData.hasBag) {
      const bagMesh = n.children[n.children.length - 1];
      if (bagMesh) bagMesh.position.x = 0.28 + Math.sin(t * 2 + n.userData.swingPhase) * 0.06;
    }
    if (n.userData.type === 'salesrep') {
      n.rotation.y = n.userData.leanDir * (0.3 + Math.sin(t * 1.5) * 0.1);
    }

    // Proximity sensing for ear tracking
    if (!n.userData.passed) {
      const nd = Math.sqrt((n.userData.lane - catHeadX) ** 2 + z ** 2);
      if (nd < nearestDist) { nearestDist = nd; nearestDir = n.userData.lane > catHeadX ? 1 : -1; }
    }

    // Off screen — dodged
    if (z > 1.5) {
      scene.remove(n);
      if (!n.userData.passed) dodged++;
      npcs.splice(i, 1);
      continue;
    }

    // Collision
    if (!n.userData.passed) {
      const dx = Math.abs(n.userData.lane - catHeadX);
      const dz = Math.abs(z - catStepZ);
      if (dx < K.NPC_HIT_RADIUS_X && dz < K.NPC_HIT_RADIUS_Z) {
        n.userData.passed = true;
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
