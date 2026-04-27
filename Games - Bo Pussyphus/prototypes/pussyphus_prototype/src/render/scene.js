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
  renderer.setClearColor(0xb8c0c8);   // cool gray fog — mall dissolves into institutional haze
  container.insertBefore(renderer.domElement, container.firstChild);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb8c0c8, 4, 18);   // tighter fog for stronger depth fade

  camera = new THREE.PerspectiveCamera(50, RENDER_W / RENDER_H, 0.02, 40);

  // Lighting — fluorescent mall: cool ambient, warm key from above, cool fill
  // Creates strong top-to-bottom falloff: top surfaces bright, vertical/side dark

  // Cool ambient — institutional fluorescent baseline. Low enough that side
  // surfaces read dark, giving vertical forms (NPCs, side panels) shadow mass.
  scene.add(new THREE.AmbientLight(0xc0c8d0, 0.35));

  // Key light — overhead fluorescent. Warm-shifted slightly so Bo's cream
  // catches it while cool surfaces stay cool. High angle = strong top-lighting.
  const dirLight = new THREE.DirectionalLight(0xf0e8d8, 0.65);
  dirLight.position.set(0.5, 10, 2);
  scene.add(dirLight);

  // Fill — cool blue-green, very dim. Prevents total black on shadow side
  // but keeps shadows cool. This is the "dead fluorescent air" color.
  const fillLight = new THREE.DirectionalLight(0xb0c0d0, 0.10);
  fillLight.position.set(-3, 0.5, 1);
  scene.add(fillLight);

  // Subtle rim from behind/below — catches step edges and handrail highlights,
  // prevents the bottom of the frame from going to total black.
  const rimLight = new THREE.DirectionalLight(0xc0c8d8, 0.08);
  rimLight.position.set(0, -2, -4);
  scene.add(rimLight);
}

/** Update camera to follow cat. frontFloor = ground Y under head. */
export function updateCamera(headX, frontFloor, catStepZ, flow) {
  const camY = frontFloor + 0.15 + flow * 0.01;
  camera.position.set(headX * 0.75, camY, catStepZ + 2.0);
  camera.lookAt(headX * 0.8, frontFloor + 0.55, catStepZ - 3);
}
