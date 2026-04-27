// ════════════════════════════════════════
// MATERIALS — every Three.js material
// Value-band separated: Bo (70-85), escalator (40-60),
// NPCs (15-50), environment (15-75). See GDD.
// ════════════════════════════════════════
import * as THREE from 'three';

// ── Escalator — cool steel, value 40-60 ──
export const step      = new THREE.MeshPhongMaterial({ color: 0x8a9098, specular: 0x606870, shininess: 60 });
export const stepAlt   = new THREE.MeshPhongMaterial({ color: 0x828890, specular: 0x585e68, shininess: 55 });  // alternating step
export const stepEdge  = new THREE.MeshPhongMaterial({ color: 0x989ea6, specular: 0x707880, shininess: 70 });
export const riser     = new THREE.MeshPhongMaterial({ color: 0x5a6068, specular: 0x303840, shininess: 20 });
export const safety    = new THREE.MeshBasicMaterial({ color: 0xd0b830 });  // pushed yellow, value ~80
export const groove    = new THREE.LineBasicMaterial({ color: 0x687078 });   // darker than step surface
export const grooveDark = new THREE.LineBasicMaterial({ color: 0x585e66 });  // deeper grooves
export const side      = new THREE.MeshPhongMaterial({ color: 0x383e48, specular: 0x282e38, shininess: 30 }); // deep side panels, value 15-30
export const rail      = new THREE.MeshPhongMaterial({ color: 0x1a1e24, specular: 0x384048, shininess: 15 }); // dark rubber, value 5-20, slight cool sheen
export const railHighlight = new THREE.MeshPhongMaterial({ color: 0x384048, specular: 0x506070, shininess: 40 }); // fluorescent catch on rubber
export const glass     = new THREE.MeshBasicMaterial({ color: 0x8098a8, transparent: true, opacity: 0.12, side: THREE.DoubleSide }); // cooler green-gray glass
export const combPlate = new THREE.LineBasicMaterial({ color: 0x404850 });  // comb teeth at step edges

// ── Side panel detail ──
export const sideSeam  = new THREE.LineBasicMaterial({ color: 0x303840 });  // seam lines on side panels
export const sideScuff = new THREE.MeshPhongMaterial({ color: 0x444c56, specular: 0x303840, shininess: 15 }); // lighter scuff patches

// ── Environment — cool-shifted, value 15-75 ──
export const mallWall  = new THREE.MeshLambertMaterial({ color: 0xa0a8b0 });  // cool gray, value ~65
export const terrazzo  = new THREE.MeshLambertMaterial({ color: 0x98a0a8 });  // cool tile
export const column    = new THREE.MeshLambertMaterial({ color: 0x808890 });  // cool concrete
export const ficus     = new THREE.MeshLambertMaterial({ color: 0x486848 });  // slightly desaturated
export const pot       = new THREE.MeshLambertMaterial({ color: 0x786050 });
export const laminate  = new THREE.MeshLambertMaterial({ color: 0xa0a098 });  // cool laminate
export const chrome    = new THREE.MeshPhongMaterial({ color: 0x707880, specular: 0x586068, shininess: 50 });
export const adPanel   = new THREE.MeshBasicMaterial({ color: 0xc8c0b8 });   // slightly warm — paper/backlit
export const ceiling   = new THREE.MeshBasicMaterial({ color: 0xe0dcd0, transparent: true, opacity: 0.45 });

// ── Neon signs — rationed accent colors ──
export const neonTeal  = new THREE.MeshBasicMaterial({ color: 0x48a8a0, transparent: true, opacity: 0.75 });
export const neonPink  = new THREE.MeshBasicMaterial({ color: 0xc07088, transparent: true, opacity: 0.75 });
export const neonGold  = new THREE.MeshBasicMaterial({ color: 0xc8a040, transparent: true, opacity: 0.70 });
export const neonPool  = [neonTeal, neonPink, neonGold];

// ── Cat — seal point Cornish Rex (Bo) ── value 70-85 body, 10-25 points ──
// Bo is the warmest, brightest thing on screen. Her cream must never share
// the escalator's cool mid-gray value band.
export const catBody     = new THREE.MeshLambertMaterial({ color: 0xd8c8a8 });   // warm cream, value ~78
export const catLight    = new THREE.MeshLambertMaterial({ color: 0xe8dcc4 });   // belly, value ~85
export const catPoint    = new THREE.MeshLambertMaterial({ color: 0x302820 });   // dark seal points, value ~15
export const catPointMid = new THREE.MeshLambertMaterial({ color: 0x504840 });   // mid-dark, value ~28
export const catEye      = new THREE.MeshBasicMaterial({ color: 0x70b8a0 });     // teal — reserved accent
export const catPupil    = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
export const catNose     = new THREE.MeshBasicMaterial({ color: 0x382420 });
export const catEar      = new THREE.MeshLambertMaterial({ color: 0x302820 });   // matches points
export const catWhisker  = new THREE.LineBasicMaterial({ color: 0xb0a090 });     // lighter — reads against face

// ── NPC pools — darker than environment, cool palette ──
// Pants: value 15-35 (darker than everything except shoes)
export const skinPool  = [0xd0b090, 0xc09870, 0x986848, 0x705030].map(c => new THREE.MeshLambertMaterial({ color: c }));
export const shirtPool = [0x607080, 0x806868, 0x608068, 0xa89058, 0x806888, 0x887860, 0x507888, 0xa07070].map(c => new THREE.MeshLambertMaterial({ color: c }));
export const pantsPool = [0x303848, 0x383830, 0x483830, 0x283040, 0x383848].map(c => new THREE.MeshLambertMaterial({ color: c }));
export const shoePool  = [0x181418, 0x201c1a, 0x181820].map(c => new THREE.MeshLambertMaterial({ color: c }));  // near-black, value 10-20
export const bagPool   = [0xc87090, 0x48a8a0, 0xc8a848, 0xd4a0a8].map(c => new THREE.MeshLambertMaterial({ color: c }));

// NPC tube body — cool tones, value 25-50 (darker than mall walls)
export const npcBodyShopper  = [0x687078, 0x707068, 0x787060, 0x606060].map(c => new THREE.MeshLambertMaterial({ color: c }));
export const npcBodyPhone    = [0x485060, 0x586068, 0x404850, 0x505860].map(c => new THREE.MeshLambertMaterial({ color: c }));
export const npcBodySalesRep = [0x403838, 0x383038, 0x383438, 0x302830].map(c => new THREE.MeshLambertMaterial({ color: c }));

// ── NPC contact shadow — dark patch at feet ──
export const npcShadow = new THREE.MeshBasicMaterial({ color: 0x181c20, transparent: true, opacity: 0.35 });

/** Pick a random element from a material pool */
export function pick(pool) { return pool[Math.floor(Math.random() * pool.length)]; }
