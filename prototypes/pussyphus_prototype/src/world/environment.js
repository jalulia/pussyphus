// ════════════════════════════════════════
// ENVIRONMENT — kiosk canyon chunks
// ════════════════════════════════════════
import * as THREE from 'three';
import * as K from '../constants.js';
import * as M from '../render/materials.js';
import { stepY } from './escalator.js';

const chunks = [];

function buildChunk(scene) {
  const g = new THREE.Group();

  // Ceiling light
  const cl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.025, 0.18), M.ceiling);
  cl.position.y = 3.0;
  g.add(cl);

  for (const side of [-1, 1]) {
    const x = side * (K.ESC_WIDTH / 2 + 1.2);
    const r = Math.random();

    if (r < 0.3) {
      // Kiosk intruding into escalator space
      const kx = side * (K.ESC_WIDTH / 2 + 0.35);
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.38), M.laminate);
      k.position.set(kx, 0.35, 0);
      g.add(k);

      const kt = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.025, 0.48), M.chrome);
      kt.position.set(kx, 0.72, 0);
      g.add(kt);

      // Sign above
      const hs = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.18, 0.025),
        M.neonPool[Math.floor(Math.random() * 3)]
      );
      hs.position.set(kx, 1.3, 0);
      hs.userData.neon = true;
      g.add(hs);

      // Rack
      if (Math.random() > 0.5) {
        const ar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 0.38), M.chrome);
        ar.position.set(side * (K.ESC_WIDTH / 2 + 0.12), 0.37, (Math.random() - 0.5) * 0.4);
        g.add(ar);
      }
    } else if (r < 0.5) {
      // Column
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 3, 6), M.column);
      c.position.set(x, 1.5, 0);
      g.add(c);
    } else if (r < 0.65) {
      // Potted ficus
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.2, 6), M.pot);
      p.position.set(x * 0.85, 0.1, 0);
      g.add(p);
      const lf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 5, 4), M.ficus);
      lf.position.set(x * 0.85, 0.4, 0);
      g.add(lf);
    } else {
      // Ad panel
      const ab = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.04), M.adPanel);
      ab.position.set(x, 1.2, 0);
      ab.userData.neon = true;
      g.add(ab);
    }

    // Wall
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(2, 3.2), M.mallWall);
    ws.position.set(side * 3.2, 1.5, 0);
    ws.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(ws);

    // Floor
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(2, K.ENV_CHUNK_SPACING), M.terrazzo);
    fp.rotation.x = -Math.PI / 2;
    fp.position.set(side * 2.2, -0.03, 0);
    g.add(fp);
  }

  scene.add(g);
  return g;
}

export function init(scene) {
  for (let i = 0; i < K.ENV_CHUNK_COUNT; i++) {
    chunks.push(buildChunk(scene));
  }
}

export function update() {
  for (let i = 0; i < K.ENV_CHUNK_COUNT; i++) {
    const z = -K.ENV_CHUNK_COUNT * K.ENV_CHUNK_SPACING / 2 + i * K.ENV_CHUNK_SPACING;
    chunks[i].position.set(0, stepY(z), z);
  }
}

/** Flicker neon signs — call once per frame */
export function flickerNeon(scene, t) {
  scene.traverse(c => {
    if (c.userData && c.userData.neon && c.material) {
      c.material.opacity = 0.5 + Math.sin(t * 3 + c.id) * 0.25;
    }
  });
}
