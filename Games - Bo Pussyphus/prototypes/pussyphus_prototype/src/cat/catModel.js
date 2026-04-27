// ════════════════════════════════════════
// CAT MODEL — Three.js meshes for Bo
// Seal point Cornish Rex: tube body, face details, legs
// ════════════════════════════════════════
import * as THREE from 'three';
import * as K from '../constants.js';
import * as M from '../render/materials.js';

export let catGroup;
export let catEarL, catEarR, catEarLIn, catEarRIn;
export let catMask, catNose;
export const catLegs = [];

// Tube geometry builder
function makeTubeGeo(numSpine) {
  const S = K.TUBE_CROSS_SEGS;
  const nv = numSpine * S + 2;
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  const indices = [];

  for (let i = 0; i < numSpine - 1; i++) {
    for (let j = 0; j < S; j++) {
      const a = i * S + j, b = i * S + (j + 1) % S;
      const c = (i + 1) * S + j, d = (i + 1) * S + (j + 1) % S;
      indices.push(a, c, b, b, c, d);
    }
  }
  const capA = numSpine * S, capB = capA + 1;
  for (let j = 0; j < S; j++) {
    indices.push(capA, j, (j + 1) % S);
    const last = (numSpine - 1) * S;
    indices.push(capB, last + (j + 1) % S, last + j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

export function updateTube(geo, points, radii) {
  const S = K.TUBE_CROSS_SEGS;
  const pos = geo.attributes.position.array;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const p = points[i], r = radii[i];
    let tx = 0, ty = 0, tz = 1;
    if (i < n - 1) { tx = points[i+1].x - p.x; ty = points[i+1].y - p.y; tz = points[i+1].z - p.z; }
    else if (i > 0) { tx = p.x - points[i-1].x; ty = p.y - points[i-1].y; tz = p.z - points[i-1].z; }
    const tl = Math.sqrt(tx*tx + ty*ty + tz*tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;

    let ux = 0, uy = 1, uz = 0;
    let rx = ty*uz - tz*uy, ry = tz*ux - tx*uz, rz = tx*uy - ty*ux;
    let rl = Math.sqrt(rx*rx + ry*ry + rz*rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    ux = ry*tz - rz*ty; uy = rz*tx - rx*tz; uz = rx*ty - ry*tx;

    for (let j = 0; j < S; j++) {
      const a = (j / S) * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      const idx = (i * S + j) * 3;
      pos[idx]   = p.x + rx*cx*r + ux*cy*r;
      pos[idx+1] = p.y + ry*cx*r + uy*cy*r;
      pos[idx+2] = p.z + rz*cx*r + uz*cy*r;
    }
  }

  const capA = n * S;
  pos[capA*3] = points[0].x; pos[capA*3+1] = points[0].y; pos[capA*3+2] = points[0].z;
  const capB = capA + 1;
  pos[capB*3] = points[n-1].x; pos[capB*3+1] = points[n-1].y; pos[capB*3+2] = points[n-1].z;
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}

// Mesh references (set during init)
export let bodyGeo, bellyGeo, tailGeo, tailTipGeo;

export function init(scene) {
  catGroup = new THREE.Group();
  scene.add(catGroup);

  // Body tube
  bodyGeo = makeTubeGeo(K.BODY_SPINE_PTS);
  const bodyMesh = new THREE.Mesh(bodyGeo, M.catBody);
  bodyMesh.frustumCulled = false;
  catGroup.add(bodyMesh);

  // Belly tube
  bellyGeo = makeTubeGeo(K.BODY_SPINE_PTS);
  const bellyMesh = new THREE.Mesh(bellyGeo, M.catLight);
  bellyMesh.frustumCulled = false;
  catGroup.add(bellyMesh);

  // Tail tube
  tailGeo = makeTubeGeo(K.TAIL_SEGMENTS);
  const tailMesh = new THREE.Mesh(tailGeo, M.catBody);
  tailMesh.frustumCulled = false;
  catGroup.add(tailMesh);

  // Tail tip (dark point)
  tailTipGeo = makeTubeGeo(4);
  const tailTipMesh = new THREE.Mesh(tailTipGeo, M.catPoint);
  tailTipMesh.frustumCulled = false;
  catGroup.add(tailTipMesh);

  // ── Ears — seal point, OVERSIZED (Cornish Rex!) ──
  // 1.75x scale — the breed's most distinctive feature AND proximity feedback tool.
  // Base on head, taper upward. Origin translated to base so position=base attachment.
  const EAR_H = 0.07, EAR_H_IN = 0.049;
  const earGeoL   = new THREE.ConeGeometry(0.036, EAR_H,    4);
  const earGeoR   = new THREE.ConeGeometry(0.036, EAR_H,    4);
  const earGeoLIn = new THREE.ConeGeometry(0.022, EAR_H_IN, 4);
  const earGeoRIn = new THREE.ConeGeometry(0.022, EAR_H_IN, 4);
  earGeoL.translate(0,   EAR_H/2,    0);
  earGeoR.translate(0,   EAR_H/2,    0);
  earGeoLIn.translate(0, EAR_H_IN/2, 0);
  earGeoRIn.translate(0, EAR_H_IN/2, 0);
  catEarL   = new THREE.Mesh(earGeoL,   M.catEar);
  catEarR   = new THREE.Mesh(earGeoR,   M.catEar);
  catEarLIn = new THREE.Mesh(earGeoLIn, M.catPointMid);
  catEarRIn = new THREE.Mesh(earGeoRIn, M.catPointMid);
  catGroup.add(catEarL, catEarR, catEarLIn, catEarRIn);

  // Face mask — dark seal point overlay
  catMask = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), M.catPoint);
  catGroup.add(catMask);

  // Eyes
  for (const s of [-1, 1]) {
    const ey = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), M.catEye);
    ey.userData.eyeSide = s;
    catGroup.add(ey);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.009, 4, 3), M.catPupil);
    pu.userData.eyeSide = s;
    pu.scale.set(0.5, 1.2, 0.5);
    catGroup.add(pu);
  }

  // Nose
  catNose = new THREE.Mesh(new THREE.SphereGeometry(0.01, 4, 3), M.catNose);
  catGroup.add(catNose);

  // Whiskers
  for (const s of [-1, 1]) {
    for (const a of [-0.03, 0.03]) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, s * 0.1, a, 0.02], 3));
      const wl = new THREE.Line(wg, M.catWhisker);
      wl.userData.whisk = true;
      catGroup.add(wl);
    }
  }

  // Legs — procedural Cornish Rex stilts: upper + lower + paw per leg
  // catLegs layout: [upperMesh, lowerMesh, pawMesh] × 4 legs = 12 entries
  // Leg order: 0=FL, 1=FR, 2=BL, 3=BR
  // 6 segments for roundness — must survive Bayer dither without flickering
  for (let i = 0; i < 4; i++) {
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(K.LEG_RADIUS_TOP, K.LEG_RADIUS_BOT, K.LEG_UPPER_LEN, 6),
      M.catBody);    // warm cream #d0c0a0
    catGroup.add(upper);
    catLegs.push(upper);

    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(K.LEG_RADIUS_BOT, K.LEG_RADIUS_BOT * 0.7, K.LEG_LOWER_LEN, 6),
      M.catBody);    // warm cream #d0c0a0
    catGroup.add(lower);
    catLegs.push(lower);

    const pw = new THREE.Mesh(
      new THREE.SphereGeometry(K.PAW_RADIUS, 5, 4), M.catPoint);  // dark #3a3030
    pw.scale.set(1.1, 0.4, 1.3);   // oval, flat, slightly long
    catGroup.add(pw);
    catLegs.push(pw);
  }
}
