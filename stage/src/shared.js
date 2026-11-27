// shared.js — the one source of truth every Pussyphus stage module reads.
// Stage: 720×450 stage pixels, shown at 1 CSS px each (2 device px on a Retina Mac).
// Grammar: Desktop Bo's (jalulia/bo docs/05-art-direction.md): every surface is a short ramp, a shade is
// picked per stage pixel with a Bayer 4×4 threshold, one light from the upper right. No blends outside a ramp.
var PS = window.PS || (window.PS = {});
(function () {
  PS.W = 720; PS.H = 450;
  // camera: fixed. World units ~ meters. +z goes up the escalator (away from camera), +y up, +x right.
  PS.CAM = { x: 1.5, y: 0.9, z: -0.4, pitch: 0.32, yaw: -0.24, f: 296, cx: 360, cy: 170 };   // off-axis, over the void beside the belt, turned back toward it: the drop, the ground floor and the far galleries open on the right  // round 3: a wide landscape view, pitched up so the skylight gets about a quarter of the frame
  // escalator + atrium geometry
  PS.G = { RUN: 0.42, RISE: 0.21, HALF: 0.56, GLX: 0.62, SLABX: 4.4, WALLX: 7.0, LEVEL: 4.2, BAYZ: 5.6, SKY_Y: 15.6, INTERIOR: 3.0, TOPLVL: 3, VAULT_Y: 13.5, RIB: 2.7, SF: 1.55, GROUND: -8.4 };  // round 3: a 14 m atrium, 4.2 m floors, 5.6 m shop bays; SF scales the shopfront  // walls end at the TOPLVL slab + parapet; a glazed barrel vault (radius WALLX) springs at VAULT_Y
  PS.G.STEP = 1.2; PS.G.BELT_END = 25.2;   // the belt tops out at the level-3 bridge (y 12.6), inside a bank of bright air
                                                         // each floor above the camera's steps back 1.2 m (J04: tiers stepping back)
  PS.wallX = (l) => PS.G.WALLX + PS.G.STEP * Math.max(0, l); PS.slabX = (l) => PS.G.SLABX + PS.G.STEP * Math.max(0, l);
  PS.G.VAULT_R = PS.wallX(PS.G.TOPLVL);                                   // the vault springs from the top parapet
  PS.LIGHT = (() => { const v = [0.55, 0.78, 0.32]; const n = Math.hypot(...v); return v.map(x => x / n); })();

  let cp, sp, cyw, syw; PS.setCam = (o) => { Object.assign(PS.CAM, o || {}); cp = Math.cos(PS.CAM.pitch); sp = Math.sin(PS.CAM.pitch); cyw = Math.cos(PS.CAM.yaw || 0); syw = Math.sin(PS.CAM.yaw || 0); }; PS.setCam();
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : ''); if (q.get('camx')) PS.setCam({ x: +q.get('camx') }); if (q.get('yaw')) PS.setCam({ yaw: +q.get('yaw') }); if (q.get('camz')) PS.setCam({ z: +q.get('camz') }); if (q.get('camy')) PS.setCam({ y: +q.get('camy') }); if (q.get('f')) PS.setCam({ f: +q.get('f') }); if (q.get('pitch')) PS.setCam({ pitch: +q.get('pitch') }); if (q.get('cy')) PS.setCam({ cy: +q.get('cy') });
  // ray direction for stage pixel (sx, sy) — not normalized; dz component is the depth axis before pitch
  PS.ray = (sx, sy) => { const C = PS.CAM, dx = (sx + 0.5 - C.cx) / C.f, dy = -(sy + 0.5 - C.cy) / C.f, dz = 1;
    const x = dx, y = dy * cp + dz * sp, z = -dy * sp + dz * cp; return [x * cyw + z * syw, y, -x * syw + z * cyw]; };   // pitch, then yaw about +y
  // world point -> [sx, sy, depth]
  PS.project = (x, y, z) => { const C = PS.CAM, X0 = x - C.x, Y = y - C.y, Z0 = z - C.z; const X = X0 * cyw - Z0 * syw, Z = X0 * syw + Z0 * cyw; const y2 = Y * cp - Z * sp, z2 = Y * sp + Z * cp; return [C.cx + C.f * X / z2, C.cy - C.f * y2 / z2, z2]; };
  // pixels per world unit at a given depth
  PS.ppu = (depth) => PS.CAM.f / depth;
  // tread top height under world z for belt phase p (p in steps, grows over time; steps move toward the camera)
  PS.treadY = (z, p) => { const fp = p - Math.floor(p); const k = Math.floor(z / PS.G.RUN + fp); return (k - fp) * PS.G.RISE; };

  // Bayer 4×4 (Desktop Bo jungle.js BAYER) — x, y are STAGE pixels
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16);
  PS.bay = (x, y) => BAY[(y & 3) * 4 + (x & 3)];
  PS.hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // ── RAMPS. Desktop Bo's own where they exist (jungle.js R + PHASES + BOOKS, rex.js BZ.RAMPS). New ramps: 5-8 steps,
  //    dark → light, cool in shade, warm in light. NEVER add a step in the oxblood band (OKLCH L .18-.46, C ≥ .07, hue 8-34).
  //    No cream/warm off-white page grounds. Check new ramps with gate.py's family() before use.
  PS.R = {
    wall:  ['#9ea395', '#a8ad9f', '#b2b7a9', '#bcc0b3', '#c5c9bc', '#ced1c5', '#d7d9ce', '#dfe1d7'],   // jungle.js R.wall
    trim:  ['#a9ad9f', '#c6c9bd', '#dcded4', '#eceee6', '#f8f9f4'],                                    // R.trim
    wood:  ['#4e2f19', '#5e3a20', '#6d4527', '#7b4f2d', '#875a35', '#93643c', '#9f6e44', '#ab7a4e'],   // R.wood
    walnut:['#2a1a10', '#3e2616', '#55351f', '#6b4429', '#7f5333', '#95653f'],                         // R.walnut
    linen: ['#cdbfa8', '#d9cdb8', '#e4dac8', '#eee6d7', '#f6f1e6'],                                    // R.linen (cushions, not grounds)
    sky:   ['#5f9fd2', '#7cb4de', '#9cc8e7', '#bcdbee', '#d6e9f3'],                                    // PHASES.day.sky
    skyDawn: ['#8a9fcf', '#b0b3d6', '#d9c1c9', '#f1cdb4', '#f8dcbc'],                                  // PHASES.dawn.sky
    skyDusk: ['#3e4685', '#6a5d97', '#b56f86', '#e8946a', '#f5b878'],                                  // PHASES.dusk.sky
    skyNight:['#0d1430', '#131d3e', '#1a274c', '#22325a', '#2b3d66'],                                  // PHASES.night.sky
    cloud: ['#c9d9e4', '#e4eef4', '#ffffff'],                                                          // PHASES.day.cloud (light→ reversed order fixed below)
    boblue: ['#0b4a57', '#11788a', '#1aa6b8', '#3ccbdb', '#8ee8ef', '#e0fbfc'],                        // rex.js
    pink:  ['#c66472', '#e08b97', '#f0b3bb', '#fbdadf'],                                               // rex.js pink[2..5] (0-1 sit in the oxblood band)
    gold:  ['#5c4400', '#8f6d00', '#c49a00', '#e6bf1e', '#f4da58', '#fbefa6'],                         // rex.js
    jade:  ['#103d22', '#1f5f36', '#2f844b', '#4ba865', '#78c98a', '#acdfb6'],                         // rex.js
    steel: ['#4f565d', '#626a72', '#7a838b', '#949da5', '#aeb6bd', '#c8ced3', '#dfe3e6', '#f0f2f4'],
    riser: ['#30353b', '#3d434a', '#4c535a', '#5d656c', '#6f777e', '#848c93'],
    safety:['#8a6a0e', '#ab8616', '#cfa622', '#e8c23a', '#f4d968', '#fbec9e'],
    rubber:['#121215', '#1b1b20', '#25252c', '#31313a', '#41414c', '#565663', '#6c6e7b', '#8a8d99'],
    glass: ['#7fa7b1', '#98bbc3', '#b3d0d6', '#cde3e7', '#e6f2f4'],
    shop:  ['#25363b', '#30464c', '#3d585e', '#4d6c72', '#628489', '#7c9ea2'],
    brass: ['#5e4a1c', '#7d6326', '#9c7e34', '#b89a48', '#cdb466', '#e0cd8f'],
    ink:   ['#2a2224', '#3a3030', '#4f4343'],
    terr:  ['#a9a69c', '#b8b5ab', '#c6c4bb', '#d3d2ca', '#dfded8', '#eae9e4'],
    ochre: ['#7a5a1c', '#a17a29', '#c9963a', '#dcb162', '#ebcd92'],     // BOOKS #c9963a opened
    teal:  ['#1f3d3a', '#2d544f', '#3f6f6a', '#5a8b85', '#7faaa3'],     // BOOKS #3f6f6a
    rust:  ['#7d3d24', '#9a4b2f', '#b5583c', '#ca7a5c', '#dc9e84'],     // BOOKS #b5583c
    navy:  ['#1d2745', '#283559', '#34446b', '#4f608b', '#7383aa'],     // BOOKS #34446b
    moss:  ['#3f4d2c', '#5a6c40', '#7a8f5a', '#97aa78', '#b6c59b'],     // BOOKS #7a8f5a
    plum:  ['#432a3b', '#5e3c53', '#7b4b6a', '#977089', '#b596aa'],     // BOOKS #7b4b6a
    coat1: ['#2d3340', '#3c4456', '#4e586d', '#667087', '#848da2'],
    coat2: ['#4a3f33', '#62553f', '#7c6d52', '#978869', '#b2a587'],
    coat3: ['#3b4a3e', '#4e6152', '#667b69', '#829683', '#a3b3a2'],
    hair:  ['#2a2220', '#3b2f2a', '#4f3e33', '#665040'],
    warm:  ['#6b5a3a', '#8f7a4d', '#b39c63', '#d2bf86', '#ebdcae', '#fbf3d8'],   // lit store interiors (lamps), not grounds
    geranium: ['#b8473b', '#c9553f', '#dc6b52', '#ea8a6e', '#f4ac92'],                                  // J05 balcony geraniums (darkest step L .55, clear of the oxblood band)
    pteal: ['#5e9c95', '#7fbab2', '#a3d2ca', '#c7e6e0', '#e3f3f0'],                                     // J03 postmodern pastel fascias
    ppink: ['#c98d9b', '#dcaab5', '#ebc5cd', '#f5dde2', '#fbeef1'],
    pbutter: ['#c9a85a', '#dcc27a', '#ecd89e', '#f5e8c2'],
    skin1: ['#5a3a28', '#74503a', '#93694e', '#b08566'],
    skin2: ['#8a5a3c', '#a87150', '#c48e6a', '#dcae8a'], skin3: ['#9c6b50', '#bb8a6c', '#d6a98a', '#ebc8ae'], nightwall: ['#3a4252', '#424b5b', '#4b5465', '#555e6f', '#606979', '#6b7484', '#77808f', '#848c9a'], nightterr: ['#2e3546', '#383f50', '#434a5b', '#4f5667', '#5c6373', '#6a7180'], nighttrim: ['#4e5767', '#626b7b', '#78818f', '#8e96a3', '#a5acb7'],   /* the hall sits low at night; lamps, stores and signs carry the light */
    haze:  ['#22325a', '#3c4a6c', '#6f7b92', '#a9b2b8', '#cfd5d0', '#e4e7df'],   // night → day: skyNight[3] … the day haze
  };
  PS.R.cloud = ['#c9d9e4', '#e4eef4', '#ffffff'];
  PS.RAMPS = Object.keys(PS.R); PS.RID = {}; PS.RAMPS.forEach((k, i) => (PS.RID[k] = i));
  PS.RGB = PS.RAMPS.map(k => PS.R[k].map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]));
  // shade index for ramp r at lightness L (0..1) at stage pixel (x, y)
  PS.idx = (r, L, x, y) => { const n = PS.R[r].length, f = Math.max(0, Math.min(0.999, L)) * (n - 1), i = Math.floor(f); return Math.min(n - 1, i + ((f - i) > PS.bay(x, y) ? 1 : 0)); };
  PS.rampAt = (r, L, x, y) => PS.R[r][PS.idx(r, L, x, y)];
})();
