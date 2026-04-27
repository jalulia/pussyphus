// ════════════════════════════════════════
// ESCALATOR — step pool, belt scrolling, incline
// Surface detail: tread grooves, alternating step value,
// comb plates, side panel seams, handrail highlights.
// ═════════════════════════════════════��══
import * as THREE from 'three';
import * as K from '../constants.js';
import * as M from '../render/materials.js';

const stepPool = [];
const glassPanels = [];
const _railHighlights = [];

/** Y position on escalator surface at belt-local Z */
export function stepY(z) { return -z * (K.INCLINE / K.STEP_SPACING); }

export function init(scene) {
  const stepGeo = new THREE.BoxGeometry(K.ESC_WIDTH, 0.07, 0.48);
  const riserGeo = new THREE.BoxGeometry(K.ESC_WIDTH * 0.95, 0.25, 0.03);
  const safetyGeo = new THREE.BoxGeometry(0.05, 0.075, 0.48);

  for (let i = 0; i < K.STEP_POOL_SIZE; i++) {
    const sg = new THREE.Group();

    // ── Alternating step value — ±5% breaks uniform gray field ──
    const stepMat = (i % 2 === 0) ? M.step : M.stepAlt;
    sg.add(new THREE.Mesh(stepGeo, stepMat));

    // Edge highlight
    const edge = new THREE.Mesh(new THREE.BoxGeometry(K.ESC_WIDTH * 0.94, 0.075, 0.03), M.stepEdge);
    edge.position.set(0, 0.002, 0.25);
    sg.add(edge);

    // Riser
    const ri = new THREE.Mesh(riserGeo, M.riser);
    ri.position.set(0, -0.09, 0.26);
    sg.add(ri);

    // Safety strips — slightly irregular widths (chipped paint feel)
    for (const s of [-(K.ESC_WIDTH / 2 - 0.04), K.ESC_WIDTH / 2 - 0.04]) {
      const chipScale = 0.92 + Math.random() * 0.08; // 92-100% width
      const sf = new THREE.Mesh(
        new THREE.BoxGeometry(0.05 * chipScale, 0.075, 0.48 * chipScale),
        M.safety
      );
      sf.position.set(s, 0.004, (1 - chipScale) * 0.1 * (Math.random() - 0.5));
      sg.add(sf);
    }

    // ── Tread grooves — parallel to front edge, transforms gray rectangle into metal tread ──
    // Dense groove set: 16 grooves across step width, running front-to-back
    const gv = [];
    const grooveCount = 16;
    for (let g = 0; g < grooveCount; g++) {
      const gx = -(K.ESC_WIDTH / 2 - 0.12) + g * ((K.ESC_WIDTH - 0.24) / (grooveCount - 1));
      gv.push(gx, 0.037, -0.22, gx, 0.037, 0.22);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gv, 3));
    sg.add(new THREE.LineSegments(gg, M.groove));

    // Secondary grooves — wider spaced, darker, perpendicular (cross-hatch feel)
    const gv2 = [];
    for (let g = 0; g < 5; g++) {
      const gz = -0.18 + g * 0.09;
      gv2.push(-(K.ESC_WIDTH / 2 - 0.14), 0.037, gz, K.ESC_WIDTH / 2 - 0.14, 0.037, gz);
    }
    const gg2 = new THREE.BufferGeometry();
    gg2.setAttribute('position', new THREE.Float32BufferAttribute(gv2, 3));
    sg.add(new THREE.LineSegments(gg2, M.grooveDark));

    // ── Comb plate teeth — row of short dark lines at step front edge ──
    const combVerts = [];
    const combTeeth = 22;
    for (let c = 0; c < combTeeth; c++) {
      const cx = -(K.ESC_WIDTH / 2 - 0.08) + c * ((K.ESC_WIDTH - 0.16) / (combTeeth - 1));
      combVerts.push(cx, 0.038, 0.24, cx, 0.038, 0.27);  // short vertical teeth at front edge
    }
    const combGeo = new THREE.BufferGeometry();
    combGeo.setAttribute('position', new THREE.Float32BufferAttribute(combVerts, 3));
    sg.add(new THREE.LineSegments(combGeo, M.combPlate));

    scene.add(sg);
    stepPool.push(sg);
  }

  // ── Side walls — with seam lines ──
  for (const s of [-(K.ESC_WIDTH / 2 + 0.04), K.ESC_WIDTH / 2 + 0.04]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, K.BELT_LENGTH + 3), M.side);
    sw.position.set(s, 0, 0);
    sw.userData.sideWallMain = true;
    scene.add(sw);

    // Side panel seam lines — horizontal seams every ~2 units
    const seamVerts = [];
    const seamCount = Math.floor(K.BELT_LENGTH / 2);
    for (let j = 0; j < seamCount; j++) {
      const sz = -K.BELT_LENGTH / 2 + j * 2;
      // horizontal seam across panel face
      seamVerts.push(
        s, -0.15, sz,  s, -0.15, sz + 0.02,  // short dark tick
        s, 0.25, sz,   s, 0.25, sz + 0.02,    // mid-height seam
        s, 0.65, sz,   s, 0.65, sz + 0.02     // upper seam
      );
    }
    const seamGeo = new THREE.BufferGeometry();
    seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamVerts, 3));
    const seamLines = new THREE.LineSegments(seamGeo, M.sideSeam);
    seamLines.userData.sideWall = true;
    scene.add(seamLines);

    // Scuff patches — very faint lighter areas (subtle surface wear)
    for (let j = 0; j < 4; j++) {
      const scuffZ = -K.BELT_LENGTH / 2 + Math.random() * K.BELT_LENGTH;
      const scuffY = -0.1 + Math.random() * 0.4;
      const scuff = new THREE.Mesh(
        new THREE.PlaneGeometry(0.04, 0.08 + Math.random() * 0.15),
        M.sideScuff
      );
      scuff.position.set(s + (s > 0 ? 0.001 : -0.001), scuffY, scuffZ);
      scuff.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      scuff.userData.sideWall = true;
      scene.add(scuff);
    }
  }

  // ── Glass panels + rails (with highlight breaks) ──
  for (let i = 0; i < K.STEP_POOL_SIZE; i++) {
    for (const s of [-1, 1]) {
      const gp = new THREE.Mesh(new THREE.PlaneGeometry(K.STEP_SPACING * 0.92, 0.7), M.glass);
      gp.rotation.y = Math.PI / 2;
      gp.userData = { s, i };
      scene.add(gp);
      glassPanels.push(gp);

      // Main rail — dark rubber
      const rm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, K.STEP_SPACING * 0.96, 4), M.rail);
      rm.rotation.x = Math.PI / 2;
      rm.userData = { s, i };
      scene.add(rm);
      glassPanels.push(rm);

      // Rail highlight break — small lighter patch where fluorescent catches rubber
      // Every 3rd rail segment gets a highlight
      if (i % 3 === 0) {
        const rh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.030, 0.030, K.STEP_SPACING * 0.2, 4),
          M.railHighlight
        );
        rh.rotation.x = Math.PI / 2;
        rh.userData = { s, i, isHighlight: true };
        scene.add(rh);
        // Store highlights separately — don't mix into glassPanels index
        _railHighlights.push({ mesh: rh, stepIdx: i, side: s });
      }
    }
  }
}

export function update(beltPhase, scene) {
  for (let i = 0; i < K.STEP_POOL_SIZE; i++) {
    const rawZ = -K.BELT_LENGTH / 2 + i * K.STEP_SPACING + (beltPhase % K.STEP_SPACING);
    const z = ((rawZ + K.BELT_LENGTH / 2) % K.BELT_LENGTH + K.BELT_LENGTH) % K.BELT_LENGTH - K.BELT_LENGTH / 2;
    stepPool[i].position.set(0, stepY(z), z);
  }

  // Glass + rails follow steps (2 entries per step per side: glass + rail)
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

  // Rail highlights follow their parent step
  for (const rh of _railHighlights) {
    const sp = stepPool[rh.stepIdx];
    const gx = rh.side * (K.ESC_WIDTH / 2 + 0.04);
    rh.mesh.position.set(gx, sp.position.y + 0.82, sp.position.z);
  }

  // Side walls — only the main wall panels, not seams/scuffs
  scene.traverse(c => {
    if (c.userData && c.userData.sideWallMain) {
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
