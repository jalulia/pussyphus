// ════════════════════════════════════════
// MATERIALS — every Three.js material
// ════════════════════════════════════════
import * as THREE from 'three';

// ── Escalator ──
export const step      = new THREE.MeshPhongMaterial({ color: 0xc2c6ca, specular: 0x999999, shininess: 70 });
export const stepEdge  = new THREE.MeshPhongMaterial({ color: 0xd2d6da, specular: 0xaaaaaa, shininess: 80 });
export const riser     = new THREE.MeshPhongMaterial({ color: 0x8a8e92, specular: 0x444444, shininess: 25 });
export const safety    = new THREE.MeshBasicMaterial({ color: 0xc8b838 });
export const groove    = new THREE.LineBasicMaterial({ color: 0xa8acb0 });
export const side      = new THREE.MeshPhongMaterial({ color: 0x787c80, specular: 0x444444, shininess: 40 });
export const rail      = new THREE.MeshPhongMaterial({ color: 0x18181e, specular: 0x333333, shininess: 20 });
export const glass     = new THREE.MeshBasicMaterial({ color: 0xa8bcc8, transparent: true, opacity: 0.09, side: THREE.DoubleSide });

// ── Environment ──
export const mallWall  = new THREE.MeshLambertMaterial({ color: 0xd8cbb8 });
export const terrazzo  = new THREE.MeshLambertMaterial({ color: 0xc8b8a0 });
export const column    = new THREE.MeshLambertMaterial({ color: 0xa89888 });
export const ficus     = new THREE.MeshLambertMaterial({ color: 0x5a7a50 });
export const pot       = new THREE.MeshLambertMaterial({ color: 0x9a7050 });
export const laminate  = new THREE.MeshLambertMaterial({ color: 0xc8c0b0 });
export const chrome    = new THREE.MeshPhongMaterial({ color: 0x888c90, specular: 0x666666, shininess: 50 });
export const adPanel   = new THREE.MeshBasicMaterial({ color: 0xe8e0d0 });
export const ceiling   = new THREE.MeshBasicMaterial({ color: 0xf0ece0, transparent: true, opacity: 0.45 });

// ── Neon signs ──
export const neonTeal  = new THREE.MeshBasicMaterial({ color: 0x48a8a0, transparent: true, opacity: 0.75 });
export const neonPink  = new THREE.MeshBasicMaterial({ color: 0xc87090, transparent: true, opacity: 0.75 });
export const neonGold  = new THREE.MeshBasicMaterial({ color: 0xc8a848, transparent: true, opacity: 0.75 });
export const neonPool  = [neonTeal, neonPink, neonGold];

// ── Cat — seal point Cornish Rex (Bo) ──
export const catBody     = new THREE.MeshLambertMaterial({ color: 0xd0c0a0 });   // cream
export const catLight    = new THREE.MeshLambertMaterial({ color: 0xe0d4bc });   // belly/lighter
export const catPoint    = new THREE.MeshLambertMaterial({ color: 0x3a3030 });   // dark points
export const catPointMid = new THREE.MeshLambertMaterial({ color: 0x585048 });   // mid-dark
export const catEye      = new THREE.MeshBasicMaterial({ color: 0x70b8a0 });     // teal
export const catPupil    = new THREE.MeshBasicMaterial({ color: 0x101010 });
export const catNose     = new THREE.MeshBasicMaterial({ color: 0x3a2828 });
export const catEar      = new THREE.MeshLambertMaterial({ color: 0x3a3030 });
export const catWhisker  = new THREE.LineBasicMaterial({ color: 0xa09888 });

// ── NPC pools ──
export const skinPool  = [0xd8b898, 0xc8a078, 0xa07850, 0x785838].map(c => new THREE.MeshLambertMaterial({ color: c }));
export const shirtPool = [0x7888a0, 0xa07878, 0x78a078, 0xc8a868, 0x9878a0, 0xa09070, 0x6898a0, 0xc08888].map(c => new THREE.MeshLambertMaterial({ color: c }));
export const pantsPool = [0x484868, 0x585848, 0x685848, 0x384858, 0x505068].map(c => new THREE.MeshLambertMaterial({ color: c }));
export const shoePool  = [0x2a2428, 0x3a3230, 0x282830].map(c => new THREE.MeshLambertMaterial({ color: c }));
export const bagPool   = [0xc87090, 0x48a8a0, 0xc8a848, 0xd4a0a8].map(c => new THREE.MeshLambertMaterial({ color: c }));

/** Pick a random element from a material pool */
export function pick(pool) { return pool[Math.floor(Math.random() * pool.length)]; }
