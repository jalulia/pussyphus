// ════════════════════════════════════════
// SCENE — Three.js setup: scene, camera, lights
// ════════════════════════════════════════
import * as THREE from 'three';
import { RENDER_W, RENDER_H } from '../constants.js';

export let scene, camera, renderer;

export function init(container) {
  renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(RENDER_W, RENDER_H);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0xd0c8b8);
  container.insertBefore(renderer.domElement, container.firstChild);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd0c8b8, 5, 20);

  camera = new THREE.PerspectiveCamera(50, RENDER_W / RENDER_H, 0.02, 40);

  // Lighting
  scene.add(new THREE.AmbientLight(0xe0d8cc, 0.5));

  const dirLight = new THREE.DirectionalLight(0xfff0e0, 0.55);
  dirLight.position.set(2, 8, 3);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0xd0e0e8, 0.12);
  fillLight.position.set(-3, 1, 1);
  scene.add(fillLight);
}

/** Update camera to follow cat. frontFloor = ground Y under head. */
export function updateCamera(headX, frontFloor, catStepZ, flow) {
  const camY = frontFloor + 0.15 + flow * 0.01;
  camera.position.set(headX * 0.75, camY, catStepZ + 2.0);
  camera.lookAt(headX * 0.8, frontFloor + 0.55, catStepZ - 3);
}
