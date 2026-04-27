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

      // Sign above — with fake-retail barcode stripes
      const signMat = M.neonPool[Math.floor(Math.random() * 3)];
      const hs = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.18, 0.025),
        signMat
      );
      hs.position.set(kx, 1.3, 0);
      hs.userData.neon = true;
      g.add(hs);

      // Barcode-like horizontal stripes — dissolve into dither at distance
      const stripeVerts = [];
      const stripeCount = 4 + Math.floor(Math.random() * 4);
      for (let sv = 0; sv < stripeCount; sv++) {
        const sy = -0.07 + sv * (0.14 / stripeCount);
        const sw = 0.08 + Math.random() * 0.12;
        stripeVerts.push(kx - sw, 1.3 + sy, -0.014, kx + sw, 1.3 + sy, -0.014);
      }
      const stripeGeo = new THREE.BufferGeometry();
      stripeGeo.setAttribute('position', new THREE.Float32BufferAttribute(stripeVerts, 3));
      const stripeMat = new THREE.LineBasicMaterial({ color: 0x201820, transparent: true, opacity: 0.6 });
      g.add(new THREE.LineSegments(stripeGeo, stripeMat));

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
      // Ad panel — with fake directory/sale detail
      const ab = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.04), M.adPanel);
      ab.position.set(x, 1.2, 0);
      ab.userData.neon = true;
      g.add(ab);

      // Dot grid or block text suggestion — dissolves in dither
      const detailVerts = [];
      const detailType = Math.random();
      if (detailType < 0.4) {
        // Dot grid — directory map feel
        for (let dr = 0; dr < 5; dr++) {
          for (let dc = 0; dc < 4; dc++) {
            const dx = x - 0.12 + dc * 0.08;
            const dy = 1.0 + dr * 0.08;
            detailVerts.push(dx, dy, -0.021, dx + 0.02, dy, -0.021);
          }
        }
      } else if (detailType < 0.7) {
        // Large % glyph suggestion
        detailVerts.push(
          x - 0.08, 1.35, -0.021, x + 0.08, 1.05, -0.021,   // diagonal
          x - 0.06, 1.32, -0.021, x - 0.02, 1.32, -0.021,   // top circle hint
          x + 0.02, 1.08, -0.021, x + 0.06, 1.08, -0.021    // bottom circle hint
        );
      } else {
        // Block letter bars (suggests SALE or OPEN)
        for (let bl = 0; bl < 4; bl++) {
          const bx = x - 0.12 + bl * 0.07;
          const bh = 0.06 + Math.random() * 0.04;
          detailVerts.push(bx, 1.18, -0.021, bx, 1.18 + bh, -0.021);
          detailVerts.push(bx + 0.03, 1.18, -0.021, bx + 0.03, 1.18 + bh * 0.7, -0.021);
        }
      }
      if (detailVerts.length > 0) {
        const detailGeo = new THREE.BufferGeometry();
        detailGeo.setAttribute('position', new THREE.Float32BufferAttribute(detailVerts, 3));
        const detailMat = new THREE.LineBasicMaterial({ color: 0x584850, transparent: true, opacity: 0.5 });
        g.add(new THREE.LineSegments(detailGeo, detailMat));
      }
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
