// ════════════════════════════════════════
// ESCALATOR — step pool, belt scrolling, incline
// ════════════════════════════════════════
import * as THREE from 'three';
import * as K from '../constants.js';
import * as M from '../render/materials.js';

const stepPool = [];
const glassPanels = [];

/** Y position on escalator surface at belt-local Z */
export function stepY(z) { return -z * (K.INCLINE / K.STEP_SPACING); }

export function init(scene) {
  const stepGeo = new THREE.BoxGeometry(K.ESC_WIDTH, 0.07, 0.48);
  const riserGeo = new THREE.BoxGeometry(K.ESC_WIDTH * 0.95, 0.25, 0.03);
  const safetyGeo = new THREE.BoxGeometry(0.05, 0.075, 0.48);

  for (let i = 0; i < K.STEP_POOL_SIZE; i++) {
    const sg = new THREE.Group();
    sg.add(new THREE.Mesh(stepGeo, M.step));

    // Edge highlight
    const edge = new THREE.Mesh(new THREE.BoxGeometry(K.ESC_WIDTH * 0.94, 0.075, 0.03), M.stepEdge);
    edge.position.set(0, 0.002, 0.25);
    sg.add(edge);

    // Riser
    const ri = new THREE.Mesh(riserGeo, M.riser);
    ri.position.set(0, -0.09, 0.26);
    sg.add(ri);

    // Safety strips
    for (const s of [-(K.ESC_WIDTH / 2 - 0.04), K.ESC_WIDTH / 2 - 0.04]) {
      const sf = new THREE.Mesh(safetyGeo, M.safety);
      sf.position.set(s, 0.004, 0);
      sg.add(sf);
    }

    // Grooves
    const gv = [];
    for (let g = 0; g < 11; g++) {
      const gx = -(K.ESC_WIDTH / 2 - 0.15) + g * ((K.ESC_WIDTH - 0.3) / 10);
      gv.push(gx, 0.04, -0.2, gx, 0.04, 0.2);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gv, 3));
    sg.add(new THREE.LineSegments(gg, M.groove));

    scene.add(sg);
    stepPool.push(sg);
  }

  // Side walls
  for (const s of [-(K.ESC_WIDTH / 2 + 0.04), K.ESC_WIDTH / 2 + 0.04]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, K.BELT_LENGTH + 3), M.side);
    sw.position.set(s, 0, 0);
    sw.userData.sideWall = true;
    scene.add(sw);
  }

  // Glass panels + rails
  for (let i = 0; i < K.STEP_POOL_SIZE; i++) {
    for (const s of [-1, 1]) {
      const gp = new THREE.Mesh(new THREE.PlaneGeometry(K.STEP_SPACING * 0.92, 0.7), M.glass);
      gp.rotation.y = Math.PI / 2;
      gp.userData = { s, i };
      scene.add(gp);
      glassPanels.push(gp);

      const rm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, K.STEP_SPACING * 0.96, 4), M.rail);
      rm.rotation.x = Math.PI / 2;
      rm.userData = { s, i };
      scene.add(rm);
      glassPanels.push(rm);
    }
  }
}

export function update(beltPhase, scene) {
  for (let i = 0; i < K.STEP_POOL_SIZE; i++) {
    const rawZ = -K.BELT_LENGTH / 2 + i * K.STEP_SPACING + (beltPhase % K.STEP_SPACING);
    const z = ((rawZ + K.BELT_LENGTH / 2) % K.BELT_LENGTH + K.BELT_LENGTH) % K.BELT_LENGTH - K.BELT_LENGTH / 2;
    stepPool[i].position.set(0, stepY(z), z);
  }

  // Glass + rails follow steps
  let gi = 0;
  for (let i = 0; i < K.STEP_POOL_SIZE; i++) {
    for (const s of [-1, 1]) {
      const sp = stepPool[i];
      const gx = s * (K.ESC_WIDTH / 2 + 0.04);
      glassPanels[gi].position.set(gx, sp.position.y + 0.42, sp.position.z);
      gi++;
      glassPanels[gi].position.set(gx, sp.position.y + 0.82, sp.position.z);
      gi++;
    }
  }

  // Side walls
  scene.traverse(c => {
    if (c.userData && c.userData.sideWall) {
      c.position.z = 0;
      c.position.y = stepY(0) + 0.2;
    }
  });
}

/** Find the nearest step surface Y under a given Z coordinate */
export function findStepSurface(z) {
  let bestY = 0, bestDist = 999;
  for (const step of stepPool) {
    const d = Math.abs(step.position.z - z);
    if (d < bestDist) { bestDist = d; bestY = step.position.y + 0.035; }
  }
  return bestY;
}

export { stepPool };
