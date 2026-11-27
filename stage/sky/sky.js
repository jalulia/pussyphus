// sky.js: SKY, the atrium skylight. Sky, weather and the glass, painted per stage pixel in Desktop Bo's grammar:
// every pixel is a step of a declared ramp, picked with a Bayer 4x4 threshold at its stage pixel. No alpha, no mixing.
// Contract (stage2/BRIEF.md): SKY.paint(out, list, dirs, pane, t, opts) -> { ambient, shaft, tint }.
// Layers, near to far: glass (drops, runnels, snow drift, sheen) > falling snow, birds > mist veils (y 22) >
// scud (y 32) > cumulus/stratus deck (y 60) > upper deck (y 110) > cirrus (y 200) > moon, stars, sky.
// Each cloud layer is the ray projected onto a plane that high, sampled from one periodic noise tile at two rotated
// scales, so it drifts with true perspective and parallax and never shows the tile's repeat.
var SKY = window.SKY || (window.SKY = {});
(function () {
  'use strict';
  const W = PS.W, H = PS.H, CAM = PS.CAM, SKY_Y = PS.G.SKY_Y;

  // ── RAMPS (new, dark → light). The sky itself is Desktop Bo's PHASES via PS.R (sky, skyDawn, skyDusk, skyNight).
  // Each cloud ramp keeps PHASES[phase].cloud as steps (day/dawn/dusk: top three; night: steps 1-3) and adds darker
  // undersides for decks and rain. Dawn's top step in PHASES reads as cream to gate.py, so it is #fff0ea here (a touch
  // pinker); dusk's top step sits on the tan line, so it is #f6c2a8.
  const RAMPS = {
    cloudDay:   ['#6e7c8b', '#82909f', '#98a6b4', '#b0bdca', '#c9d9e4', '#e4eef4', '#ffffff'],
    cloudDawn:  ['#857f96', '#9a90a6', '#b3a2b2', '#c9b0b6', '#d9b3b0', '#f3d4c4', '#fff0ea'],
    cloudDusk:  ['#4f4669', '#66547a', '#7d5f84', '#8d6a86', '#b67d88', '#d88f86', '#f6c2a8'],
    cloudNight: ['#1c2446', '#242e52', '#2e3961', '#3a4672', '#4a5683', '#5d6995', '#7380a8'],
    skyBlue:   ['#24315a', '#2f3d6b', '#3f4c7e', '#565f92', '#7473a8', '#9a8fbd'],                  // blue hour, between night and dawn/dusk
    cloudBlue: ['#262d50', '#333b62', '#444b75', '#5b5f8a', '#77779f', '#9790b4', '#b9adc8'],
    star:  ['#4d5a86', '#8794c0', '#c4cdea', '#f4f6ff'],
    moon:  ['#7d86a6', '#aab2cc', '#d5dbeb', '#f3f5fb'],
    bird:  ['#323a46', '#46505d', '#5d6875'],
    craft: ['#5b6470', '#8f98a3', '#c8ced3', '#f0f2f4'],
  };
  const ALL = { sky: PS.R.sky, skyDawn: PS.R.skyDawn, skyDusk: PS.R.skyDusk, skyNight: PS.R.skyNight };
  for (const k in RAMPS) ALL[k] = RAMPS[k];
  const OFF = {}, LEN = {}; let tot = 0;
  for (const k in ALL) { OFF[k] = tot; LEN[k] = ALL[k].length; tot += LEN[k]; }
  const PAL = new Uint32Array(tot);
  for (const k in ALL) ALL[k].forEach((h, i) => { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); PAL[OFF[k] + i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; });

  // ── phases: Desktop Bo's boundaries (jungle.js phaseNow: night < 5.5, dawn < 8, day < 17.5, dusk < 20.5), each change
  // dithered over the hour around it. lift/span place the elevation gradient on the sky ramp; glow is the sun side.
  const NIGHT = 0, DAWN = 1, DAY = 2, DUSK = 3, BLUE = 4;
  const PH = [
    { name: 'night', sky: 'skyNight', cloud: 'cloudNight', lift: 0.30, span: 0.70, glow: 0.00, cl: 0.00, silver: 0.00, amb: 0.36, beam: 0.00, inv: 1 },
    { name: 'dawn',  sky: 'skyDawn',  cloud: 'cloudDawn',  lift: 0.00, span: 1.00, glow: 0.55, cl: 0.00, silver: 0.30, amb: 0.80, beam: 0.70, inv: 0 },
    { name: 'day',   sky: 'sky',      cloud: 'cloudDay',   lift: 0.00, span: 1.00, glow: 0.22, cl: 0.00, silver: 0.22, amb: 1.00, beam: 1.00, inv: 0 },
    { name: 'dusk',  sky: 'skyDusk',  cloud: 'cloudDusk',  lift: 0.00, span: 1.00, glow: 0.60, cl: -0.04, silver: 0.32, amb: 0.64, beam: 0.55, inv: 0 },
    { name: 'twilight', sky: 'skyBlue', cloud: 'cloudBlue', lift: 0.05, span: 0.85, glow: 0.30, cl: 0.00, silver: 0.12, amb: 0.50, beam: 0.08, inv: 0.5 },
  ];
  const SO = PH.map(p => OFF[p.sky]), SN = PH.map(p => LEN[p.sky]), CO = PH.map(p => OFF[p.cloud]), CN = PH.map(p => LEN[p.cloud]);
  // [from, to, phase a, phase b, sweep sign, a's ramp shift at the end, b's ramp shift at the start]. Night and dawn/dusk
  // are too far apart in value to interleave, so each change passes through the blue hour; the shifts bring the two
  // palettes close in value while their pixels interleave, so the dither reads as a hue change, not a checkerboard.
  const TRANS = [[4.9, 5.4, NIGHT, BLUE, 1, 0.25, -0.3], [5.4, 6.1, BLUE, DAWN, 1, 0.3, -0.35], [7.5, 8.5, DAWN, DAY, 1, 0.0, 0.0],
    [17.0, 18.0, DAY, DUSK, -1, -0.25, 0.3], [19.9, 20.5, DUSK, BLUE, -1, -0.3, 0.3], [20.5, 21.2, BLUE, NIGHT, -1, -0.3, 0.3]];
  function phaseAt(h) {
    h = ((h % 24) + 24) % 24;
    if (h < TRANS[0][0] || h >= TRANS[TRANS.length - 1][1]) return [NIGHT, NIGHT, 0, 1, 0, 0];
    let prev = NIGHT;
    for (const [a, b, pa, pb, sg, ia, ib] of TRANS) {
      if (h < a) return [prev, prev, 0, 1, 0, 0];
      if (h < b) { let f = (h - a) / (b - a); f = f * f * (3 - 2 * f); return [pa, pb, f, sg, ia * f, ib * (1 - f)]; }
      prev = pb;
    }
    return [NIGHT, NIGHT, 0, 1, 0, 0];
  }

  // ── weathers. Targets; the live state eases toward them (tau seconds), so any switch is gentle.
  const WX = {
    clear:    { cov: 0.00, strat: 0.0, dark: 0.00, cir: 0.38, scud: 0.0, rain: 0, snow: 0, mist: 0, birds: 0.65, plane: 0.55 , upc: 0 },
    fair:     { cov: 0.42, strat: 0.0, dark: 0.00, cir: 0.25, scud: 0.0, rain: 0, snow: 0, mist: 0, birds: 0.55, plane: 0.45 , upc: 0 },
    overcast: { cov: 0.92, strat: 1.0, dark: 0.30, cir: 0.0,  scud: 0.0, rain: 0, snow: 0, mist: 0, birds: 0.30, plane: 0.0 , upc: 0.97 },
    rain:     { cov: 1.00, strat: 1.0, dark: 0.50, cir: 0.0,  scud: 0.75, rain: 1, snow: 0, mist: 0, birds: 0.03, plane: 0.0 , upc: 1 },
    snow:     { cov: 0.97, strat: 1.0, dark: 0.05, cir: 0.0,  scud: 0.0, rain: 0, snow: 1, mist: 0, birds: 0.0,  plane: 0.0 , upc: 1 },
    mist:     { cov: 0.36, strat: 0.8, dark: 0.04, cir: 0.0,  scud: 0.0, rain: 0, snow: 0, mist: 1, birds: 0.12, plane: 0.0 , upc: 0.6 },
  };
  const TAU = { upc: 30, cov: 25, strat: 30, dark: 20, cir: 30, scud: 15, rain: 10, snow: 12, mist: 25, birds: 5, plane: 5 };
  SKY.WEATHERS = [
    { id: 'clear',    desc: 'open sky, a few cirrus threads high up; birds and the odd plane with a contrail' },
    { id: 'fair',     desc: 'drifting cumulus: bright edges, gray-blue undersides, silver toward the sun' },
    { id: 'overcast', desc: 'layered stratus: a low banded deck with thin breaks onto a paler deck above' },
    { id: 'rain',     desc: 'dark deck and fast low scud; drops and runnels on the panes, a soft wet sheen' },
    { id: 'snow',     desc: 'bright gray deck, flakes drifting down onto the glass, soft drifts along each pane\'s lower edge' },
    { id: 'mist',     desc: 'pale veils sliding over a softened sky; low contrast, no shafts' },
  ];
  SKY.RAMPS = RAMPS;
  // Desktop Bo's dawn sky (PS.R.skyDawn) ends in two peach steps that gate.py reads as cream (they are sky glow, not a
  // page ground). SKY.creamSafe(true) swaps them for pinker steps of the same lightness; default keeps Desktop Bo's own.
  const DAWN_SAFE = ['#f0cbb9', '#f6d8cb'];
  const rgb32 = (h) => ((255 << 24) | (parseInt(h.slice(5, 7), 16) << 16) | (parseInt(h.slice(3, 5), 16) << 8) | parseInt(h.slice(1, 3), 16)) >>> 0;
  SKY.creamSafe = (on) => { const src = on ? DAWN_SAFE : PS.R.skyDawn.slice(3, 5); PAL[OFF.skyDawn + 3] = rgb32(src[0]); PAL[OFF.skyDawn + 4] = rgb32(src[1]); };
  SKY.TINTS = [null, 'dawn', 'dusk', 'twilight', 'night', 'overcast', 'rain', 'snow', 'mist'];
  // pane grid on the skylight plane: pane cells are [k*w, (k+1)*w] x [m*d, (m+1)*d] (matches the C3 painter's mullion test)
  SKY.GRID = { w: 0.77, d: 1.1, ox: 0, oz: 0 };

  // ── helpers
  function h2(a, b) { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const sstep = (a, b, x) => { const u = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return u * u * (3 - 2 * u); };
  const fract = (x) => x - Math.floor(x);
  const psin = (x) => { const u = x * 0.15915494 - Math.floor(x * 0.15915494 + 0.5); return 8 * u * (1 - 2 * Math.abs(u)); }; // cheap sine, |err| < 0.06

  // ── noise tile: 256² periodic gradient noise, domain-warped fBm (warp gives the curl Slynyrd asks of cloud texture).
  // TILE = 4 octaves (periods 64..8 texels); TLO = 3 octaves, used where a pixel spans more than ~1 texel (no confetti).
  const N = 256, TILE = new Float32Array(N * N), TLO = new Float32Array(N * N);
  let QT = null, QS = null; // quantile tables: combined density (two samples), single sample
  function buildTiles() {
    const G = {}; // gradient tables per period
    const grads = (per, seed) => { const key = per + ':' + seed; if (G[key]) return G[key]; const a = new Float32Array(per * per * 2);
      for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) { const ang = h2(i + seed * 1013, j + seed * 7919) * 6.2831853; a[(j * per + i) * 2] = Math.cos(ang); a[(j * per + i) * 2 + 1] = Math.sin(ang); }
      return (G[key] = a); };
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    function perlin(x, y, per, seed) { // x, y in lattice units, periodic in per
      const g = grads(per, seed), xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const x0 = ((xi % per) + per) % per, y0 = ((yi % per) + per) % per, x1 = (x0 + 1) % per, y1 = (y0 + 1) % per;
      const d = (ix, iy, dx, dy) => { const o = (iy * per + ix) * 2; return g[o] * dx + g[o + 1] * dy; };
      const u = fade(fx), v = fade(fy);
      const a = d(x0, y0, fx, fy), b = d(x1, y0, fx - 1, fy), c = d(x0, y1, fx, fy - 1), e = d(x1, y1, fx - 1, fy - 1);
      return (a + (b - a) * u) + ((c + (e - c) * u) - (a + (b - a) * u)) * v;
    }
    function fbm(x, y, seed, oct) { let s = 0, a = 1, nrm = 0; for (let o = 0, per = 4; o < oct; o++, per *= 2) { s += a * perlin(x * per / N, y * per / N, per, seed + o * 17); nrm += a; a *= 0.5; } return s / nrm; }
    const tmp = new Float32Array(N * N), tlo = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const wx = fbm(x, y, 3, 3) * 26, wy = fbm(x, y, 9, 3) * 26; // warp, texels
      tmp[y * N + x] = fbm(x + wx, y + wy, 21, 4); tlo[y * N + x] = fbm(x + wx, y + wy, 21, 3);
    }
    const norm = (src, dst) => { let lo = 1e9, hi = -1e9; for (const v of src) { if (v < lo) lo = v; if (v > hi) hi = v; } for (let i = 0; i < src.length; i++) dst[i] = (src[i] - lo) / (hi - lo); };
    norm(tmp, TILE); norm(tlo, TLO);
    // quantiles: coverage c -> threshold, measured on the actual mix
    const S = 24000, a2 = new Float32Array(S), a1 = new Float32Array(S);
    for (let i = 0; i < S; i++) { const px = h2(i, 1) * N, py = h2(i, 2) * N, qx = h2(i, 3) * N, qy = h2(i, 4) * N; a2[i] = 0.7 * samp(TILE, px, py) + 0.3 * samp(TILE, qx, qy); a1[i] = samp(TILE, px, py); }
    a2.sort(); a1.sort(); QT = new Float32Array(257); QS = new Float32Array(257);
    for (let i = 0; i <= 256; i++) { const j = Math.min(S - 1, Math.floor((i / 256) * S)); QT[i] = a2[j]; QS[i] = a1[j]; }
  }
  function samp(T, x, y) { // smooth-weighted bilinear, periodic 256
    const fx = x | 0, fy = y | 0; let ax = x - fx, ay = y - fy; ax = ax * ax * (3 - 2 * ax); ay = ay * ay * (3 - 2 * ay);
    const x0 = fx & 255, x1 = (fx + 1) & 255, y0 = (fy & 255) << 8, y1 = ((fy + 1) & 255) << 8;
    const a = T[y0 | x0], b = T[y0 | x1], c = T[y1 | x0], d = T[y1 | x1], top = a + (b - a) * ax;
    return top + (c + (d - c) * ax - top) * ay;
  }
  const qAt = (Q, c) => { if (c >= 0.995) return -1; const f = Math.max(0, Math.min(1, 1 - c)) * 256, i = Math.min(255, Math.floor(f)); return Q[i] + (Q[i + 1] - Q[i]) * (f - i); };

  // ── per-list cache (the stage reuses its arrays; we key on identity + a few values)
  const C = { list: null, n: -1, sig: '' };
  let SHB, PZW, X, Y, B1, B2, B3, DN, E, SW, UX, UZ, FPU, PU, PV, PXW, PXD, NEAR, PROF, SH, CR, FLAG, PSL, CSL, POS = null, MOON = null;
  // temporal cache: each noise layer is resampled every third frame per pixel (drift is < 0.15 px/frame at 15 fps)
  let K3, KM, KQ, KS, KU, KV, KC, TM, TS, TU, TV, TC, FR = 1000;
  let NP = 0, PIDS, NC = 0, CXS, CYS, CHS, CD, CK, CX0, CY0, RU, RV, RH, RR;
  function sig(list, dirs, pane) { const n = list.length; if (!n) return '0'; const m = n >> 1; return [n, list[0], list[m], list[n - 1], dirs[0], dirs[3 * m + 1], pane[2 * m], pane[2 * n - 1], SKY.GRID.w, SKY.GRID.d, SKY.GRID.ox, SKY.GRID.oz].join(','); }
  function prep(list, dirs, pane) {
    const n = list.length, G = SKY.GRID;
    X = new Int16Array(n); Y = new Int16Array(n); B1 = new Float32Array(n); B2 = new Float32Array(n); B3 = new Float32Array(n); DN = new Float32Array(3 * n);
    E = new Float32Array(n); SW = new Float32Array(n); UX = new Float32Array(n); UZ = new Float32Array(n); FPU = new Float32Array(n);
    PU = new Float32Array(n); PV = new Float32Array(n); PXW = new Float32Array(n); PXD = new Float32Array(n); NEAR = new Float32Array(n); PROF = new Float32Array(n);
    SH = new Float32Array(n); SHB = new Float32Array(n); PZW = new Float32Array(n); CR = new Uint8Array(n); FLAG = new Uint8Array(n); PSL = new Int32Array(n); CSL = new Int32Array(n);
    if (!POS) POS = new Int32Array(W * H); POS.fill(-1);
    const E0 = 8 * Math.PI / 180, E1 = 80 * Math.PI / 180;
    for (let k = 0; k < n; k++) {
      const i = list[k], x = i % W, y = (i / W) | 0; X[k] = x; Y[k] = y; POS[i] = k;
      B1[k] = BAY[((y & 3) << 2) | (x & 3)]; B2[k] = BAY[((x & 3) << 2) | (y & 3)]; B3[k] = BAY[(((y + 1) & 3) << 2) | ((x + 2) & 3)];
      let dx = dirs[3 * k], dy = dirs[3 * k + 1], dz = dirs[3 * k + 2]; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      DN[3 * k] = dx; DN[3 * k + 1] = dy; DN[3 * k + 2] = dz;
      const dyc = Math.max(0.03, dy), el = Math.asin(Math.max(-1, Math.min(1, dy)));
      E[k] = Math.max(0, Math.min(1, (E1 - el) / (E1 - E0))); SW[k] = dx; UX[k] = dx / dyc; UZ[k] = dz / dyc;
    }
    // footprints from the neighbors actually listed (works for any camera): angle per pixel, glass units per pixel
    const pmap = new Map(), cmap = new Map(), pids = [], cx = [], cy = [];
    const nb = (i, dxp, dyp) => { const x = i % W + dxp, y = ((i / W) | 0) + dyp; return x < 0 || x >= W || y < 0 || y >= H ? -1 : POS[y * W + x]; };
    for (let k = 0; k < n; k++) {
      const i = list[k]; let kh = nb(i, 1, 0); if (kh < 0) kh = nb(i, -1, 0); let kv = nb(i, 0, 1); if (kv < 0) kv = nb(i, 0, -1);
      const dyc = Math.max(0.03, DN[3 * k + 1]);
      let ang = 1 / CAM.f; if (kh >= 0) ang = Math.hypot(DN[3 * kh] - DN[3 * k], DN[3 * kh + 1] - DN[3 * k + 1], DN[3 * kh + 2] - DN[3 * k + 2]) || ang;
      FPU[k] = ang / (dyc * dyc);
      const hG = SKY_Y - CAM.y; let lat = hG * ang / dyc, rad = lat / dyc;
      if (kh >= 0) lat = Math.hypot(pane[2 * kh] - pane[2 * k], pane[2 * kh + 1] - pane[2 * k + 1]) || lat;
      if (kv >= 0) rad = Math.hypot(pane[2 * kv] - pane[2 * k], pane[2 * kv + 1] - pane[2 * k + 1]) || rad;
      const gx = (pane[2 * k] - G.ox) / G.w, gz = (pane[2 * k + 1] - G.oz) / G.d, ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix;
      PU[k] = u; PV[k] = gz - iz; PXW[k] = G.w / lat; PXD[k] = G.d / rad; NEAR[k] = Math.max(0, Math.min(1, (PXW[k] - 5) / 9));
      const pid = (Math.imul(ix, 92821) ^ Math.imul(iz, 68917)) | 0; let ps = pmap.get(pid); if (ps === undefined) { ps = pids.length; pmap.set(pid, ps); pids.push(pid); } PSL[k] = ps;
      const x = X[k], y = Y[k], ck = ((x / 6) | 0) * 4096 + ((y / 6) | 0); let cs = cmap.get(ck); if (cs === undefined) { cs = cx.length; cmap.set(ck, cs); cx.push((x / 6) | 0); cy.push((y / 6) | 0); } CSL[k] = cs;
      { const jit = (h2(pid, 9) - 0.5) * 0.9, bc = (pane[2 * k] * 0.6 + pane[2 * k + 1] * 0.8 + jit) / 9.5, f1 = Math.abs(bc - Math.floor(bc) - 0.5);
        SHB[k] = f1 < 0.11 ? 1 - f1 / 0.11 * 0.5 : f1 > 0.43 ? 0.45 : 0; PZW[k] = pane[2 * k + 1]; }
      SH[k] = h2(x * 7 + 1, y * 13 + 5); CR[k] = ((x % 6) << 4) | (y % 6);
      // snow drift profile along the pane's lower edge: wavy, heaped in the corners
      const ph0 = h2(pid, 5), cl = u < 0.14 ? 1 - u / 0.14 : 0, crr = u > 0.86 ? (u - 0.86) / 0.14 : 0;
      PROF[k] = (0.15 + 0.85 * sstep(0.3, 0.72, samp(TLO, pane[2 * k] * 1.1 + OFS + 50, pane[2 * k + 1] * 0.8 + OFS + 20))) * (0.75 + 0.25 * h2(pid, 6)) * (0.62 + 0.16 * Math.sin(u * 3.4 + ph0 * 30) + 0.07 * Math.sin(u * 8.3 + ph0 * 70)) + 0.38 * (cl * cl + crr * crr);
    }
    NP = pids.length; PIDS = Int32Array.from(pids); RU = new Float32Array(NP); RV = new Float32Array(NP); RH = new Float32Array(NP); RR = new Float32Array(NP);
    KM = new Float32Array(n); KQ = new Float32Array(n); KS = new Float32Array(n); KU = new Float32Array(n); KV = new Float32Array(n); KC = new Float32Array(n);
    K3 = new Uint8Array(n); for (let k = 0; k < n; k++) K3[k] = k % 3;
    TM = new Int32Array(n); TS = new Int32Array(n); TU = new Int32Array(n); TV = new Int32Array(n); TC = new Int32Array(n); FR += 1000;
    NC = cx.length; CXS = Int32Array.from(cx); CYS = Int32Array.from(cy); CHS = new Float32Array(NC); CD = new Float32Array(NC); CK = new Uint8Array(NC); CX0 = new Uint8Array(NC); CY0 = new Uint8Array(NC);
    for (let s = 0; s < NC; s++) CHS[s] = h2(CXS[s], CYS[s] + 4099);
    // moon: a listed pixel near the upper right of the visible sky, centered in a pane so mullions don't cut it
    let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
    for (let k = 0; k < n; k++) { const x = X[k], y = Y[k]; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    MOON = null;
    if (n) { const tx = bx0 + 0.7 * (bx1 - bx0), ty = by0 + 0.22 * (by1 - by0); let best = 1e9, bk = -1;
      for (let k = 0; k < n; k += 2) { const s = Math.hypot(X[k] - tx, Y[k] - ty) + 30 * (Math.abs(PU[k] - 0.5) + Math.abs(PV[k] - 0.5)) - (PXW[k] > 12 ? 4 : 0); if (s < best) { best = s; bk = k; } }
      if (bk >= 0) MOON = { x: X[bk], y: Y[bk], r: 3.4 }; }
  }

  // ── live weather state
  const S = { t: null, cur: null, acc: 0, wet: 0, wx: null };
  function ease(t, weather, snap) {
    const tgt = WX[weather] || WX.fair;
    if (!S.cur || snap) { S.cur = Object.assign({}, tgt); S.acc = tgt.snow ? 0.42 : 0; S.wet = tgt.rain; S.t = t; S.wx = weather; return; }
    const dt = Math.max(0, Math.min(2, t - S.t)); S.t = t; S.wx = weather;
    for (const k in tgt) S.cur[k] += (tgt[k] - S.cur[k]) * (1 - Math.exp(-dt / TAU[k]));
    S.acc += ((S.cur.snow > 0.3 ? 0.42 : 0) - S.acc) * (1 - Math.exp(-dt / (S.cur.snow > 0.3 ? 150 : 320)));
    S.wet += (S.cur.rain - S.wet) * (1 - Math.exp(-dt / (S.cur.rain > S.wet ? 8 : 70)));
  }

  let O32 = null, OBUF = null;
  SKY.debug = { birdAt: null, planeAt: null };
  SKY.project = null; // optional (x, y, z) -> [sx, sy, depth]; defaults to PS.project (the stage camera)
  SKY.reset = () => { S.cur = null; C.n = -1; };
  SKY.warm = () => { if (!QT) buildTiles(); }; // ~100-170 ms once: call during loading to keep the first frame smooth
  const OFS = 65536; // keeps noise coords positive for |0 (a multiple of the tile size)
  const md = (v) => v - 256 * Math.floor(v / 256);

  SKY.paint = function (out, list, dirs, pane, t, opts) {
    opts = opts || {};
    if (!QT) buildTiles();
    const n = list.length;
    const sg = sig(list, dirs, pane);
    if (C.n !== n || C.sig !== sg) { prep(list, dirs, pane); C.list = list; C.n = n; C.sig = sg; } // content, not identity: fresh arrays with the same pixels skip the rebuild
    if (OBUF !== out.buffer || O32.byteOffset !== out.byteOffset) { OBUF = out.buffer; O32 = new Uint32Array(out.buffer, out.byteOffset, out.length >> 2); }
    const o32 = O32, weather = opts.weather || 'fair', reduced = !!opts.reduced;
    ease(t, weather, !!opts.snap);
    const P = S.cur, tm = reduced ? 0 : t;
    FR++; if (opts.snap || C.lastT == null || Math.abs(t - C.lastT) > 0.6 || reduced !== C.lastR) FR += 1000; C.lastT = t; C.lastR = reduced;
    const fr = FR, par = fr % 3;
    const hour = opts.hour == null ? 12 : +opts.hour;
    const [pa, pb, pf, psg, shA, shB] = phaseAt(hour);
    const wind = opts.wind == null ? 0.3 : Math.max(-1, Math.min(1, +opts.wind));
    const wsg = wind < 0 ? -1 : 1, wsp = 0.18 + 0.42 * Math.abs(wind);

    // sun: always on the light's side (PS.LIGHT is upper right), elevation by hour
    const sel = 0.95 * Math.sin(Math.PI * (hour - 5.6) / 14.4);
    const sce = Math.cos(Math.max(0, sel)), sx = 0.84 * sce, sy = Math.sin(Math.max(0.02, sel)), sz = 0.54 * sce, sl = Math.hypot(sx, sy, sz);
    const SX = sx / sl, SY = sy / sl, SZ = sz / sl, sunUp = sel > 0.02;

    // layers: heights above the camera; drift offsets reduced mod the tile so coords stay small
    const hM = 60 - CAM.y, hU = 110 - CAM.y, hS = 32 - CAM.y, hC = 200 - CAM.y, hV = 22 - CAM.y;
    const sA = 4.2, sB = sA * 2.3, cr = Math.cos(0.61), sr = Math.sin(0.61);
    const strat = P.strat, cov = P.cov, dark = P.dark;
    const stX = sA * (1 - 0.55 * strat), stZ = sA * (1 + 0.7 * strat);          // stratus: stretched across the wind into bands
    const mX = wsg * wsp * tm, mZ = 0.07 * tm;
    const oMx = md(mX * stX) + OFS, oMz = md(mZ * stZ) + OFS;                    // main
    const dqx = (wsg * wsp * 1.08 * tm + 0.02 * tm) * sB, dqz = 0.085 * tm * sB; // detail drifts a little faster, so shapes evolve over ~a minute
    const oQx = md(dqx * cr - dqz * sr) + OFS, oQz = md(dqx * sr + dqz * cr) + OFS;
    const kMx = hM * stX, kMz = hM * stZ, kQ = hM * sB;
    const oUx = md((0.6 * mX + 40) * sA * 0.42) + OFS, oUz = md(0.6 * mZ * sA * 1.25) + OFS, kUx = hU * sA * 0.42, kUz = hU * sA * 1.25;
    const oSx = md(1.9 * mX * 5.7 + 77) + OFS, oSz = md(1.9 * mZ * 7.5 + 31) + OFS, kSx = hS * 5.7, kSz = hS * 7.5;
    const oCx = md(0.5 * mX * 0.55 + 13) + OFS, oCz = OFS, kCx = hC * 0.55, kCz = hC * 3.0;
    const oVx = md((0.05 * tm * wsg) * 2.2) + OFS, oVz = md(0.01 * tm * 2.2) + OFS, kVx = hV * 0.32 * 2.2, kVz = hV * 1.1 * 2.2;
    const th = qAt(QT, cov), ew = 0.016 + 0.02 * strat;
    const thU = qAt(QS, P.upc), thS = qAt(QS, 0.34), thC = 0.6;
    const doMain = cov > 0.01, doUp = strat > 0.05, doScud = P.scud > 0.02, doCir = P.cir > 0.02, doMist = P.mist > 0.02;
    const wet = S.wet, acc = S.acc, snowF = P.snow, rain = P.rain;
    const doDrops = wet > 0.02 || snowF > 0.05, doRun = rain > 0.15, doDrift = acc > 0.004;
    const nightW = (pa === NIGHT ? 1 - pf : pa === BLUE ? 0.6 * (1 - pf) : 0) + (pb === NIGHT ? pf : pb === BLUE ? 0.6 * pf : 0);
    const starOn = nightW > 0.02, moon = MOON && starOn;
    const sheen0 = 0.06 + 0.12 * wet + 0.06 * nightW;
    const cellDens = 0.42 * wet, flakeDens = 0.22 * snowF;

    // per-cell (drops, stuck flakes) and per-pane (runnels) state, once per frame
    if (doDrops) for (let s = 0; s < NC; s++) { // kind: 0 none, 1 drop, 2 big drop, 3 splash, 4 stuck flake, 5 melting flake
      const hc = CHS[s], life = 14 + 24 * hc, q = (tm + hc * 97.3) / life, ep = Math.floor(q), age = q - ep, hd = h2(CXS[s] * 3 + ep * 7919, CYS[s] * 5 + 17 + ep);
      CD[s] = hd; CX0[s] = 1 + ((hd * 1e4) | 0) % 3; CY0[s] = 2 + ((hd * 1e6) | 0) % 3;
      CK[s] = hd < cellDens ? (age < 0.02 ? 3 : ((hd * 1e3) | 0) % 3 === 0 ? 2 : 1) : hd < cellDens + flakeDens ? (age < 0.5 ? 4 : age < 0.75 ? 5 : 0) : 0;
    }
    if (doRun) for (let s = 0; s < NP; s++) { // one track per pane; a new runnel every 6-15 s on about two panes in three
      const pid = PIDS[s], hs = h2(pid + 7777, 31), per = 6 + 9 * hs, tt = tm + hs * 53, c = Math.floor(tt / per), tau = tt - c * per;
      const hr = h2(pid * 13 + c * 101, 77), o = s;
      if (hr > rain * 0.65) { RH[o] = -1; continue; }
      RU[o] = 0.14 + 0.72 * fract(hr * 7.13); RV[o] = 0.04 + 0.4 * fract(hr * 3.71); RH[o] = RV[o] + tau * (0.16 + 0.2 * fract(hr * 5.3)); RR[o] = hr;
    }

    for (let k = 0; k < n; k++) {
      const x = X[k], y = Y[k], b1 = B1[k], b2 = B2[k];
      // phase, dithered on the blend factor; the change sweeps in from the light's side (dawn) or toward it (dusk)
      let p = pa;
      let tsh = 0;
      if (pf > 0) { const fl = (pf - 0.5) * 1.8 + 0.5 + 0.28 * SW[k] * psg; if (fl > B3[k]) { p = pb; tsh = shB; } else tsh = shA; }
      const ph = PH[p];
      let g = 0; if (sunUp && p !== NIGHT) { const i3 = 3 * k; g = DN[i3] * SX + DN[i3 + 1] * SY + DN[i3 + 2] * SZ; g = g > 0 ? g * g * g * g : 0; }
      let ro = SO[p], rn = SN[p], L = ph.lift + ph.span * E[k] + ph.glow * g; // sky by default
      L += (0.25 * strat * cov) * (0.6 - L);   // under a deck the sky that shows is grayer-lighter
      let layer = 0; // 0 sky, 1 cloud ramp, 2 moon/star
      const ux = UX[k], uz = UZ[k];
      let veil = 0;
      const fresh = K3[k] === par;
      if (doMist) { let dv; if (fresh || fr - TV[k] > 2) { dv = KV[k] = samp(TLO, ux * kVx + oVx, uz * kVz + oVz); TV[k] = fr; } else dv = KV[k]; veil = P.mist * (0.45 + 0.55 * sstep(0.3, 0.78, dv)); }
      let done = false;
      if (doScud) {
        let d; if (fresh || fr - TS[k] > 2) { d = KS[k] = samp(TLO, ux * kSx + oSx, uz * kSz + oSz); TS[k] = fr; } else d = KS[k];
        const a = sstep(thS - 0.04, thS + 0.04, d) * P.scud;
        if (a > b2) { ro = CO[p]; rn = CN[p]; L = 0.17 + 0.2 * (d - thS) + ph.cl + 0.1 * g + 0.28 * ph.inv; layer = 1; done = true; }
      }
      if (!done && doMain) {
        let d1, d2;
        if (fresh || fr - TM[k] > 2) {
          d1 = KM[k] = samp(hM * FPU[k] * sA > 1.1 ? TLO : TILE, ux * kMx + oMx, uz * kMz + oMz);
          const qx = ux * kQ, qz = uz * kQ; d2 = KQ[k] = samp(TLO, qx * cr - qz * sr + oQx, qx * sr + qz * cr + oQz); TM[k] = fr;
        } else { d1 = KM[k]; d2 = KQ[k]; }
        const d = 0.7 * d1 + 0.3 * d2, a = sstep(th - ew, th + ew, d);
        if (a > b2) {
          const kk = Math.min(1, Math.max(0, (d - th) / 0.17));
          let lc, ls;
          lc = 0.97 - 0.6 * Math.sqrt(kk) + 0.4 * (d2 - 0.5); ls = 0.6 - 0.25 * kk + 0.32 * (d2 - 0.5); // day: bright thin edges, gray-blue cores
          const iv = ph.inv; if (iv > 0) { lc += (0.32 + 0.5 * kk + 0.2 * (d2 - 0.5) - lc) * iv; ls += (0.5 + 0.08 * kk + 0.22 * (d2 - 0.5) - ls) * iv; } // night: city light under the thick parts
          L = lc + (ls - lc) * strat - 0.5 * dark + ph.silver * g * 1.6 + ph.cl; ro = CO[p]; rn = CN[p]; layer = 1; done = true;
        }
      }
      if (!done && doUp) {
        let d; if (fresh || fr - TU[k] > 2) { d = KU[k] = samp(TLO, ux * kUx + oUx, uz * kUz + oUz); TU[k] = fr; } else d = KU[k];
        const a = sstep(thU - 0.05, thU + 0.05, d) * Math.min(1, strat * 1.2);
        if (a > b2) { L = 0.8 - 0.3 * dark + 0.3 * (d - 0.5) + ph.cl + 0.3 * ph.silver * g; ro = CO[p]; rn = CN[p]; layer = 1; done = true; }
      }
      if (!done && doCir) {
        const lod = hC * FPU[k];
        if (lod < 3) {
          let d; if (fresh || fr - TC[k] > 2) { d = KC[k] = samp(TLO, ux * kCx + oCx, uz * kCz + oCz); TC[k] = fr; } else d = KC[k];
          const a = sstep(thC, thC + 0.2, d) * P.cir * 0.75 * (1 - lod / 3);
          if (a > b2) { L = 0.9 + 0.1 * g + ph.cl; ro = CO[p]; rn = CN[p]; layer = 1; done = true; }
        }
      }
      if (!done) {
        if (moon) { const mx = x - MOON.x, my = y - MOON.y, r2 = mx * mx + my * my, R = MOON.r;
          if (r2 <= R * R) { const sh = (mx + 1.6 * R) * (mx + 1.6 * R) + my * my < R * R * 1.15; ro = OFF.moon; rn = 4; L = sh ? 0.05 : 0.7 + 0.3 * (1 - r2 / (R * R)) - (h2(x * 31 + 7, y) < 0.18 ? 0.3 : 0); done = true; layer = 2; } }
        if (!done && starOn && (p === NIGHT || p === BLUE)) {
          const dens = 0.0042 * (1.25 - E[k]) * (1 - 0.8 * cov) * (p === BLUE ? 0.35 : 1);
          if (SH[k] < dens) { const hs = SH[k] / dens; const tw = 0.5 + 0.5 * psin(tm * (0.35 + 0.8 * hs) + hs * 40); ro = OFF.star; rn = 4; L = 0.25 + 0.45 * fract(hs * 7.7) + 0.3 * tw; layer = 2; }
        }
      }
      if (veil > 0 && layer === 0 && ph.inv === 1) { ro = CO[p]; rn = CN[p]; L = 0.28 + 0.4 * veil; layer = 1; } // night fog glows with the city
      if (veil > 0 && layer !== 2) {
        if (veil * 0.8 > b2 + 0.42) { ro = CO[p]; rn = CN[p]; L = 0.86 + 0.12 * (veil - 0.5) + ph.cl * 0.5; layer = 1; }
        else L += (1 - L) * veil * 0.6;
      }
      // glass: sheen (Desktop Bo's window glare, jungle.js:302) as two diagonal bands across the roof that step pane to pane;
      // when wet, a slow shimmer of the water film
      const u = PU[k], v = PV[k];
      { const b = SHB[k]; if (b > 0) L += sheen0 * b; }
      if (wet > 0.02) L += 0.06 * wet * (0.6 - v) + 0.035 * wet * psin(PZW[k] * 2.1 - tm * 0.7 + PU[k] * 3);
      // quantize (PS.idx semantics)
      if (layer !== 2) L += tsh;
      let f = L * (rn - 1); if (f < 0) f = 0; else if (f > rn - 1.001) f = rn - 1.001;
      let st = f | 0; if (f - st > b1) st++;
      let fl = layer ? 1 : 0, shift = 0;
      // drops (rain) and stuck flakes (snow): screen cells of 6 px, each with a slow life cycle
      const nr = NEAR[k];
      if (doDrops && nr > 0) {
        const cs = CSL[k], kind = CK[cs];
        if (kind && CD[cs] < (kind < 4 ? cellDens : cellDens + flakeDens) * nr) { // fewer on far panes (level of detail)
          const cr2 = CR[k], rx = (cr2 >> 4) - CX0[cs], ry = (cr2 & 15) - CY0[cs];
          if (kind === 1) { if (rx === 1 && ry === -1) { shift = 2; fl |= 2; } else if (rx === 0 && ry === 0) { shift = -2; fl |= 2; } }
          else if (kind === 2) { if (rx === 1 && ry === 0) { shift = 2; fl |= 2; } else if ((rx === 0 && ry === 0) || (rx === 1 && ry === 1)) { shift = -1; fl |= 2; } else if (rx === 0 && ry === 1) { shift = -2; fl |= 2; } }
          else if (kind === 3) { if (rx === 0 && ry === 0) { shift = 2; fl |= 2; } }
          else if (rx === 0 && ry === 0) { ro = CO[p]; rn = CN[p]; st = rn - 1 - (kind === 5 ? 1 : 0); fl |= 2; }
        }
      }
      // runnels: a drop lets go and slides down the pane (+z, down on screen), leaving a beaded trail
      if (doRun && nr > 0.4) {
        const o = PSL[k], head = RH[o];
        if (head >= 0 && v >= RV[o] && v <= head && v <= 0.995) {
          const pw = PXW[k], du = (u - RU[o]) * pw, lim = 0.6 + 0.022 * pw;
          if (du <= lim && du >= -lim) {
            const dp = du - 0.022 * psin(v * 9 + RR[o] * 40) * pw;
            if (dp >= -0.5 && dp < 0.5) {
              const fromHead = (head - v) * PXD[k]; let sh = 0;
              if (head < 1 && fromHead < 1) sh = 2; else if (head < 1 && fromHead < 2.5) sh = -2;
              else { const bh = h2((v * PXD[k]) | 0, PIDS[o]); sh = bh < 0.4 ? -2 : bh < 0.75 ? -1 : bh < 0.85 ? 1 : 0; }
              if (sh) { shift = sh; fl |= 2; }
            }
          }
        }
      }
      if (shift) { st += shift; if (st < 0) st = 0; else if (st > rn - 1) st = rn - 1; }
      // snow drift along each pane's lower (+z) edge: thick snow seen from below is backlit, so its core is darker
      if (doDrift) {
        const dep = acc * PROF[k] - (1 - v);
        if (dep > 0 && dep * PXD[k] * 0.8 > b2) {
          ro = CO[p]; rn = CN[p]; const Ls = 0.98 - 0.42 * Math.min(1, dep / (acc * 0.8)) + 0.06 * nightW;
          let f2 = Ls * (rn - 1); if (f2 > rn - 1.001) f2 = rn - 1.001; st = f2 | 0; if (f2 - st > b1) st++; fl |= 2;
        }
      }
      FLAG[k] = fl;
      o32[list[k]] = PAL[ro + st];
    }

    // ── sprites, projected with the stage camera: falling snow, birds, a high plane (rare, tiny)
    if (!reduced && n) {
      const proj = SKY.project || PS.project;
      const put = (sx, sy, col, needClear) => { const xx = Math.round(sx), yy = Math.round(sy); if (xx < 0 || yy < 0 || xx >= W || yy >= H) return; const i = yy * W + xx, k = POS[i]; if (k < 0 || (FLAG[k] & 2) || (needClear && (FLAG[k] & 1))) return; o32[i] = PAL[col]; };
      const putA = (sx, sy, col, a) => { const xx = Math.round(sx), yy = Math.round(sy); if (xx < 0 || yy < 0 || xx >= W || yy >= H) return; const i = yy * W + xx, k = POS[i]; if (k < 0 || (FLAG[k] & 3) || a <= B2[k]) return; o32[i] = PAL[col]; };
      const pdom = pf > 0.5 ? pb : pa, cTop = CO[pdom] + CN[pdom] - 1;
      // falling snow
      const nf = snowF > 0.004 ? (150 * snowF + 0.5) | 0 : 0;
      for (let j = 0; j < nf; j++) {
        const hj = h2(j, 911), per = 6 + 7 * hj, tt = tm + hj * 31, c = Math.floor(tt / per), tau = (tt - c * per) / per;
        const kL = Math.floor(h2(j * 3 + c * 17, 5) * n), hs = 2.5 + 9 * h2(j, c * 7 + 1), up = hs * (1 - tau);
        const wx = pane[2 * kL] - wind * up * 0.45 + 0.1 * psin(tau * per * 1.3 + j), wz = pane[2 * kL + 1] - 0.12 * up;
        const pr = proj(wx, SKY_Y + up, wz); if (pr[2] <= 0.1) continue;
        put(pr[0], pr[1], cTop - (hj < 0.3 ? 1 : 0), false);
        if (pr[2] < 13 && hj > 0.8) put(pr[0] + 1, pr[1], cTop - 1, false);
      }
      const B = SKY.debug;
      // birds: a single or a loose few, under the clouds, at most once a minute or so
      const dayW = 1 - nightW, birdsP = P.birds * dayW;
      const EB = 64, e0 = Math.floor(tm / EB);
      for (let ee = e0 - 1; ee <= e0; ee++) {
        let ts = ee * EB + 8 + 30 * h2(ee, 4243), ok = h2(ee, 4242) < birdsP;
        if (B.birdAt != null && ee === e0) { ts = B.birdAt; ok = true; }
        if (!ok || tm < ts) continue;
        const path = flight(ee, 26 + 10 * h2(ee, 4244), 0.6, dirs); if (!path) continue;
        const [ax, ay, az, bx, by, bz, len] = path, dur = len / 4.2, s = (tm - ts) / dur; if (s > 1) continue;
        const m = 1 + Math.floor(h2(ee, 13) * 4), col = OFF.bird + (pdom === DAY ? 1 : 0);
        for (let i = 0; i < m; i++) {
          const ux = (bx - ax) / len, uz = (bz - az) / len, back = 0.9 * i, side = (i & 1 ? 1 : -1) * 0.6 * Math.ceil(i / 2);
          const wx = ax + (bx - ax) * s - ux * back - uz * side, wz = az + (bz - az) * s - uz * back + ux * side, wy = ay + 0.2 * psin(i * 2.1);
          const pr = proj(wx, wy, wz); if (pr[2] <= 0.1) continue;
          const glide = psin(tm * 0.8 + i * 1.9) > 0.5, up = !glide && (Math.floor(tm * 6.5 + i * 1.7) & 1);
          put(pr[0], pr[1], col, false); put(pr[0] - 1, pr[1] - (up ? 1 : 0), col, false); put(pr[0] + 1, pr[1] - (up ? 1 : 0), col, false);
        }
      }
      // a plane, very high and slow, above the clouds (only shows through clear sky); a contrail by day in clear air
      const EP = 170, e1 = Math.floor(tm / EP);
      for (let ee = e1 - 1; ee <= e1; ee++) {
        let ts = ee * EP + 10 + 60 * h2(ee, 5243), ok = h2(ee, 5242) < P.plane;
        if (B.planeAt != null && ee === e1) { ts = B.planeAt; ok = true; }
        if (!ok || tm < ts) continue;
        const path = flight(ee + 50000, 260, 1.2, dirs); if (!path) continue;
        const [ax, ay, az, bx, by, bz, len] = path, sp = 7, dur = len / sp, s = (tm - ts) / dur; if (s > 1.15) continue;
        const at = (q) => proj(ax + (bx - ax) * q, ay, az + (bz - az) * q);
        if (pdom !== NIGHT && pdom !== BLUE && P.cir > 0.1) { // contrail, fading and spreading with age
          for (let a = 0.25; a < 24; a += 0.12) { const q = s - a * sp / len; if (q < 0) break; const pr = at(q); if (pr[2] <= 0) continue; const al = (1 - a / 24) * 0.9 * Math.min(1, P.cir * 2);
            putA(pr[0], pr[1], cTop - 1, al); if (a > 6) putA(pr[0], pr[1] + 1, cTop - 1, al * 0.55); }
        }
        if (s <= 1) { const pr = at(s); if (pr[2] > 0) {
          if (pdom === NIGHT || pdom === BLUE) { put(pr[0], pr[1], OFF.craft + 1, true); if (fract(tm / 1.4) < 0.09) put(pr[0], pr[1], OFF.star + 3, true); }
          else { put(pr[0], pr[1], OFF.craft + 2, true); put(pr[0] + 1, pr[1], OFF.craft + 3, true); } } }
      }
    }

    // ── what the stage needs back
    const amb = Math.max(0, Math.min(1, (PH[pa].amb + (PH[pb].amb - PH[pa].amb) * pf) * (1 - 0.34 * dark * cov - 0.08 * P.mist - 0.05 * strat * cov)));
    let clearSun = 1;
    if (sunUp && cov > 0.01) { const ux = SX / Math.max(0.05, SY), uz = SZ / Math.max(0.05, SY);
      const d = 0.7 * samp(TLO, md(ux * kMx) + oMx, md(uz * kMz) + oMz) + 0.3 * 0.5; clearSun = 1 - sstep(th - 0.06, th + 0.06, d); }
    const shaft = sunUp ? Math.max(0, Math.min(1, (PH[pa].beam + (PH[pb].beam - PH[pa].beam) * pf) * clearSun * (1 - 0.85 * strat * cov) * (1 - 0.7 * P.mist) * (1 - 0.6 * dark))) : 0;
    const pd = pf > 0.5 ? pb : pa;
    let tint = pd !== DAY ? PH[pd].name : null;
    if (pd === DAY) tint = P.rain > 0.5 ? 'rain' : P.snow > 0.5 ? 'snow' : P.mist > 0.5 ? 'mist' : strat * cov > 0.6 ? 'overcast' : null;
    return { ambient: +amb.toFixed(3), shaft: +shaft.toFixed(3), tint, phase: PH[pd].name, weather: S.wx, cover: +cov.toFixed(3) };
  };

  // a straight path across the visible sky on a plane at height y: through two listed pixels far apart, extended
  function flight(seed, y, ext, dirs) {
    const n = C.n; if (!n) return null;
    const kA = Math.floor(h2(seed, 11) * n); let kB = -1, best = -1;
    for (let i = 0; i < 6; i++) { const k = Math.floor(h2(seed, 12 + i) * n), s = Math.abs(X[k] - X[kA]) * 1.5 + Math.abs(Y[k] - Y[kA]); if (s > best) { best = s; kB = k; } }
    const hy = y - CAM.y, pt = (k) => { const dy = Math.max(0.03, dirs[3 * k + 1]); return [CAM.x + dirs[3 * k] / dy * hy, CAM.z + dirs[3 * k + 2] / dy * hy]; };
    const A = pt(kA), Bp = pt(kB); const ddx = Bp[0] - A[0], ddz = Bp[1] - A[1];
    const ax = A[0] - ddx * ext, az = A[1] - ddz * ext, bx = Bp[0] + ddx * ext, bz = Bp[1] + ddz * ext, len = Math.hypot(bx - ax, bz - az);
    return len > 0.5 ? [ax, y, az, bx, y, bz, len] : null;
  }

  // ── an unattended demo: several minutes per weather; the hour turns one hour per real minute; wind wanders
  const SCHED = [['fair', 240], ['clear', 180], ['overcast', 200], ['rain', 260], ['mist', 180], ['fair', 200], ['snow', 260], ['overcast', 160]];
  const SPAN = SCHED.reduce((a, s) => a + s[1], 0);
  SKY.cycle = function (t) {
    let s = ((t % SPAN) + SPAN) % SPAN, i = 0; while (s >= SCHED[i][1]) { s -= SCHED[i][1]; i++; }
    return { weather: SCHED[i][0], next: SCHED[(i + 1) % SCHED.length][0], left: SCHED[i][1] - s, hour: (9 + t / 60) % 24,
      wind: Math.max(-1, Math.min(1, 0.35 + 0.35 * Math.sin(t / 97) + 0.2 * Math.sin(t / 41 + 1))) };
  };
  SKY.prefersReduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
})();
