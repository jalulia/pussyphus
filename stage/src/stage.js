// stage.js — Pussyphus stage v2. The escalator and Kiosk Canyon painted in Desktop Bo's grammar at 480×560.
// Static scenery is ray cast once into cached buffers (ramp, base light, depth, tags). Each frame repaints only
// what moves: the steps (analytic staircase march), the handrail highlight, sky panes, signs, lamps, figures in
// the stores and on the balconies, plants, shoppers, Bo and the dust in the sun.
var STAGE = window.STAGE || (window.STAGE = {});
(function () {
  const { W, H, G, CAM, R, RID, RGB } = PS;
  const N = W * H, fr = v => v - Math.floor(v), bay = PS.bay, hash = PS.hash, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const surf = z => z * (G.RISE / G.RUN), WX = PS.wallX, SX = PS.slabX, LV = (y) => Math.floor(y / G.LEVEL);

  // ── 3×5 letters for sign bands ──
  const F = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111', ' ': '000000000000000', '&': '010101010101011' };
  // a designed set of stores: name, sign ramp, awning ramps, wall ramp, goods, floor
  const STORES = [
    { name: 'BOOKS', neon: 'gold', awn: ['teal', 'trim'], wall: 'walnut', goods: 'books', floor: 'wood' },
    { name: 'RECORDS', neon: 'boblue', awn: ['navy', 'trim'], wall: 'navy', goods: 'records', floor: 'terr' },
    { name: 'PRETZELS', neon: 'pink', awn: ['ochre', 'trim'], wall: 'ochre', goods: 'counter', floor: 'terr' },
    { name: 'CANDLES', neon: 'gold', awn: ['plum', 'trim'], wall: 'plum', goods: 'candles', floor: 'wood' },
    { name: 'SOCKS', neon: 'boblue', awn: ['rust', 'trim'], wall: 'trim', goods: 'socks', floor: 'terr' },
    { name: 'PLANTS', neon: 'pink', awn: ['moss', 'trim'], wall: 'trim', goods: 'plants', floor: 'terr' },
    { name: 'LAMPS', neon: 'gold', awn: ['navy', 'trim'], wall: 'walnut', goods: 'lamps', floor: 'wood' },
    { name: 'ARCADE', neon: 'boblue', awn: ['plum', 'trim'], wall: 'navy', goods: 'arcade', floor: 'navy' },
    { name: 'TEA', neon: 'pink', awn: ['moss', 'trim'], wall: 'wood', goods: 'tins', floor: 'wood' },
    { name: 'CLOCKS', neon: 'gold', awn: ['teal', 'trim'], wall: 'teal', goods: 'clocks', floor: 'terr' },
    { name: 'YARN', neon: 'pink', awn: ['rust', 'trim'], wall: 'trim', goods: 'yarn', floor: 'wood' },
    { name: 'PHOTO', neon: 'boblue', awn: ['ochre', 'trim'], wall: 'trim', goods: 'frames', floor: 'terr' },
  ];
  const BOOKC = ['ochre', 'teal', 'rust', 'navy', 'moss', 'plum'];
  const storeAt = (side, lvl, bz) => { const h = hash(bz * 7 + 3, lvl * 13 + (side > 0 ? 5 : 11)); return { id: ((bz & 255) << 8) | ((lvl + 8) << 1) | (side > 0 ? 1 : 0), s: STORES[Math.floor(h * STORES.length)], h }; };
  function sign(word, u, v) { const n = word.length, cols = n * 4 - 1, gx = Math.floor(u * (cols + 2)) - 1, gy = Math.floor(v * 7) - 1;
    if (gx < 0 || gy < 0 || gy > 4 || gx >= cols) return false; const li = Math.floor(gx / 4), lx = gx % 4; if (lx === 3) return false; const g = F[word[li]] || F[' ']; return g[gy * 3 + lx] === '1'; }

  // ── buffers ──
  const B = {
    rid: new Uint8Array(N), L: new Float32Array(N), t: new Float32Array(N), tag: new Uint8Array(N), aux: new Int32Array(N),
    wx: new Float32Array(N), wy: new Float32Array(N), wz: new Float32Array(N), shaftCol: new Float32Array(N),
    base: new Uint8ClampedArray(N * 4), stairCand: null, skyList: null, skyDirs: null, skyPane: null,
  };
  const TAG = { STATIC: 0, SKY: 1, RAIL: 2, SIGN: 3, LAMP: 4, INTERIOR: 5, GLINT: 6 };
  STAGE.B = B; STAGE.TAG = TAG;

  // ── the static scene: axis-aligned planes with bounds and painters. painter(x,y,z,sx,sy,fp,o,d,t) -> [ramp, L, tag?, aux?] or null to pass through
  function staticScene() {
    const S = [];
    for (const s of [-1, 1]) {
      // skirt with brass cap
      S.push({ ax: 0, v: s * G.HALF, test: (x, y, z) => z > -2 && y > surf(z) - 0.35 && y < surf(z) + 0.13, paint: (x, y, z) => {
        const h = y - surf(z); if (h > 0.105) return ['brass', s < 0 ? 0.78 : 0.5];
        return ['steel', (s < 0 ? 0.6 : 0.34) + (fr((z - 0.6 * y) * 0.9) < 0.05 ? 0.18 : 0)]; } });
      // glass balustrade, screen-door with reflection streaks and panel joints
      S.push({ ax: 0, v: s * G.GLX, test: (x, y, z) => z > -2 && y > surf(z) + 0.13 && y < surf(z) + 0.95, paint: (x, y, z, sx, sy) => {
        const streak = fr((y * 1.2 - z * 0.55) * 0.9) < 0.06, joint = Math.abs(fr(z / 1.4) - 0.5) > 0.49;
        if (joint) return ['steel', s < 0 ? 0.72 : 0.46];
        return null; }, tint: (x, y, z) => 0.06 + (fr((y * 1.2 - z * 0.55) * 0.9) < 0.06 ? 0.16 : 0) });
      // handrail band (animated highlight -> RAIL)
      S.push({ ax: 0, v: s * (G.GLX - 0.01), test: (x, y, z) => z > -2 && y >= surf(z) + 0.95 && y < surf(z) + 1.05, paint: (x, y, z) => {
        const h = (y - surf(z) - 0.95) / 0.1; return ['rubber', (h > 0.78 ? 0.86 : h < 0.14 ? 0.52 : 0.3 + 0.28 * h) + (s < 0 ? 0.05 : 0), TAG.RAIL]; /* underside lifted by bounce light off the steps; lit lip on top */ } });
      // the canyon walls: stacked levels of storefronts
      for (let l = -2; l <= G.TOPLVL; l++) S.push({ ax: 0, v: s * WX(l), test: (x, y) => LV(y) === l || (l === -2 && y < -2 * G.LEVEL) || (l === G.TOPLVL && y >= l * G.LEVEL && y < G.VAULT_Y), paint: (x, y, z, sx, sy, fp) => y < G.VAULT_Y ? wall(s, y, z, sx, sy, fp) : null });
      // slab edges + balcony rails at each level
      for (let l = -2; l <= G.TOPLVL; l++) S.push({ ax: 0, v: s * SX(l), test: (x, y, z) => { if (Math.round(y / G.LEVEL) !== l) return false; const ly = y - l * G.LEVEL; return ly > -0.3 && ly < (Math.round(y / G.LEVEL) < G.TOPLVL ? 0.74 : 0.62) && y < G.TOPLVL * G.LEVEL + 0.7; }, paint: (x, y, z, sx, sy, fp) => {
        const ly = y - Math.round(y / G.LEVEL) * G.LEVEL, lit = s < 0 ? 1 : 0;
        if (ly < 0.02) { if (ly > -0.035) return ['trim', 0.55 + 0.35 * lit]; if (ly < -0.282) return ['warm', 0.97]; const lv = Math.round(y / G.LEVEL), fas = ['pteal', 'ppink', 'pbutter'][((lv % 3) + 3) % 3]; if (ly < -0.26) return [fas, 0.1 + 0.15 * lit]; return [fas, 0.3 + 0.32 * lit + 0.12 * ((ly + 0.26) / 0.26)]; }
        if (ly > 0.56 && ly < 0.6) return ['brass', 0.58 + 0.3 * lit];
        if (ly >= 0.6) { if (fp > 0.05) return ['jade', 0.35 + 0.2 * lit]; if (fp < 0.03) return planterNear(z, ly - 0.6, Math.round(y / G.LEVEL) * 2 + (s > 0 ? 1 : 0), lit); const h = hash(Math.floor(z * 18), Math.floor(ly * 30) + Math.round(y)); return h > 0.62 ? ['geranium', 0.35 + 0.5 * h + 0.1 * lit] : ['jade', 0.22 + 0.35 * h + 0.15 * lit]; }
        if (fp < 0.04 && Math.abs(fr(z / 0.32) - 0.5) > 0.44) return ['brass', 0.32 + 0.25 * lit];
        return null; }, tint: 0.04 });
      // slab tops (balcony floors) and soffits with downlights
      S.push({ ax: 1, mod: G.LEVEL, top: true, test: (x, y, z) => { const l = Math.round(y / G.LEVEL); return s * x > SX(l) && s * x < WX(l) && y <= G.TOPLVL * G.LEVEL; }, paint: (x, y, z, sx, sy, fp) => {
        const c = hash(Math.floor(x * 40), Math.floor(z * 40));
        if (fp < 0.02 && c > 0.955) return [BOOKC[Math.floor(hash(Math.floor(z * 40), 7) * 6)], 0.5];
        const strip = fp < 0.012 && (Math.abs(fr(z / 1.22) - 0.5) > 0.49);                                         // brass divider strips on a 1.22 m grid (rule 14)
        if (strip) return ['brass', s < 0 ? 0.85 : 0.55];
        const pool = Math.exp(-Math.pow((fr(z / G.BAYZ) - 0.5) * G.BAYZ / 0.55, 2));                                   // a downlight pool under each soffit, every bay (rule 9)
        return ['terr', 0.5 + 0.26 * (s < 0 ? 1 : 0.35) + 0.12 * pool]; } });
      S.push({ ax: 1, mod: G.LEVEL, off: -0.3, bottom: true, test: (x, y, z) => { const l = Math.round((y + 0.3) / G.LEVEL); return s * x > SX(l) && s * x < WX(l - 1) && y < (G.TOPLVL + 1) * G.LEVEL; }, paint: (x, y, z, sx, sy, fp) => {
        const l = Math.round((y + 0.3) / G.LEVEL), lz = fr(z / G.RIB), lx = Math.abs(s * x - (SX(l) + WX(l - 1)) / 2);
        if (lx < 0.1 && Math.abs(lz - 0.5) < 0.035) return ['warm', 0.95, TAG.LAMP, Math.floor(z / G.RIB) * 64 + Math.round(y)];
        return ['trim', 0.28 + 0.1 * (s < 0 ? 1 : 0)]; } });
    }
    // the atrium floor two levels down, under the void: big terrazzo with a brass-ringed inlay every other bay
    S.push({ ax: 1, v: G.GROUND, test: (x, y, z) => Math.abs(x) < SX(-2) + 0.01 && z > -4, paint: (x, y, z, sx, sy, fp) => {
      const cz = Math.round(z / (2 * G.BAYZ)) * 2 * G.BAYZ, rr = Math.hypot(x * 0.8, z - cz);
      if (fp < 0.06 && Math.abs(rr - 2.4) < 0.05) return ['brass', 0.6];
      if (rr < 2.4) return [Math.floor(Math.atan2(z - cz, x) / (Math.PI / 6)) & 1 ? 'pteal' : 'terr', 0.45 + 0.2 * (1 - rr / 2.4)];
      return ['terr', 0.42 + (fp < 0.03 && Math.abs(fr(z / 1.4) - 0.5) > 0.48 ? 0.15 : 0)]; } });
    // the escalator's outer cladding under the glass, down to the truss
    for (const s of [-1, 1]) S.push({ ax: 0, v: s * (G.GLX + 0.03), test: (x, y, z) => z > -2 && y > surf(z) - 1.05 && y < surf(z) + 0.13, paint: (x, y, z, sx, sy, fp) => {
      const h = y - surf(z); if (h > 0.08) return ['brass', s < 0 ? 0.75 : 0.45]; if (h < -0.98) return ['steel', 0.25];
      const u = z + 1.6 * h, refl = Math.max(0, Math.sin(0.37 * u) + 0.6 * Math.sin(0.93 * u + 1.3) - 0.55);   /* brushed steel: soft, uneven reflections of the hall sliding along it */
      return ['steel', (s < 0 ? 0.62 : 0.4) + (fp < 0.02 && Math.abs(fr(z / 1.2) - 0.5) > 0.485 ? -0.15 : 0) + 0.16 * (h + 1) + 0.14 * refl - (h > -0.06 ? 0.1 : 0)]; } });
    // the glazed barrel vault over the atrium: arch ribs every 1.35 m, purlins every 12 degrees, a heavier rib every third arch
    S.push({ vault: true, paint: (x, y, z, sx, sy, fp) => {
      const a = Math.atan2(x, y - G.VAULT_Y), az = fr(z / G.RIB), aa = fr((a + Math.PI / 2) / (Math.PI / 21));
      const heavy = Math.abs(fr(z / (3 * G.RIB)) - 0.5) > 0.488, rib = Math.abs(az - 0.5) > 0.476, purl = Math.abs(aa - 0.5) > 0.465;
      if (heavy) return ['trim', 0.5 + 0.3 * Math.max(0, Math.sin(a))];
      if (rib || purl) return ['trim', fp > 0.03 ? 0.7 : 0.82 + 0.1 * Math.max(0, Math.sin(a))];
      return ['sky', 0.6, TAG.SKY]; } });
    return S;
  }

  function wall(s, y, z, sx, sy, fp) {
    const lit = s < 0 ? 1 : 0, lvl = Math.floor(y / G.LEVEL), ly = (y - lvl * G.LEVEL) / G.SF, lyRaw = y - lvl * G.LEVEL, bz = Math.floor(z / G.BAYZ), bu = fr(z / G.BAYZ);
    const st = storeAt(s, lvl, bz);
    if (lvl >= G.TOPLVL) { if (lyRaw > G.VAULT_Y - G.TOPLVL * G.LEVEL - 0.08) return ['trim', 0.6 + 0.3 * lit]; return ['wall', 0.28 + 0.3 * lit + (fr(z / 0.9) < 0.04 ? -0.12 : 0)]; } // parapet
    { const dz = z - Math.round(z / G.BAYZ) * G.BAYZ, dy = ly - 1.7; if (dz * dz + dy * dy < 0.0081) return ['warm', 0.75 + 0.25 * (1 - (dz * dz + dy * dy) / 0.0081) + (dz * s < 0 ? 0.1 : 0), TAG.LAMP, Math.round(z / G.BAYZ) * 31 + lvl]; }
    if (bu < 0.06 || bu > 0.94) return ['wall', 0.2 + 0.36 * lit + (fp < 0.02 && (bu < 0.025 || bu > 0.975) ? 0.18 : 0)];            // pilaster
    if (ly < 1.55) {
      if (ly < 0.09 || Math.abs(fr(bu * 3) - 0.5) > 0.49 || (fp < 0.03 && ly > 1.5)) return ['steel', 0.4 + 0.35 * lit];          // frame + mullions
      if (fr((ly * 1.4 - bu * 2.2)) < 0.05) return ['glass', 0.72];                                                             // reflection streak on the glass
      return { interior: st };                                                                                                  // look inside
    }
    if (ly < 1.82) { const stripe = fp > 0.03 ? 0 : Math.floor(bu * 22) % 2; return [st.s.awn[stripe], 0.45 + 0.35 * lit - 0.25 * ((ly - 1.55) / 0.27)]; }
    if (ly < 2.14) { const u = (bu - 0.1) / 0.8, v = (ly - 1.84) / 0.28;
      if (u > 0 && u < 1 && v > 0 && v < 1) { if (fp > 0.022) return (v > 0.32 && v < 0.68) ? [st.s.neon, 0.62, st.h < 1 / 6 ? TAG.SIGN : TAG.STATIC, st.id] : ['ink', 0.4 + 0.3 * lit];
        if (sign(st.s.name, u, v)) return [st.s.neon, 0.84, st.h < 1 / 6 ? TAG.SIGN : TAG.STATIC, st.id];
        if (fp < 0.02 && sign(st.s.name, u, v + 1 / 7) && !sign(st.s.name, u, v)) return [st.s.neon, 0.2]; }        // the return under each channel letter
      return ['ink', 0.4 + 0.3 * lit]; }
    return ['wall', 0.3 + 0.38 * lit + 0.06 * (ly - 2.14) + (fp < 0.02 && Math.abs(lyRaw - (G.LEVEL - 0.55)) < 0.025 ? 0.2 : 0)]; // a reveal line under the next slab
  }

  // the inside of a store: a box behind the glass. o = point on the glass, d = ray dir. Returns [ramp, L, tag, aux, t] relative
  function interior(st, s, o, d, sx, sy, t0) {
    const lvl = Math.floor(o[1] / G.LEVEL), y0 = lvl * G.LEVEL, bz = Math.floor(o[2] / G.BAYZ), z0 = bz * G.BAYZ + 0.06 * G.BAYZ, z1 = bz * G.BAYZ + 0.94 * G.BAYZ;
    const WL = WX(lvl), back = s * (WL + G.INTERIOR), cx = s * (WL + 1.0), IH = 2.1 * G.SF;
    let best = 1e9, hit = null;
    const tryPlane = (ax, v, ok, kind) => { const dv = d[ax]; if (Math.abs(dv) < 1e-6) return; const t = (v - o[ax]) / dv; if (t <= 1e-4 || t >= best) return;
      const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]; if (!ok(p)) return; best = t; hit = { kind, p }; };
    tryPlane(0, back, p => p[1] >= y0 && p[1] <= y0 + IH && p[2] >= z0 && p[2] <= z1, 'back');
    tryPlane(1, y0, p => s * p[0] > WL && s * p[0] < WL + G.INTERIOR, 'floor');
    tryPlane(1, y0 + IH, p => s * p[0] > WL && s * p[0] < WL + G.INTERIOR, 'ceil');
    tryPlane(2, d[2] > 0 ? z1 : z0, p => s * p[0] > WL && p[1] >= y0 && p[1] <= y0 + IH, 'side');
    if (st.s.goods !== 'plants' && st.s.goods !== 'socks') { // a counter: front face + top
      const cz0 = z0 + 0.3 * (z1 - z0), cz1 = z0 + 0.62 * (z1 - z0);
      tryPlane(0, cx, p => p[1] >= y0 && p[1] <= y0 + 0.82 && p[2] >= cz0 && p[2] <= cz1, 'cfront');
      tryPlane(1, y0 + 0.82, p => s * p[0] > WL + 1.0 && s * p[0] < WL + 1.45 && p[2] >= cz0 && p[2] <= cz1, 'ctop');
    }
    if (!hit) return ['shop', 0.3, TAG.INTERIOR, st.id, 0.5];
    const p = hit.p, ly = p[1] - y0, u = (p[2] - z0) / (z1 - z0), lit = s < 0 ? 1 : 0, g = st.s.goods;
    // lamp pools: two downlights per store
    const pool = (px, pz) => Math.max(0, 1 - Math.hypot(s * px - (WL + 1.4), pz - (z0 + (z1 - z0) * 0.3)) / 0.9) + Math.max(0, 1 - Math.hypot(s * px - (WL + 1.4), pz - (z0 + (z1 - z0) * 0.72)) / 0.9);
    let r, L;
    if (hit.kind === 'ceil') { const lamp = [0.3, 0.72].some(q => Math.hypot(s * p[0] - (WL + 1.4), p[2] - (z0 + (z1 - z0) * q)) < 0.07);
      return lamp ? ['warm', 0.98, TAG.LAMP, st.id, best] : ['trim', 0.3 + 0.1 * lit, TAG.INTERIOR, st.id, best]; }
    if (hit.kind === 'floor') { r = st.s.floor; const pl = Math.min(1, pool(p[0], p[2])); L = 0.3 + (pl > 0.35 ? 0.42 : pl > 0.2 ? 0.22 : 0) + 0.08 * lit - (s * p[0] < WL + 0.3 ? 0.08 : 0); if (r === 'wood' && fr(p[2] * 7) < 0.08) L -= 0.12; return [r, L, TAG.INTERIOR, st.id, best]; } // tight accent pools (+2-3 steps), a darker landing strip inside the glass (research LIGHT-02, STORE-01/02)
    if (hit.kind === 'side') return [st.s.wall, 0.28 + 0.2 * (1 - Math.abs(ly - 1.6)), TAG.INTERIOR, st.id, best];
    if (hit.kind === 'cfront') return ['wood', 0.32 + 0.2 * lit + (ly > 0.74 ? 0.25 : 0), TAG.INTERIOR, st.id, best];
    if (hit.kind === 'ctop') { if (g === 'counter' && fr(p[2] * 6) < 0.4) return ['ochre', 0.75, TAG.INTERIOR, st.id, best]; if (g === 'candles' && fr(p[2] * 9) < 0.3) return ['gold', 0.9, TAG.GLINT, st.id, best]; return ['trim', 0.62, TAG.INTERIOR, st.id, best]; }
    // back wall with shelves and goods
    const shelf = fr(ly / 0.38) < 0.08 && ly > 0.3 && ly < 1.8;
    if (shelf) return ['wood', 0.55 + 0.2 * lit, TAG.INTERIOR, st.id, best];
    const row = Math.floor(ly / 0.38), cu = u * (z1 - z0);
    if (ly > 0.3 && ly < 1.8) {
      if (g === 'books') { const sp = Math.floor(cu / 0.035); if (fr(ly / 0.38) < 0.78) return [BOOKC[Math.floor(hash(sp, row) * 6)], 0.34 + 0.32 * hash(sp, row + 9), TAG.INTERIOR, st.id, best]; }
      if (g === 'records') { const c = fr(cu / 0.32); if (c > 0.08 && c < 0.92 && fr(ly / 0.38) > 0.15) return [BOOKC[Math.floor(hash(Math.floor(cu / 0.32), row) * 6)], 0.45 + 0.25 * fr(ly / 0.38 + c), TAG.INTERIOR, st.id, best]; }
      if (g === 'candles') { const c = fr(cu / 0.12); if (c > 0.35 && c < 0.65) { const top = fr(ly / 0.38) > 0.62; return top ? ['gold', 0.92, TAG.GLINT, st.id * 97 + Math.floor(cu / 0.12) * 7 + row, best] : ['trim', 0.65, TAG.INTERIOR, st.id, best]; } }
      if (g === 'socks') { const c = fr(cu / 0.14); if (c > 0.25 && c < 0.75 && fr(ly / 0.38) < 0.85) return [BOOKC[(Math.floor(cu / 0.14) + row) % 6], 0.45 + 0.3 * (fr(ly * 9) > 0.5 ? 1 : 0), TAG.INTERIOR, st.id, best]; }
      if (g === 'tins') { const c = fr(cu / 0.1); if (c > 0.15 && c < 0.85 && fr(ly / 0.38) > 0.2) return [BOOKC[Math.floor(hash(Math.floor(cu / 0.1), row + 3) * 6)], 0.5 + (c > 0.65 ? 0.25 : 0), TAG.INTERIOR, st.id, best]; }
      if (g === 'clocks') { const cxk = fr(cu / 0.42) - 0.5, cyk = fr(ly / 0.38) - 0.52, rr = Math.hypot(cxk * 0.42, cyk * 0.38); if (rr < 0.14) return rr > 0.12 ? ['brass', 0.7, TAG.INTERIOR, st.id, best] : ['trim', 0.85, TAG.GLINT, (st.id * 131 + Math.floor(cu / 0.42) * 17 + row) | 0, best]; }
      if (g === 'yarn') { const cxk = fr(cu / 0.16) - 0.5, cyk = fr(ly / 0.38) - 0.55; if (Math.hypot(cxk * 0.16, cyk * 0.38) < 0.065) return [BOOKC[Math.floor(hash(Math.floor(cu / 0.16), row + 5) * 6)], 0.4 + 0.4 * (0.5 - cyk), TAG.INTERIOR, st.id, best]; }
      if (g === 'frames') { const c = fr(cu / 0.36), v = fr(ly / 0.38); if (c > 0.1 && c < 0.9 && v > 0.15 && v < 0.85) { const inner = c > 0.2 && c < 0.8 && v > 0.28 && v < 0.72; return inner ? [BOOKC[Math.floor(hash(Math.floor(cu / 0.36), row) * 6)], 0.6, TAG.INTERIOR, st.id, best] : ['walnut', 0.45, TAG.INTERIOR, st.id, best]; } }
      if (g === 'lamps') { const c = fr(cu / 0.5) - 0.5, v = fr(ly / 0.38); if (Math.abs(c) < 0.12 + (v - 0.4) * 0.25 && v > 0.35 && v < 0.8) return ['warm', 0.88, TAG.GLINT, (st.id * 53 + Math.floor(cu / 0.5) * 11 + row) | 0, best]; if (Math.abs(c) < 0.02 && v < 0.35) return ['brass', 0.6, TAG.INTERIOR, st.id, best]; }
      if (g === 'arcade') { const c = fr(cu / 0.55), v = ly; if (c > 0.15 && c < 0.85 && v < 1.6) { const scr = c > 0.25 && c < 0.75 && v > 0.95 && v < 1.35; return scr ? ['boblue', 0.75, TAG.GLINT, (st.id * 29 + Math.floor(cu / 0.55)) | 0, best] : ['navy', 0.35 + (v > 1.4 ? 0.3 : 0), TAG.INTERIOR, st.id, best]; } }
      if (g === 'plants') { const c = hash(Math.floor(cu * 26), Math.floor(ly * 22)); if (ly < 1.4 && c > 0.42 - ly * 0.25) return ['jade', 0.28 + 0.5 * c, TAG.INTERIOR, st.id, best]; }
      if (g === 'counter' && ly > 1.25 && ly < 1.7 && cu > 0.4 && cu < (z1 - z0) - 0.4) return ['ink', 0.5 + (fr(cu * 8) < 0.5 && fr(ly * 12) < 0.4 ? 0.5 : 0), TAG.INTERIOR, st.id, best];
    }
    return [st.s.wall, 0.3 + 0.18 * lit + 0.12 * (1 - Math.abs(ly - 1.2) / 1.2), TAG.INTERIOR, st.id, best];
  }

  // ── ray cast one pixel against the static scene ──
  function castStatic(S, sx, sy) {
    const d = PS.ray(sx, sy), o = [CAM.x, CAM.y, CAM.z];
    let best = null, bt = 1e9;
    for (const s of S) {
      if (s.vault) { const R0 = G.VAULT_R, oy = o[1] - G.VAULT_Y, a = d[0] * d[0] + d[1] * d[1], b = 2 * (o[0] * d[0] + oy * d[1]), c = o[0] * o[0] + oy * oy - R0 * R0, disc = b * b - 4 * a * c;
        if (disc < 0 || a < 1e-9) continue; const t = (-b + Math.sqrt(disc)) / (2 * a); if (t <= 0.05 || t >= bt) continue;
        const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t; if (y < G.VAULT_Y) continue;
        const p = s.paint(x, y, z, sx, sy, t / CAM.f); if (p) { best = { t, p, x, y, z }; bt = t; } continue; }
      const dv = d[s.ax]; if (Math.abs(dv) < 1e-6) continue;
      if (s.mod) {
        const off = s.off || 0, dir = dv > 0 ? 1 : -1, l0 = Math.floor((o[1] - off) / s.mod) + (dv > 0 ? 1 : 0);
        for (let j = 0; j < 10; j++) { const v = (l0 + j * dir) * s.mod + off, t = (v - o[1]) / dv; if (t <= 0.05 || t >= bt) break;
          if (s.top && dv > 0) break; if (s.bottom && dv < 0) break;
          const x = o[0] + d[0] * t, z = o[2] + d[2] * t; if (!s.test(x, v, z)) continue;
          const p = s.paint(x, v, z, sx, sy, (t / CAM.f) / Math.max(0.06, Math.abs(dv)), o, d, t); if (p) { best = { t, p, x, y: v, z }; bt = t; } break; }
        continue;
      }
      const t = (s.v - o[s.ax]) / dv; if (t <= 0.05 || t >= bt) continue;
      const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t; if (!s.test(x, y, z)) continue;
      const p = s.paint(x, y, z, sx, sy, (t / CAM.f) / Math.max(0.06, Math.abs(dv)), o, d, t); if (!p) continue;
      best = { t, p, x, y, z }; bt = t;
    }
    // glass passed on the way: lighten the shade behind it a little (stays inside the hit surface's own ramp)
    let tint = 0; if (best) for (const s of S) { if (!s.tint || s.vault) continue; const dv = d[s.ax]; if (Math.abs(dv) < 1e-6) continue; const t = (s.v - o[s.ax]) / dv; if (t <= 0.05 || t >= best.t) continue;
      const px = o[0] + d[0] * t, py = o[1] + d[1] * t, pz = o[2] + d[2] * t; if (s.test(px, py, pz)) tint += typeof s.tint === 'function' ? s.tint(px, py, pz) : s.tint; }
    if (best && tint) { if (best.p.interior) best.tint = tint; else best.p = [best.p[0], best.p[1] + tint, best.p[2], best.p[3]]; }
    if (best && best.p.interior) { // continue into the store
      const s = best.x < 0 ? -1 : 1, q = interior(best.p.interior, s, [best.x, best.y, best.z], d, sx, sy);
      return { t: best.t + (q[4] || 0.5), r: q[0], L: q[1] + (best.tint || 0), tag: q[2] || TAG.INTERIOR, aux: q[3] | 0, x: best.x, y: best.y, z: best.z };
    }
    if (!best) return { t: 60, r: 'haze', L: 0.5, tag: TAG.STATIC, aux: 0, x: 0, y: 0, z: 60 };
    return { t: best.t, r: best.p[0], L: best.p[1], tag: best.p[2] || TAG.STATIC, aux: best.p[3] | 0, x: best.x, y: best.y, z: best.z };
  }

  // ── the staircase, marched analytically per frame ──
  // returns t of the stair hit (or 1e9) and fills hitOut [x,y,z,kind,k]
  const hitOut = [0, 0, 0, 0, 0];
  function stairHit(d, fp, tmax, kStart) {
    const o = [CAM.x, CAM.y, CAM.z];
    if (d[2] <= 1e-6) return 1e9;
    let u = o[2] / G.RUN + fp, k = Math.floor(u), tEnter = 0;
    if (kStart != null && kStart > k) { k = kStart; tEnter = Math.max(0, ((k - fp) * G.RUN - o[2]) / d[2]); }
    for (let i = 0; i < 160; i++) {
      const tExit = ((k + 1 - fp) * G.RUN - o[2]) / d[2];
      if (tEnter > tmax) return 1e9;
      // tread at height (k - fp) * RISE within this cell
      if (d[1] < 0) { const tt = ((k - fp) * G.RISE - o[1]) / d[1]; if (tt >= tEnter - 1e-6 && tt <= tExit && tt > 0.05) {
        const x = o[0] + d[0] * tt; if (Math.abs(x) > G.HALF || tt > tmax) return 1e9; hitOut[0] = x; hitOut[1] = o[1] + d[1] * tt; hitOut[2] = o[2] + d[2] * tt; hitOut[3] = 0; hitOut[4] = k; return tt; } }
      // riser of the next step at u = k + 1: hit if the ray is below the next tread level there
      const yExit = o[1] + d[1] * tExit;
      if (yExit < (k + 1 - fp) * G.RISE && tExit > 0.05) { const x = o[0] + d[0] * tExit; if (Math.abs(x) > G.HALF || tExit > tmax) return 1e9;
        hitOut[0] = x; hitOut[1] = yExit; hitOut[2] = o[2] + d[2] * tExit; hitOut[3] = 1; hitOut[4] = k + 1; return tExit; }
      tEnter = tExit; k++;
    }
    return 1e9;
  }
  function paintStair(x, y, z, kind, k, fp, sx, sy, t) {
    const fpix = t / CAM.f;
    if (kind === 0) { const z0 = (k - fp) * G.RUN, nose = z - z0 < 0.045, edge = G.HALF - Math.abs(x) < 0.05;
      if (nose || edge) return ['safety', 0.55 + 0.15 * (x / G.HALF) + (nose ? 0.15 : 0)];
      const cleat = fpix < 0.012 ? fr(x / 0.036) < 0.32 : false;
      return ['steel', (cleat ? 0.38 : 0.62) + 0.18 * (x / G.HALF) - 0.12 * ((z - z0) / G.RUN)]; }
    const y0 = (k - fp) * G.RISE, edge = G.HALF - Math.abs(x) < 0.05;
    if (edge) return ['safety', 0.25];
    const cleat = fpix < 0.012 ? fr(x / 0.036) < 0.4 : false;
    return ['riser', (cleat ? 0.18 : 0.42) + 0.22 * (x / G.HALF) + 0.25 * ((y - (y0 - G.RISE)) / G.RISE)];
  }

  // ── sun: patch on the skylight the sun shines through, and the lit column ──
  const SUNWIN = { x0: -8.6, x1: 9.2, z0: 3, z1: 60 };
  let SUNDX = 0;
  function sunlit(x, y, z) { const s = (G.VAULT_Y + 1.6 - y) / PS.LIGHT[1]; const qx = x + PS.LIGHT[0] * s + SUNDX, qz = z + PS.LIGHT[2] * s;
    if (!(qx > SUNWIN.x0 && qx < SUNWIN.x1 && qz > SUNWIN.z0 && qz < SUNWIN.z1)) return false;
    const bay3 = fr(qz / (3 * G.RIB)), bx = fr(qx / 2.8); return bay3 > 0.08 && bay3 < 0.78 && bx > 0.1 && bx < 0.55 && !(Math.abs(fr(qz / G.RIB) - 0.5) > 0.475 || Math.abs(fr(qx / 1.05) - 0.5) > 0.465); } /* sun only through the clear half of each truss bay: slabs of light, like J06's stripes; the same test drives the beams in the air (post.js) */
  STAGE.setSunHour = function (h) { SUNDX = Math.max(-1, Math.min(1, (h - 13) / 5)) * 0.9; }; STAGE.sun = () => ({ dx: SUNDX, win: SUNWIN });

  // haze by depth, dithered (Bayer offset so it doesn't lock to the shade dither)
  const hazeAt = (t, sx, sy) => clamp((t - 40) / 90, 0, 0.92) > bay(sx + 2, sy + 1); // the far end only (level of detail); the air itself is the atmosphere pass

  function writeRGB(out, k, r, L, sx, sy, bump) {
    const ramp = R[r], n = ramp.length; let i = PS.idx(r, L, sx, sy) + (bump | 0); i = i < 0 ? 0 : i >= n ? n - 1 : i;
    const c = RGB[RID[r]][i]; const j = k * 4; out[j] = c[0]; out[j + 1] = c[1]; out[j + 2] = c[2]; out[j + 3] = 255;
  }
  STAGE.writeRGB = writeRGB;

  // ── build the caches ──
  STAGE.init = function (opts = {}) {
    const t0 = performance.now();
    const S = staticScene();
    const sky = [], dirs = [], pane = [], cand = [];
    for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
      const k = sy * W + sx, h = castStatic(S, sx, sy);
      B.rid[k] = RID[h.r]; B.L[k] = h.L; B.t[k] = h.t; B.tag[k] = h.tag; B.aux[k] = h.aux; B.wx[k] = h.x; B.wy[k] = h.y; B.wz[k] = h.z;
      if (h.tag === TAG.SKY) { const d = PS.ray(sx, sy), n = Math.hypot(d[0], d[1], d[2]); sky.push(k); dirs.push(d[0] / n, d[1] / n, d[2] / n); pane.push(Math.atan2(h.x, h.y - G.VAULT_Y) * G.VAULT_R, h.z); } // pane coords: arc length across the vault, z along it
      // stair candidates: does the staircase ever come before the static hit?
      const d = PS.ray(sx, sy); let c = false; for (const fp of [0, 0.25, 0.5, 0.75]) if (stairHit(d, fp, h.t) < h.t) { c = true; break; }
      if (c) cand.push(k);
      // lit column density along the ray (for the visible shaft), 8 samples
      let dens = 0; const tm = Math.min(h.t, 60); for (let i = 1; i <= 8; i++) { const tt = tm * i / 9, x = CAM.x + d[0] * tt, y = CAM.y + d[1] * tt, z = CAM.z + d[2] * tt; if (Math.abs(x) < G.VAULT_R && sunlit(x, y, z)) dens++; }
      B.shaftCol[k] = dens / 8;
    }
    // per-pixel rays and a safe starting step for the stair march (two cells before the phase-0 hit)
    B.rx = new Float32Array(N); B.ry = new Float32Array(N); B.rz = new Float32Array(N); B.k0 = new Int16Array(N);
    for (let k = 0; k < N; k++) { const d = PS.ray(k % W, (k / W) | 0); B.rx[k] = d[0]; B.ry[k] = d[1]; B.rz[k] = d[2]; }
    for (const k of cand) { const d = [B.rx[k], B.ry[k], B.rz[k]], t = stairHit(d, 0, 1e9); B.k0[k] = t < 1e9 ? hitOut[4] - 2 : -999; }
    B.skyList = Int32Array.from(sky); B.skyDirs = Float32Array.from(dirs); B.skyPane = Float32Array.from(pane); B.stairCand = Int32Array.from(cand);
    STAGE.bake(opts.shaft ?? 0.7, opts.ambient ?? 1);
    STAGE.ms = { init: Math.round(performance.now() - t0), sky: sky.length, stair: cand.length };
    return STAGE.ms;
  };

  // bake static colors with the current sun strength (rebaked only when the light changes)
  STAGE.bakeVer = 0;
  STAGE.bake = function (shaft, ambient) {
    if (!B.t0) B.t0 = Float32Array.from(B.t); else B.t.set(B.t0);   // bare depth, before any baked sprites
    const nt = STAGE.nightAmt || 0; STAGE.light = { shaft, ambient, night: nt, haze: Math.min(0.999, 0.12 + 0.88 * ambient), k: (0.8 + 0.2 * ambient) * (1 - 0.45 * nt) }; STAGE.bakeVer++;
    { const L0 = STAGE.light; STAGE.lightSig = [Math.round(L0.k * 25), Math.round(L0.haze * 12), Math.round(shaft * 6), Math.round(SUNDX * 4), Math.round(nt * 4)].join(','); } // the steps and plants relight only when this changes
    for (let k = 0; k < N; k++) {
      const sx = k % W, sy = (k / W) | 0, tag = B.tag[k];
      let r = PS.RAMPS[B.rid[k]], L = B.L[k];
      if (hazeAt(B.t[k], sx, sy)) { r = 'haze'; L = STAGE.light.haze; }
      let bump = 0; if (r !== 'haze' && tag !== TAG.SKY && shaft > 0.05 && sunlit(B.wx[k], B.wy[k], B.wz[k])) bump = shaft > 0.75 && bay(sx + 1, sy + 3) < (shaft - 0.75) * 3 ? 2 : 1;
      if (r !== 'haze' && B.shaftCol[k] * shaft > 0.12 + bay(sx + 3, sy + 2) * 0.9) bump++;
      if (nt > 0.05 && (r === 'wall' || r === 'trim' || r === 'terr') && bay(sx + 2, sy) < Math.min(1, nt * 1.15)) r = r === 'wall' ? 'nightwall' : r === 'trim' ? 'nighttrim' : 'nightterr'; /* evening: the hall's plaster goes blue-gray in its own ramp, Bayer-dithered in */
      if (r !== 'haze' && tag !== TAG.INTERIOR && tag !== TAG.SIGN && tag !== TAG.LAMP && tag !== TAG.GLINT && tag !== TAG.SKY) L = L * STAGE.light.k * (B.wy[k] < -1 ? 1 - 0.42 * nt * Math.min(1, -B.wy[k] / 6) : 1); else if (r !== 'haze' && tag !== TAG.SKY) L += 0.2 * nt; /* the lower floors fall away into the dark */ /* at night stores, signs and lamps step up */ // night dims the hall; stores, signs and lamps keep glowing (Desktop Bo DBO-09: dim with holes)
      writeRGB(B.base, k, r, L, sx, sy, bump);
    }
    // print the still (far) plants into the static layer
    for (const p of W0.plants) drawPlant(B.base, B.t, p, 0, true, 'static');
  };

  // ── moving things: shoppers on the steps, figures in the stores and on the balconies, plants, dust ──
  const W0 = { shoppers: [], figures: [], plants: [], dust: [] };
  STAGE.world = W0;
  function silhouette(lx, ly, hgt, wid) { // a standing person seen from behind or side: head + coat
    const head = Math.hypot(lx, (ly - hgt * 0.93) * 1.15) < wid * 0.55; const body = ly < hgt * 0.86 && Math.abs(lx) < wid * (ly < 0.05 ? 0.9 : 0.75 + 0.35 * Math.sin(Math.min(1, ly / (hgt * 0.8)) * 1.9));
    return head ? 2 : body ? 1 : 0;
  }
  STAGE.spawnFigures = function (seed = 1) {
    W0.figures.length = 0;
    // store interiors: one occasional shopper per store across a band of depths (deep, quiet)
    for (const s of [-1, 1]) for (let lvl = -2; lvl <= G.TOPLVL - 1; lvl++) for (let bz = 1; bz < 9; bz++) {
      const h = hash(bz * 31 + seed, lvl * 17 + (s > 0 ? 3 : 9)); if (h < 0.7 || bz < 2) continue; // about 3 in 10 stores, and only the deeper ones
      const z0 = bz * G.BAYZ + 0.1 * G.BAYZ, z1 = bz * G.BAYZ + 0.9 * G.BAYZ;
      const tin = 3.5 + 2 * hash(bz, lvl + 50), tstop = 3 + 5 * hash(bz, lvl + 51), tout = 3.5 + 2 * hash(bz, lvl + 52);
      W0.figures.push({ kind: 'store', s, x: s * (WX(lvl) + 1.9), y: lvl * G.LEVEL, z0, z1, tin, tstop, tout, period: tin + tstop + tout + 40 + 80 * hash(bz, lvl + 40), dur: tin + tstop + tout, phase: 100 * h, coat: ['coat1', 'coat2', 'coat3'][Math.floor(h * 30) % 3], hgt: 1.62 + 0.15 * hash(bz, lvl + 2) });
    }
    // clerks: one still person behind the counter in some stores, almost motionless
    for (const s of [-1, 1]) for (let lvl = -1; lvl <= G.TOPLVL - 1; lvl++) for (let bz = 1; bz < 8; bz++) { const st = storeAt(s, lvl, bz); if (['counter', 'tins', 'books', 'records', 'clocks'].indexOf(st.s.goods) < 0 || hash(bz, lvl + 77) < 0.55) continue;
      const z0 = bz * G.BAYZ + 0.06 * G.BAYZ, z1 = bz * G.BAYZ + 0.94 * G.BAYZ, zc = z0 + (z1 - z0) * 0.46; W0.figures.push({ kind: 'clerk', s, x: s * (WX(lvl) + 1.7), y: lvl * G.LEVEL, z0: zc, z1: zc, period: 1, dur: 1e9, phase: 0, coat: ['teal', 'navy', 'plum'][Math.floor(hash(bz, lvl) * 3)], hgt: 1.6 }); }
    // balcony strollers: walk along the slab behind the rail, occasionally
    for (const s of [-1, 1]) for (let lvl = -1; lvl <= G.TOPLVL - 1; lvl++) {
      const h = hash(lvl * 7 + seed, s > 0 ? 21 : 29);
      W0.figures.push({ kind: 'balcony', s, x: s * (SX(lvl) + 0.9 + 0.8 * h), y: lvl * G.LEVEL, z0: 6, z1: 46, period: 60 + 40 * h, dur: 50 + 16 * h, phase: 200 * h, coat: ['coat1', 'coat2', 'coat3'][((lvl % 3) + 3) % 3], hgt: 1.66 });
    }
    // the ground floor, 8.4 m down: people crossing the court, small enough to show the drop
    for (let i = 0; i < 5; i++) { const h = hash(i * 13 + seed, 61), s = i % 2 ? 1 : -1;
      W0.figures.push({ kind: 'ground', s, x: s > 0 ? 2.3 + 1.8 * h : -(0.9 + 3.1 * h),   /* never edge-on under the camera */ y: G.GROUND, z0: 5 + 4 * i, z1: 44 + 3 * i, period: 44 + 30 * h, dur: 38 + 6 * h, phase: 120 * h + 17 * i, coat: ['coat1', 'coat2', 'coat3', 'teal', 'navy'][i], hgt: 1.66 }); }
  };
  STAGE.spawnPlants = function () {
    W0.plants.length = 0;
    // Ficus benjamina rising from the floor below, along the escalator well, crowns at Bo's level (research rule 4, Julia J04)
    for (const [x, z, sd, th] of [[-2.9, 8.5, 11, 10.4], [3.1, 13.5, 23, 12.0], [-3.2, 20.5, 37, 13.6], [3.3, 28.0, 41, 15.2], [-3.4, 37.0, 53, 16.4]]) W0.plants.push({ s: Math.sign(x), x, y: G.GROUND, z, kind: 'tree', seed: sd, h: 1, th, cr: 1.5 + 0.06 * th }); // tall atrium ficus from the ground floor, crowns around the escalator
    // big planters on the balconies, every ~4 m, alternating species; depth-tested sprites drawn in world units
    for (const s of [-1, 1]) for (let lvl = -1; lvl <= G.TOPLVL - 1; lvl++) for (let i = 0; i < 8; i++) {
      const z = 3.0 + i * 6.3 + (s > 0 ? 3.1 : 0) + (lvl & 1) * 1.6; const h = hash(i * 13 + lvl, s > 0 ? 7 : 3);
      W0.plants.push({ s, x: s * (SX(lvl) + 0.2), y: lvl * G.LEVEL, z, kind: h < 0.5 ? 'palm' : 'ficus', seed: h * 1000, h: 0.9 + 0.5 * h });
    }
  };

  // near planter boxes: round leaves with bloom clusters among them (shapes, not square cells), lit from above
  function planterNear(z, v, key, lit) { const cz = 0.075, cy = 0.05, iz = Math.floor(z / cz), iy = Math.floor(v / cy); let best = 9, bt = 0, bv = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const A = iz + a, Bq = iy + b, pz = (A + hash(A + key * 977, Bq + 31)) * cz, py = (Bq + hash(A + 7, Bq + key * 13 + 5)) * cy, r = 0.026 + 0.018 * hash(A + 3, Bq + key);
      const du = (z - pz) / r, dv = (v - py) / (r * 0.8), dd = du * du + dv * dv; if (dd < 1 && dd < best) { best = dd; bt = hash(A + 11 + key, Bq + 17); bv = dv; } }
    if (best >= 1) return ['jade', 0.1 + 0.1 * lit];
    const top = (bv + 1) / 2, rim = best > 0.72 ? -0.14 : 0;
    return bt > 0.66 ? ['geranium', 0.35 + 0.45 * top + 0.1 * lit + rim] : ['jade', 0.22 + 0.4 * top + 0.12 * lit + rim]; }

  // depth-tested pixel write into the frame
  let CAP = null;
  function put(out, depth, sx, sy, t, r, L, bump, line) { if (sx < 0 || sy < 0 || sx >= W || sy >= H) return; const k = sy * W + sx; if (t >= depth[k]) return;
    if (!line && hazeAt(t, sx, sy)) { r = 'haze'; L = STAGE.light.haze; } else if (r !== 'warm') L *= STAGE.light.k; else { glow[k] = STAGE.glowMark; L += 0.1 * (STAGE.light.night || 0); } depth[k] = t; writeRGB(out, k, r, L, sx, sy, bump); if (CAP) CAP.push(k, t, out[k * 4], out[k * 4 + 1], out[k * 4 + 2]); }

  // a vertical figure on the plane x = X (store interiors, balconies): ray test inside its screen box
  function drawFigureX(out, depth, f, zc, time) {
    const top = PS.project(f.x, f.y + f.hgt, zc), bot = PS.project(f.x, f.y, zc); if (bot[2] <= 0.1) return;
    const half = 0.28 * PS.ppu(bot[2]); const x0 = Math.floor(Math.min(top[0], bot[0]) - half - 1), x1 = Math.ceil(Math.max(top[0], bot[0]) + half + 1), y0 = Math.floor(top[1]) - 1, y1 = Math.ceil(bot[1]) + 1;
    const step = f.kind === 'clerk' ? 0.006 * Math.sin(time * 2 * Math.PI / 11 + f.z0) : Math.sin(time * 6.2) * 0.02; // walkers bob; clerks barely breathe
    for (let sy = Math.max(0, y0); sy <= Math.min(H - 1, y1); sy++) for (let sx = Math.max(0, x0); sx <= Math.min(W - 1, x1); sx++) {
      const d = PS.ray(sx, sy), t = (f.x - CAM.x) / d[0]; if (!(t > 0)) continue;
      const y = CAM.y + d[1] * t, z = CAM.z + d[2] * t, lz = z - zc, ly = y - f.y - Math.abs(step);
      const part = silhouette(lz, ly, f.hgt, 0.19); if (!part) continue;
      const lit = f.s < 0 ? 0.15 : 0;
      put(out, depth, sx, sy, t - 0.01, part === 2 ? 'hair' : f.coat, (part === 2 ? 0.3 : 0.22 + 0.25 * (ly / f.hgt)) + lit, 0);
    }
  }
  // a shopper on the steps: facing the camera's direction (plane z = const), legless silhouette, outline, bag
  // riders come DOWN the belt toward the camera, so they face us: a front, a face with no dot eyes (brow and nose shadow only), legs, shoes
  function drawShopper(out, depth, sh, ids) {
    const zc = sh.z, yb = sh.y, top = PS.project(sh.x, yb + 1.75, zc), bot = PS.project(sh.x, yb, zc); if (bot[2] <= 0.12) return;
    const ppu = PS.ppu(bot[2]), x0 = Math.floor(bot[0] - 0.55 * ppu), x1 = Math.ceil(bot[0] + 0.55 * ppu), y0 = Math.floor(top[1]) - 2, y1 = Math.ceil(bot[1]) + 2;
    const st = sh.style || {}, hem = st.hem ?? 0.3, look = (sh.look || 0) * 0.016, hairR = st.hair || 'hair', hairLen = st.hairLen || 'short', legR = st.legs || 'ink', scarfR = st.scarf || 'trim', far = ppu < 40;
    const pix = [];
    // half-width of the coat at height ly (shoulders round off; long coats flare a little to the hem)
    const coatW = (ly) => ly > 1.36 ? 0.2 * Math.sqrt(Math.max(0, 1 - ((ly - 1.36) / 0.11) ** 2)) : ly > 1.0 ? 0.17 + 0.03 * (ly - 1.0) / 0.36 : 0.17 + 0.03 * (1.0 - ly) / 0.75;
    for (let sy = Math.max(0, y0); sy <= Math.min(H - 1, y1); sy++) for (let sx = Math.max(0, x0); sx <= Math.min(W - 1, x1); sx++) {
      const d = PS.ray(sx, sy), t = (zc - CAM.z) / d[2]; if (!(t > 0)) continue;
      const x = CAM.x + d[0] * t, y = CAM.y + d[1] * t, lx = x - sh.x, ly = y - yb; if (ly < 0 || ly > 1.74) continue;
      let r = null, L = 0, id = sh.id; const lit = (lx + 0.2) / 0.4; // light from the upper right
      if (sh.bag) { const s2 = sh.bag.side, u = lx * s2;                                                    // a bag held at the side, in front of the coat's edge
        if (u > 0.1 && u < 0.32 && ly > 0.3 && ly < 0.6) { const uu = (u - 0.1) / 0.22, v = (ly - 0.3) / 0.3, mark = uu > 0.22 && uu < 0.78 && v > 0.35 && v < 0.62; r = mark ? sh.bag.ink : 'trim'; L = mark ? 0.5 : 0.5 + 0.35 * (s2 > 0 ? uu : 1 - uu); id += 100; }
        else if (ly >= 0.6 && ly < 0.7 && Math.abs(Math.hypot((u - 0.21) / 0.06, (ly - 0.6) / 0.1) - 1) < 0.22) { r = 'ink'; L = 0.35; id += 100; } }
      const hx = lx - look * 0.4, hy = ly - 1.6, inHead = (hx / 0.085) ** 2 + (hy / 0.115) ** 2 < 1;
      if (r) {}
      else if (inHead) {
        const fringe = hairLen !== 'bald' && hy > 0.04 - 0.035 * (hx / 0.085) ** 2, sides = hairLen !== 'bald' && Math.abs(hx) > 0.068 && hy > -0.03;
        if (fringe || sides) { r = hairR; L = 0.3 + 0.45 * Math.max(0, hx / 0.085) + (hy > 0.08 && hx > 0.01 ? 0.15 : 0); }
        else { r = sh.skin; const fx = hx - look; L = 0.42 + 0.3 * Math.max(0, Math.min(1, (hx + 0.085) / 0.17)) + (hairLen === 'bald' && hy > 0.07 && hx > 0 ? 0.2 : 0);
          if (!far) {
            if (Math.abs(hy - 0.012) < 0.01 && Math.abs(fx) < 0.058 && Math.abs(fx) > 0.008) L -= 0.3;   // brow and socket shadow
            if (fx > -0.014 && fx < -0.003 && hy > -0.04 && hy < 0.0) L -= 0.28;                          // shadow side of the nose
            if (Math.abs(fx) < 0.022 && Math.abs(hy + 0.058) < 0.007) L -= 0.26;                          // mouth
            if (hy < -0.092) L -= 0.1; } } }                                                              // under the chin
      else if (hairLen === 'long' && Math.abs(lx) < 0.11 && Math.abs(lx) > 0.055 && ly > 1.38 && ly < 1.6) { r = hairR; L = 0.25 + 0.35 * Math.max(0, lx / 0.11); }
      else if (Math.abs(lx) < 0.04 && ly > 1.42 && ly < 1.5) { r = sh.skin; L = 0.28; }                    // neck, in the chin's shadow
      else if (ly >= 0.08 && ly <= 1.46 && Math.abs(lx) < coatW(ly) && (ly >= hem || (ly > 0.66 && Math.abs(lx) > coatW(ly) - 0.06))) {
        const w = coatW(ly), side = Math.abs(lx) / w, armIn = w - 0.06;
        r = sh.coat; L = 0.25 + 0.45 * lit + 0.08 * (ly / 1.45);
        const handY = ly > 0.66 && ly < 0.76 && Math.abs(lx) > armIn + 0.004 && Math.abs(lx) < w - 0.004;
        if (handY && !(sh.bag && lx * sh.bag.side > 0 && ly > 0.74)) { r = sh.skin; L = 0.35 + 0.3 * (lx > 0 ? 1 : 0); }
        else if (ly < 0.76 && Math.abs(lx) > armIn) { r = null; }                                             // below the hands the coat narrows to the skirt
        else {
          if (!far && Math.abs(Math.abs(lx) - armIn) < 0.007 && ly > 0.78 && ly < 1.3) L -= 0.13;            // inner sleeve seam
          if (ly > 1.18 && ly < 1.4) { const v = (ly - 1.18) * 0.5;                                          // the V of the lapels, scarf or shirt inside
            if (Math.abs(lx) < v - 0.012) { if (ly < 1.27) { r = 'trim'; L = 0.55 + 0.3 * lit; } else { r = scarfR; L = 0.42 + 0.3 * lit + (Math.abs(lx) < 0.01 ? -0.12 : 0); } } else if (Math.abs(lx) < v) L -= 0.24; else if (Math.abs(lx) < v + 0.012) L += lx > 0 ? 0.2 : 0.04; }
          if (!far && Math.abs(lx + 0.004) < 0.005 && ly < 1.2) L -= 0.14;                                    // the front edge where the coat closes
          if (!far && Math.abs(lx - 0.022) < 0.009 && ly > 0.62 && ly < 1.16 && fr((ly - 0.62) / 0.16) < 0.09) L += 0.22; // buttons
          if (!far && Math.abs(ly - 0.86) < 0.006 && Math.abs(lx) > 0.05 && Math.abs(lx) < armIn - 0.01) L -= 0.15;       // pocket flaps
          if (st.belt && Math.abs(ly - 0.98) < 0.012 && Math.abs(lx) < armIn) L -= 0.18;
          if (ly < hem + 0.02) L -= 0.12; } }                                                                 // hem shadow
      if (!r && ly >= 0.06 && ly < hem + 0.02) { const k = 1 - ly / Math.max(0.3, hem + 0.02), gap = 0.006 + 0.012 * k, out2 = 0.15 - 0.02 * k; // two legs
        if (Math.abs(lx) > gap && Math.abs(lx) < out2) { r = legR; L = 0.25 + 0.35 * lit + (lx > 0 && Math.abs(lx) > out2 - 0.03 ? 0.12 : 0); } }
      if (!r && ly < 0.08) { const fx = Math.abs(lx); if (fx > 0.008 && fx < 0.13 && ((fx - 0.068) / 0.06) ** 2 + ((ly - 0.035) / 0.05) ** 2 < 1) { r = 'ink'; L = 0.15 + (ly > 0.05 && lx > 0 ? 0.35 : 0); } } // shoes, toes to us
      if (!r) continue;
      if (t >= depth[sy * W + sx]) continue;
      pix.push(sy * W + sx, t, r, L, id);
    }
    const fz = STAGE.riderFadeZ ?? 0.5, fade = Math.max(clamp((fz - zc) / 0.14, 0, 1), sh.fin || 0); if (fade >= 1) return;
    // outline: a pixel whose 4-neighbour isn't the same object takes its ramp's darkest step
    const own = new Map(); for (let i = 0; i < pix.length; i += 5) own.set(pix[i], pix[i + 4]);
    for (let i = 0; i < pix.length; i += 5) { const k = pix[i], id = pix[i + 4], sx = k % W, sy = (k / W) | 0;
      const edge = own.get(k - 1) !== id || own.get(k + 1) !== id || own.get(k - W) !== id || own.get(k + W) !== id;
      if (fade > 0 && bay(sx, sy) < fade) continue; // near the camera a rider dissolves through the Bayer threshold instead of filling the frame
      if (hazeAt(pix[i + 1], sx, sy)) { depth[k] = pix[i + 1]; writeRGB(out, k, 'haze', STAGE.light.haze, sx, sy, 0); continue; }
      depth[k] = pix[i + 1]; if (edge) { const c = RGB[RID[pix[i + 2]]][0]; out[k * 4] = c[0]; out[k * 4 + 1] = c[1]; out[k * 4 + 2] = c[2]; } else writeRGB(out, k, pix[i + 2], pix[i + 3] * STAGE.light.k, sx, sy, 0); }
  }

  // plants: leaves drawn as filled polygons in screen space (Desktop Bo jungle.js leaf() idea), depth-tested; sway ≤ ~1 px at the tip
  function leafPoly(x, y, len, wid, ang) { const pts = [], n = 10, c = Math.cos(ang), s = Math.sin(ang);
    for (let i = 0; i <= n; i++) { const t = i / n, w = wid * Math.pow(Math.sin(Math.PI * t), 0.75); pts.push([t * len, -w]); }
    for (let i = n; i >= 0; i--) { const t = i / n, w = wid * Math.pow(Math.sin(Math.PI * t), 0.75); pts.push([t * len, w]); }
    return pts.map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]); }
  function fillPolyDepth(out, depth, pts, t, fn) {
    let y0 = Infinity, y1 = -Infinity; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) { const sy = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; if ((p[1] <= sy && q[1] > sy) || (q[1] <= sy && p[1] > sy)) xs.push(p[0] + ((sy - p[1]) / (q[1] - p[1])) * (q[0] - p[0])); }
      xs.sort((a, b) => a - b); for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.max(0, Math.round(xs[i])); x < Math.min(W, Math.round(xs[i + 1])); x++) { const c = fn(x, y); if (c) put(out, depth, x, y, t, c[0], c[1], 0); } }
  }
  function plantKey(p, time, reduced) { const base = PS.project(p.x, p.y, p.z); if (base[2] <= 0.2 || base[2] > 12) return null; let k = ''; const n = p.kind === 'palm' ? 9 : p.kind === 'tree' ? 200 : 22;
    for (let i = 0; i < n; i++) { const ph = i * 1.7 + p.seed, P1 = [11, 13, 17, 19, 23][Math.floor(hash(i, p.seed + 7) * 5)], P2 = [5, 7][Math.floor(hash(i, p.seed + 8) * 2)]; k += reduced ? 0 : Math.round(Math.sin(time * 2 * Math.PI / P1 + ph) + 0.4 * Math.sin(time * 2 * Math.PI / P2 + 2 * ph)); }
    if (!reduced) for (let j = 0; j < 5; j++) k += '|' + Math.round(Math.sin(time * 2 * Math.PI / [13, 17, 19][j % 3] + j * 2.1 + p.seed) * 4); return k; }
  function drawTree(out, depth, p, time, reduced, mode) {
    const TH = p.th || 5.6, CR = p.cr || 1, cy = p.y + TH, cz = p.z, cx = p.x, c = PS.project(cx, cy, cz); if (c[2] <= 0.3) return; if (mode === 'live' && c[2] > 14) return; if (mode === 'static' && c[2] <= 14) return;
    const ppu = PS.ppu(c[2]), lit = p.s < 0 ? 0.12 : 0;
    // trunk and a few limbs (walnut), the crown kept outside the escalator's glass (|x| > 0.72)
    const trunk = (x0, y0, x1, y1, w) => { const a = PS.project(x0, y0, cz), b = PS.project(x1, y1, cz); if (a[2] < 0.3) return; const wa = w * PS.ppu(a[2]), wb = w * 0.6 * PS.ppu(b[2]);
      fillPolyDepth(out, depth, [[a[0] - wa, a[1]], [a[0] + wa, a[1]], [b[0] + wb, b[1]], [b[0] - wb, b[1]]], c[2] + 0.2, (x) => ['walnut', 0.25 + lit + (x > (a[0] + b[0]) / 2 ? 0.25 : 0)]); };
    trunk(cx, p.y, cx, cy - 0.3 * CR, 0.12); trunk(cx, cy - 1.4 * CR, cx + 0.45 * CR * p.s, cy + 0.2 * CR, 0.05); trunk(cx, cy - 1.0 * CR, cx - 0.35 * CR * p.s, cy + 0.3 * CR, 0.05); trunk(cx, cy - 2.2 * CR, cx + 0.6 * CR * p.s, cy - 0.9 * CR, 0.05);
    const n = Math.round(200 * Math.min(2.2, CR * CR * 0.8));
    for (let i = 0; i < n; i++) {
      const a = hash(i, p.seed), b = hash(i, p.seed + 1), r3 = Math.cbrt(hash(i, p.seed + 2)), th = a * 2 * Math.PI, ph = Math.acos(2 * b - 1);
      let lx = cx + Math.sin(ph) * Math.cos(th) * 0.62 * CR * r3, ly = cy + Math.cos(ph) * 0.8 * CR * r3, lz = cz + Math.sin(ph) * Math.sin(th) * 0.6 * CR * r3;
      if (Math.abs(lx) < 0.72) lx = Math.sign(lx || p.s) * 0.72;
      const q = PS.project(lx, ly, lz); if (q[2] < 0.3) continue; const pp = PS.ppu(q[2]);
      const P1 = [11, 13, 17, 19, 23][Math.floor(hash(i, p.seed + 7) * 5)], P2 = [5, 7][Math.floor(hash(i, p.seed + 8) * 2)], phs = i * 1.7 + p.seed;
      const wob = (reduced || q[2] > 14) ? 0 : Math.round((Math.sin(time * 2 * Math.PI / P1 + phs) + 0.4 * Math.sin(time * 2 * Math.PI / P2 + 2 * phs)) * Math.max(0, (ly - cy + 1) / 2));
      const len = 0.13 * pp, wid = 0.058 * pp, ang = -Math.PI / 2 + (hash(i, p.seed + 5) - 0.5) * 2.4;
      const pts = leafPoly(q[0] + wob, q[1], len, wid, ang), sun = (lx - cx) * 0.6 + (ly - cy) * 0.5;      // light from the upper right
      const inner = 1 - r3;  // inner leaves sit in the crown's shade
      fillPolyDepth(out, depth, pts, q[2], () => ['jade', 0.1 + 0.36 * Math.max(0, Math.min(1, 0.5 + sun)) + 0.1 * hash(i, 9) - 0.12 * inner + lit]);
    }
  }
  function drawPlant(out, depth, p, time, reduced, mode) {
    if (p.kind === 'tree') return drawTree(out, depth, p, time, reduced, mode);
    const base = PS.project(p.x, p.y, p.z); if (base[2] <= 0.2) return; if (mode === 'live' && base[2] > 12) return; if (mode === 'static' && base[2] <= 12) return; const ppu = PS.ppu(base[2]); if (ppu < 6) return;
    if (base[0] < -1.2 * ppu || base[0] > W + 1.2 * ppu || base[1] < 0 || base[1] - 1.6 * ppu > H) return; // off stage
    const t = base[2] * 1.0;
    // pot: brass planter box
    const pw = 0.24 * ppu, ph = 0.36 * ppu, lit = p.s < 0 ? 0.18 : 0;
    fillPolyDepth(out, depth, [[base[0] - pw, base[1] - ph], [base[0] + pw, base[1] - ph], [base[0] + pw * 0.85, base[1]], [base[0] - pw * 0.85, base[1]]], t, (x, y) => ['brass', 0.35 + lit + 0.35 * ((x - base[0] + pw) / (2 * pw)) + (y < base[1] - ph + 2 ? 0.25 : 0)]);
    // trailing philodendron over the slab lip (research rule 4), pinned at the top, 1 px sway growing as u^1.6 down the strand (Desktop Bo curtain recipe)
    if (ppu > 14 && p.y <= G.TOPLVL * G.LEVEL - 0.1) { const xs = p.s * (SX(Math.round(p.y / G.LEVEL)) - 0.04), nS = 5;
      for (let j = 0; j < nS; j++) { const zj = p.z + (j - 2) * 0.09 + 0.03 * hash(j, p.seed), len = 0.6 + 0.55 * hash(j, p.seed + 11), M = Math.max(4, Math.round(len / 0.07));
        const sw = reduced ? 0 : Math.sin(time * 2 * Math.PI / [13, 17, 19][j % 3] + j * 2.1 + p.seed) * 1.0;
        for (let m = 0; m <= M; m++) { const u = m / M, yy = p.y + 0.02 - u * len, q = PS.project(xs, yy, zj); if (q[2] <= 0.3) continue; const off = Math.round(sw * Math.pow(u, 1.6)), r = Math.max(1, 0.035 * PS.ppu(q[2]));
          const cx = Math.round(q[0]) + off + (m % 2 ? 1 : -1) * Math.round(r * 0.6), cy = Math.round(q[1]);
          fillPolyDepth(out, depth, [[cx, cy - r], [cx + r, cy], [cx, cy + r * 1.2], [cx - r, cy]], q[2] - 0.05, (x, y) => ['jade', 0.3 + 0.25 * hash(j, m) + (x > cx ? 0.18 : 0) + lit]); } } }
    // spathiphyllum: a few white spathes at the planter lip (1-2 px)
    if (ppu > 20) for (let j = 0; j < 4; j++) { const q = PS.project(p.x + p.s * -0.12 + 0.05 * (j - 1.5) * p.s, p.y + 0.4, p.z - 0.12 + 0.08 * j); put(out, depth, Math.round(q[0]), Math.round(q[1]), q[2] - 0.06, 'trim', 0.95, 0); put(out, depth, Math.round(q[0]), Math.round(q[1]) + 1, q[2] - 0.06, 'trim', 0.8, 0); }
    const top = [base[0], base[1] - ph], n = p.kind === 'palm' ? 9 : 22;
    if (p.kind === 'ficus') { // trunk and branches first (walnut), so leaves overlap them
      const th = 0.9 * p.h * ppu; for (let j = 0; j < 3; j++) { const bx = top[0] + (j - 1) * 0.05 * ppu, ex = top[0] + (j - 1) * 0.22 * ppu, ey = top[1] - th * (0.75 + 0.15 * j % 2);
        const pts = [[bx - 1, top[1]], [bx + 1, top[1]], [ex + 0.5, ey], [ex - 0.5, ey]]; fillPolyDepth(out, depth, pts, t + 0.01, (x, y) => ['walnut', 0.3 + lit + (x > (bx + ex) / 2 ? 0.2 : 0)]); } }
    for (let i = 0; i < n; i++) {
      const a0 = hash(i, p.seed), ph = i * 1.7 + p.seed, P1 = [11, 13, 17, 19, 23][Math.floor(hash(i, p.seed + 7) * 5)], P2 = [5, 7][Math.floor(hash(i, p.seed + 8) * 2)];
      const wob = (reduced || base[2] > 12) ? 0 : Math.round(Math.sin(time * 2 * Math.PI / P1 + ph) + 0.4 * Math.sin(time * 2 * Math.PI / P2 + 2 * ph)); // research rule 3: tips at -1/0/+1 px, root still, near plants only
      if (p.kind === 'palm') { const len = (0.7 + 0.35 * a0) * p.h * ppu, ang = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32 + (a0 - 0.5) * 0.15 + wob * 1.1 / Math.max(8, len), wid = 0.07 * ppu;
        const pts = leafPoly(top[0], top[1] - 0.25 * ppu * p.h, len, wid, ang);
        const ca = Math.cos(ang), sa = Math.sin(ang), oy = top[1] - 0.25 * ppu * p.h;
        fillPolyDepth(out, depth, pts, t - 0.02 * i, (x, y) => { const u = ((x - top[0]) * ca + (y - oy) * sa) / len, v = (-(x - top[0]) * sa + (y - oy) * ca) / wid;
          if (Math.abs(v) < 0.12 && u > 0.05) return ['jade', 0.15 + 0.2 * u + lit];                       // midrib
          const pinna = fr(u * 9) < 0.18 && Math.abs(v) > 0.25;                                              // frond divisions
          return ['jade', 0.28 + 0.4 * u + (v < 0 ? 0.14 : -0.04) - (pinna ? 0.18 : 0) + lit]; });
      } else { const ang = -Math.PI / 2 + (a0 - 0.5) * 2.4, rr = (0.15 + 0.45 * hash(i, p.seed + 3)) * p.h * ppu, cx = top[0] + Math.cos(ang) * rr * 0.75 + wob * 0.9, cy = top[1] - 0.72 * ppu * p.h + Math.sin(ang) * rr * 0.55;
        const pts = leafPoly(cx, cy, 0.17 * ppu, 0.05 * ppu, ang + 1.2 * (hash(i, p.seed + 5) - 0.5));
        const la = ang + 1.2 * (hash(i, p.seed + 5) - 0.5), lc = Math.cos(la), ls = Math.sin(la), L0 = 0.17 * ppu, Wd = 0.05 * ppu;
        fillPolyDepth(out, depth, pts, t - 0.02 * i, (x, y) => { const u = ((x - cx) * lc + (y - cy) * ls) / L0, v = (-(x - cx) * ls + (y - cy) * lc) / Wd;
          if (Math.abs(v) < 0.15 && u > 0.1 && u < 0.9) return ['jade', 0.2 + 0.25 * hash(i, 9) + lit];
          return ['jade', 0.3 + 0.32 * hash(i, 9) + 0.2 * u + (v < 0 ? 0.12 : -0.05) + lit]; });
      }
    }
  }

  // pendant globes on long cables down the middle of the void, and fabric banners from the vault ribs
  STAGE.spawnHangers = function () {
    W0.lamps = []; W0.banners = [];
    for (let i = 0; i < 9; i++) { const z = 4.0 + i * 5.4, x = (i % 2 ? 1 : -1) * (2.4 + 0.8 * hash(i, 3)); W0.lamps.push({ x, z, y: 8.2 + 1.6 * hash(i, 4), r: 0.34, seed: i }); }
    const BAN = [['teal', 'ochre'], ['plum', 'gold'], ['navy', 'pink'], ['moss', 'ochre']];
    for (let i = 0; i < 6; i++) { const z = 8.1 + i * 8.1, x = (i % 2 ? -1 : 1) * (3.2 + 0.5 * hash(i, 8)); W0.banners.push({ x, z, y0: G.VAULT_Y + 2.4, len: 4.4 + 0.8 * hash(i, 9), w: 1.0, c: BAN[i % 4], seed: i }); }
  };
  // the glass lift: a lit car on a steel mast in the far void, rising and falling (research MALL-US-06); clerks at counters (PX-1041-01)
  STAGE.spawnLift = function () { W0.lift = { x: -3.4, z: 19.0, w: 1.5, d: 1.5, h: 2.4, yMin: G.GROUND, yMax: 2 * G.LEVEL, period: 300, travel: 22 }; }; // rises and falls once every five minutes (rule 15)
  function liftY(time) { const L = W0.lift, c = time % L.period, a = L.travel / L.period, span = L.yMax - L.yMin;
    if (c < L.travel) return L.yMin + span * (0.5 - 0.5 * Math.cos(Math.PI * c / L.travel)); if (c < L.period / 2) return L.yMax; if (c < L.period / 2 + L.travel) return L.yMax - span * (0.5 - 0.5 * Math.cos(Math.PI * (c - L.period / 2) / L.travel)); return L.yMin; }
  function drawLift(out, depth, time, reduced) { const L = W0.lift; if (!L) return; const y = reduced ? L.yMin : liftY(time);
    // tower: four white posts, girts every 0.6 m, X bracing, bulbs along the front posts (J05); bulbs breathe in sections, never a fade (rule 13)
    const X0 = L.x - L.w / 2 - 0.06, X1 = L.x + L.w / 2 + 0.06, Zf = L.z - L.d / 2 - 0.06, Zb = L.z + L.d / 2 + 0.06, yb = -5.5, yt = G.VAULT_Y + 1.2;
    const seg = (x0, y0, z0, x1, y1, z1, r, Lv) => { const a = PS.project(x0, y0, z0), b = PS.project(x1, y1, z1); if (a[2] < 0.3 || b[2] < 0.3) return; const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))); for (let i = 0; i <= n; i++) { const u = i / Math.max(1, n); put(out, depth, Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), a[2] + (b[2] - a[2]) * u, r, Lv, 0); } };
    for (const [x, z] of [[X0, Zb], [X1, Zb], [X0, Zf], [X1, Zf]]) seg(x, yb, z, x, yt, z, 'trim', z === Zf ? (x === X1 ? 0.9 : 0.62) : 0.5);
    for (let yy = yb; yy < yt; yy += 0.6) { seg(X0, yy, Zf, X1, yy, Zf, 'trim', 0.75); seg(X0, yy, Zf, X1, yy + 0.6, Zf, 'trim', 0.55); seg(X1, yy, Zf, X1, yy, Zb, 'trim', 0.85); }
    for (const x of [X0, X1]) for (let yy = yb, i = 0; yy < yt; yy += 0.13, i++) { const q = PS.project(x, yy, Zf - 0.01); if (q[2] < 0.3) continue; const sec = Math.floor(yy / 1.3), on = reduced || ((Math.floor(time / 0.9) + sec) % 7 !== 0);
      put(out, depth, Math.round(q[0]), Math.round(q[1]), q[2] - 0.01, 'warm', on ? 0.99 : 0.6, 0); }
    // car: glass box with a lit interior, a steel frame and one rider
    const c0 = PS.project(L.x - L.w / 2, y, L.z), c1 = PS.project(L.x + L.w / 2, y + L.h, L.z); if (c0[2] < 0.3) return; const t = c0[2] - 0.05;
    for (let yy = Math.floor(c1[1]); yy <= Math.ceil(c0[1]); yy++) for (let xx = Math.floor(c0[0]); xx <= Math.ceil(c1[0]); xx++) { const u = (xx - c0[0]) / (c1[0] - c0[0]), v = (c0[1] - yy) / (c0[1] - c1[1]);
      const frame = u < 0.06 || u > 0.94 || v < 0.08 || v > 0.92; const rider = Math.abs(u - 0.62) < 0.1 && v > 0.1 && v < 0.75 || Math.hypot((u - 0.62) * 0.62, (v - 0.82) * 1.1) < 0.06;
      if (frame) put(out, depth, xx, yy, t, 'steel', 0.55 + (u > 0.94 ? -0.2 : 0.15), 0); else if (rider) put(out, depth, xx, yy, t - 0.01, 'coat2', 0.3, 0); else put(out, depth, xx, yy, t, 'warm', 0.55 + 0.3 * v, 0); } }
  function drawHangers(out, depth, time, reduced) {
    for (const L of W0.lamps || []) { const top = PS.project(L.x, G.VAULT_Y + 2, L.z), c = PS.project(L.x, L.y, L.z); if (c[2] < 0.3) continue;
      // cable: a 1-px line from the vault to the globe
      const y0 = Math.max(0, Math.floor(top[1])), y1 = Math.floor(c[1]); for (let y = y0; y < y1; y++) { const u = (y - top[1]) / (c[1] - top[1]), x = Math.round(top[0] + (c[0] - top[0]) * u); put(out, depth, x, y, c[2] + 0.01, 'rubber', 0.3 + 0.25 * Math.min(1, c[2] / 30), 0, true); }
      const rr = L.r * PS.ppu(c[2]); for (let y = Math.floor(c[1] - rr); y <= Math.ceil(c[1] + rr); y++) for (let x = Math.floor(c[0] - rr); x <= Math.ceil(c[0] + rr); x++) { const dx = (x - c[0]) / rr, dy = (y - c[1]) / rr, q = dx * dx + dy * dy; if (q > 1) continue;
        const glow = reduced ? 0 : 0.03 * Math.sin(time * 2 * Math.PI / 13 + L.seed * 2); put(out, depth, x, y, c[2], 'warm', 0.62 + 0.4 * (1 - q) + 0.18 * (dx - dy) * 0.5 + glow, 0); } }
    for (const b of W0.banners || []) { const n = 24; const sway = reduced ? 0 : 0.04 * Math.sin(time * 0.45 + b.seed * 1.9);
      for (let j = 0; j < n; j++) { const u0 = j / n, u1 = (j + 1) / n, y0 = b.y0 - b.len * u0, y1 = b.y0 - b.len * u1, dx0 = sway * u0 * u0, dx1 = sway * u1 * u1;
        const a = PS.project(b.x - b.w / 2 + dx0, y0, b.z), bq = PS.project(b.x + b.w / 2 + dx0, y0, b.z), c = PS.project(b.x + b.w / 2 + dx1, y1, b.z), d = PS.project(b.x - b.w / 2 + dx1, y1, b.z); if (a[2] < 0.3) continue;
        const band = Math.floor(u0 * 5) % 2, tail = u0 > 0.86; const pts = tail ? [[a[0], a[1]], [bq[0], bq[1]], [(c[0] + d[0]) / 2, c[1]]] : [[a[0], a[1]], [bq[0], bq[1]], [c[0], c[1]], [d[0], d[1]]];
        fillPolyDepth(out, depth, pts, a[2], (x, y) => [b.c[band], 0.42 + 0.3 * ((x - a[0]) / Math.max(1, bq[0] - a[0])) + (u0 < 0.04 ? 0.3 : 0)]); } }
  }

  // ── per-frame render ──
  const out = new Uint8ClampedArray(N * 4), depth = new Float32Array(N), glow = new Uint32Array(N); STAGE.glowMark = 1;
  STAGE.EMIT = new Uint8Array(8); STAGE.EMIT[TAG.LAMP] = 255; STAGE.EMIT[TAG.SIGN] = 210; STAGE.EMIT[TAG.GLINT] = 150; STAGE.EMIT[TAG.INTERIOR] = 70; STAGE.EMIT[TAG.SKY] = 50;
  STAGE.out = out; STAGE.depth = depth;
  STAGE.frame = function (ctx, st) {
    // st: { phase, time, hour, weather, reduced, boDraw(cb) }
    const time = st.time, fp = fr(st.phase), reduced = !!st.reduced; STAGE.glowMark++;
    out.set(B.base); depth.set(B.t);
    const P = STAGE.prof = {}; let pt = performance.now(); const mark = (n) => { const q = performance.now(); P[n] = +(q - pt).toFixed(1); pt = q; };
    // sky (throttled by caller via st.skyNow)
    if (window.SKY && st.skyNow) { const res = SKY.paint(out, B.skyList, B.skyDirs, B.skyPane, time, { hour: st.hour, weather: st.weather, wind: st.wind || 0.3, reduced });
      STAGE.skyState = res; for (let i = 0; i < B.skyList.length; i++) { const k = B.skyList[i]; STAGE.skyCache[i * 3] = out[k * 4]; STAGE.skyCache[i * 3 + 1] = out[k * 4 + 1]; STAGE.skyCache[i * 3 + 2] = out[k * 4 + 2]; } }
    else if (STAGE.skyCache && STAGE.skyCacheValid) { for (let i = 0; i < B.skyList.length; i++) { const k = B.skyList[i]; out[k * 4] = STAGE.skyCache[i * 3]; out[k * 4 + 1] = STAGE.skyCache[i * 3 + 1]; out[k * 4 + 2] = STAGE.skyCache[i * 3 + 2]; } }
    if (st.skyNow && window.SKY) STAGE.skyCacheValid = true;
    mark('sky');
    // the steps
    const cand = B.stairCand;
    // steps: cached per quantized belt phase (48 per step), rebuilt when the light is rebaked
    const Q = 48, qi = Math.floor(fp * Q) % Q, fpq = qi / Q, nC = cand.length;
    if (!STAGE.stairCache || STAGE.stairCache.ver !== STAGE.lightSig) STAGE.stairCache = { ver: STAGE.lightSig, e: new Array(Q) };
    let e = STAGE.stairCache.e[qi] || (STAGE.stairCache.e[qi] = stairEntry(qi, Q));
    for (let i = 0; i < nC; i++) { const tt = e.t[i]; if (tt >= 1e9) continue; const k = cand[i]; depth[k] = tt; out[k * 4] = e.rgb[i * 3]; out[k * 4 + 1] = e.rgb[i * 3 + 1]; out[k * 4 + 2] = e.rgb[i * 3 + 2]; }
    mark('stairs');
    // handrail highlight travels with the belt; signs breathe; lamps and glints shimmer (rarely, quietly)
    for (let k = 0; k < N; k++) { const tag = B.tag[k]; if (tag < 2 || tag === TAG.INTERIOR) continue; if (depth[k] < B.t[k]) continue; const sx = k % W, sy = (k / W) | 0; if (hazeAt(B.t[k], sx, sy)) continue;
      const r = PS.RAMPS[B.rid[k]];
      if (tag === TAG.RAIL) { const run = fr((B.wz[k] - st.phase * G.RUN) / 3.1) < 0.05; if (run) writeRGB(out, k, r, B.L[k] + 0.3, sx, sy, 0); }
      else if (tag === TAG.SIGN) { if (reduced) continue; const a = B.aux[k], PER = [7, 11, 13, 17, 19], br = Math.sin(time * 2 * Math.PI / PER[Math.floor(hash(a, 1) * 5)] + 6 * hash(a, 2)); /* coprime periods so the hall never visibly repeats (research PX-TOYOI-01) */ const flick = hash(a, Math.floor(time * 12)) > 0.997 && hash(a, 3) > 0.8; writeRGB(out, k, r, B.L[k] + 0.06 * br - (flick ? 0.35 : 0), sx, sy, 0); }
      else if (tag === TAG.GLINT) { if (reduced) continue; const a = B.aux[k], f = Math.sin(time * 2 * Math.PI / (0.7 + 1.6 * hash(a, 4)) + 9 * hash(a, 5)); writeRGB(out, k, r, B.L[k] + 0.07 * f, sx, sy, 0); }
      else if (tag === TAG.LAMP) { if (reduced) continue; const a = B.aux[k]; const bad = hash(a, 77) > 0.985; if (bad && hash(a, Math.floor(time * 9)) > 0.6) writeRGB(out, k, r, B.L[k] - 0.4, sx, sy, 0); }
    }
    mark('tags');
    // figures deep in the stores and on the balconies (occasional)
    if (!reduced) { let movers = 0; for (const f of W0.figures) { const c = (time + f.phase) % f.period; if (c > f.dur) continue; const dir = hash(f.z0 * 7, 3) > 0.5 ? 1 : -1;
      let zc, moving = true;
      if (f.kind === 'store') { const zs = f.z0 + (f.z1 - f.z0) * (0.35 + 0.3 * hash(f.z0, 9)); if (c < f.tin) zc = (dir > 0 ? f.z0 : f.z1) + (zs - (dir > 0 ? f.z0 : f.z1)) * (c / f.tin); else if (c < f.tin + f.tstop) { zc = zs; moving = false; } else zc = zs + ((dir > 0 ? f.z1 : f.z0) - zs) * ((c - f.tin - f.tstop) / f.tout); }
      else if (f.kind === 'clerk') { zc = f.z0; moving = false; }
      else { const u = c / f.dur; zc = dir > 0 ? f.z0 + (f.z1 - f.z0) * u : f.z1 - (f.z1 - f.z0) * u; }
      if (moving && f.kind !== 'clerk') { if (movers >= 6) continue; movers++; }
      const tt = PS.ppu(Math.max(0.5, zc - CAM.z)) * f.hgt < 26 ? Math.floor(time * 4) / 4 : time; // small far figures step at 4 fps (rule 6)
      drawFigureX(out, depth, f, zc, moving ? tt : 0); } }
    mark('figures');
    for (const p of W0.plants) { // near plants: re-rasterize only when a leaf tip has moved a whole pixel; otherwise replay last frame's pixels
      const key = plantKey(p, time, reduced); if (key === null) continue;
      if (p._key === key && p._ver === STAGE.bakeVer && p._pix) { const a = p._pix; for (let i = 0; i < a.length; i += 5) { const k = a[i]; if (a[i + 1] >= depth[k]) continue; depth[k] = a[i + 1]; out[k * 4] = a[i + 2]; out[k * 4 + 1] = a[i + 3]; out[k * 4 + 2] = a[i + 4]; } continue; }
      CAP = []; drawPlant(out, depth, p, time, reduced, 'live'); p._pix = CAP; CAP = null; p._key = key; p._ver = STAGE.bakeVer; }
    drawHangers(out, depth, time, reduced);
    drawLift(out, depth, time, reduced);
    mark('plants');
    // shoppers far → near, then Bo (by depth), then the rest
    const boS = st.bo ? st.bo.state() : null, boDepth = boS ? boS.depth : 0;
    const shs = W0.shoppers.slice().sort((a, b) => b.z - a.z);
    for (const sh of shs) if (!boS || PS.project(sh.x, sh.y, sh.z)[2] > boDepth) drawShopper(out, depth, sh);
    if (boS) st.boComposite(out, depth);
    for (const sh of shs) if (boS && PS.project(sh.x, sh.y, sh.z)[2] <= boDepth) drawShopper(out, depth, sh);
    mark('shoppers+bo');
    // dust turning in the sun column
    if (!reduced && STAGE.light.shaft > 0.2) for (const m of W0.dust) { const x = m.x + 0.15 * Math.sin(time * m.w + m.p), y = m.y + ((time * m.v + m.p) % 6) - 3, z = m.z + 0.15 * Math.cos(time * m.w * 0.7 + m.p);
      const q = PS.project(x, y, z); const sx = Math.round(q[0]), sy = Math.round(q[1]); if (q[2] < 0.3 || sx < 0 || sy < 0 || sx >= W || sy >= H) continue; const k = sy * W + sx; if (q[2] >= depth[k]) continue;
      if (!sunlit(x, y, z) || fr(time / 6.6 + m.p) > 0.75) continue; const c = (hash(m.p * 100, 1) > 0.5) ? RGB[RID.trim][4] : RGB[RID.trim][3]; out[k * 4] = c[0]; out[k * 4 + 1] = c[1]; out[k * 4 + 2] = c[2]; }
    mark('dust');
    // time of day lives in the sky, the bake (hall dimmed inside its ramps, lights stepped up) and Bo's own ramps: no overlay, every pixel stays a ramp step
    // emissive weight per pixel rides in the alpha channel for the atmosphere pass (lamps, neon, lit stores, glints, the sky)
    if (st.post) { const mk = STAGE.glowMark, EM = STAGE.EMIT; for (let k = 0; k < N; k++) { let e = 0; if (glow[k] === mk) e = 255; else if (depth[k] >= B.t[k] - 1e-4) e = EM[B.tag[k]]; out[k * 4 + 3] = e; }
      st.post(out, depth); mark('emit'); return; }
    const img = STAGE.img || (STAGE.img = ctx.createImageData(W, H)); img.data.set(out); ctx.putImageData(img, 0, 0);
  };
  function stairEntry(qi, Q) { const cand = B.stairCand, nC = cand.length, fpq = qi / Q;
    const e = { rgb: new Uint8Array(nC * 3), t: new Float32Array(nC) }; const dd = [0, 0, 0];
      for (let i = 0; i < nC; i++) { const k = cand[i], sx = k % W, sy = (k / W) | 0; dd[0] = B.rx[k]; dd[1] = B.ry[k]; dd[2] = B.rz[k];
        const t = stairHit(dd, fpq, B.t[k], B.k0[k] > -999 ? B.k0[k] : null); if (t >= B.t[k]) { e.t[i] = 1e9; continue; }
        const pnt = paintStair(hitOut[0], hitOut[1], hitOut[2], hitOut[3], hitOut[4], fpq, sx, sy, t);
        const lit = (STAGE.light.shaft > 0.05 && sunlit(hitOut[0], hitOut[1], hitOut[2])) ? 1 : 0;
        e.t[i] = t; const tmp = [0, 0, 0, 0];
        if (hazeAt(t, sx, sy)) writeRGB(tmp, 0, 'haze', STAGE.light.haze, sx, sy, 0); else writeRGB(tmp, 0, pnt[0], pnt[1] * STAGE.light.k, sx, sy, lit + (B.shaftCol[k] * STAGE.light.shaft > 0.12 + bay(sx + 3, sy + 2) * 0.9 ? 1 : 0));
        e.rgb[i * 3] = tmp[0]; e.rgb[i * 3 + 1] = tmp[1]; e.rgb[i * 3 + 2] = tmp[2]; }
      return e; }
  STAGE.warmStairs = function (Q = 48) { if (!STAGE.stairCache || STAGE.stairCache.ver !== STAGE.lightSig) STAGE.stairCache = { ver: STAGE.lightSig, e: new Array(Q) }; for (let q = 0; q < Q; q++) if (!STAGE.stairCache.e[q]) STAGE.stairCache.e[q] = stairEntry(q, Q); };
  STAGE.seedDust = function (n = 170) { W0.dust.length = 0; for (let i = 0; i < n; i++) W0.dust.push({ x: -5 + 10 * hash(i, 1), y: 0.5 + 13 * hash(i, 2), z: 2 + 30 * hash(i, 3), w: 0.05 + 0.08 * hash(i, 4), v: 6 / (94 + 236 * hash(i, 5)), p: 10 * hash(i, 6) }); }; // one pass 94-330 s (rule 15)
  STAGE.skyCache = null;
  STAGE.prepSkyCache = function () { STAGE.skyCache = new Uint8ClampedArray(B.skyList.length * 3); STAGE.skyCacheValid = false; };
  STAGE.setHour = function (h, ambient) {
    const ease = (a, b) => clamp((h - a) / (b - a), 0, 1);
    const night = Math.max(1 - ease(5.0, 6.5), ease(20.0, 21.5)), dawn = ease(5.0, 6.0) * (1 - ease(7.5, 8.5)), dusk = ease(17.0, 18.0) * (1 - ease(20.0, 21.0));
    STAGE.nightAmt = night; STAGE.duskAmt = dusk; STAGE.dawnAmt = dawn; STAGE.tint = null;
  };
  STAGE.sunlit = sunlit; STAGE.STORES = STORES;
})();
