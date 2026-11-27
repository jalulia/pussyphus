// app.js — runs the stage, Bo, the sky and Mall FM, and wires the panels.
(function () {
  const $ = (id) => document.getElementById(id);
  // the mouth step, lightened in Desktop Bo on 2026-11-27 (95296a5); set here too in case an older engine copy is loaded
  if (window.BZ && BZ.RAMPS && BZ.RAMPS.pink) { BZ.RAMPS.pink[0] = '#8a4458'; }
  const cv = $('stage'), qp = new URLSearchParams(location.search);
  const usePost = !!(window.POST && qp.get('post') !== '0' && POST.init(cv)); // the atmosphere pass needs WebGL2; without it the stage draws plain
  const ctx = usePost ? null : cv.getContext('2d');
  const q = new URLSearchParams(location.search);
  const mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const S = { lens: +(new URLSearchParams(location.search).get('lens') ?? 1), phase: 0, time: 0, hour: +(q.get('hour') ?? 10.5), weather: q.get('weather') || 'clear', reduced: q.get('reduced') === '1' || !!(mq && mq.matches), beltSpeed: 0.5, auto: q.get('auto') === '1', wind: 0.3 };
  const font = new FontFace('BoPixel', 'url(' + BZ.FONT_URI + ')'); font.load().then(f => document.fonts.add(f)).catch(() => {});

  // below 480 px, prefer a whole number of device pixels per stage pixel when that keeps the stage at least 3/4 of the width
  function fitStage() { const avail = cv.parentElement.clientWidth, dpr = window.devicePixelRatio || 1; if (avail >= PS.W) { cv.style.width = ''; return; }
    const k = Math.floor(dpr * avail / PS.W), w = k * PS.W / dpr; cv.style.width = k >= 1 && w >= 0.75 * avail ? w + 'px' : ''; cv.style.margin = '0 auto'; }
  addEventListener('resize', fitStage); fitStage();
  // build the caches after first paint so the loading line shows
  requestAnimationFrame(() => setTimeout(boot, 30));
  let bo, boCv, bg;
  function boot() {
    window.__info = STAGE.init({ shaft: 0.75, ambient: 1 }); STAGE.prepSkyCache(); if (window.SKY) { SKY.GRID = { w: PS.G.VAULT_R * Math.PI / 21, d: PS.G.RIB, ox: 0.5 * PS.G.VAULT_R * Math.PI / 21, oz: 0 }; SKY.creamSafe && SKY.creamSafe(true); SKY.warm && SKY.warm(); } STAGE.spawnFigures(); STAGE.spawnPlants(); STAGE.spawnHangers(); STAGE.spawnLift(); STAGE.seedDust();
    $('loading').style.display = 'none';
    bo = window.BOMO ? (BOMO.init({ homeZ: 0.85, zMin: 0.68, zMax: 1.8, reduced: S.reduced }), BOMO) : placeholderBo(); if (window.BOMO) bo.drawsShadow = true; // BOMO paints its own contact shadow
    boCv = document.createElement('canvas'); boCv.width = PS.W; boCv.height = PS.H; bg = boCv.getContext('2d', { willReadFrequently: true });
    for (const z of [3.2, 6.6, 10.1]) spawnShopper(z);
    draw(true); if (STAGE.warmStairs) STAGE.warmStairs(); // light the 48 belt phases now, not during the first two seconds of play
    if (q.get('run') !== '0') requestAnimationFrame(loop); else { draw(true); }
    window.__ready = true;
  }
  function placeholderBo() {
    const fake = { size: 1, items: [], cats: [], stage: { x: -9999, y: -9999, w: 99999, h: 99999 }, floorTop: -9999, sound: { purr() {}, meow() {}, play() {} }, pointer: {}, rel: {}, stimuli: [], scene: null, inSun: () => false };
    const c = new BZ.Cat({ coat: 'bo', name: 'Bo', x: 0, y: 0, theta: -Math.PI / 2 + 0.1 }, fake); c.state = 'idle'; c.think = () => {}; fake.cats.push(c);
    const st = { wx: 0.02, wz: 0.42, wy: 0, theta: -Math.PI / 2 + 0.1, anim: 'walk' };
    return { tick(s) { c.t++; c.steer(c.x + Math.cos(st.theta) * 900, c.y + Math.sin(st.theta) * 900, 'walk'); c.x = 0; c.y = 0; c.animate(); st.wy = PS.treadY(st.wz, s.phase); },
      state() { return { ...st, depth: PS.project(st.wx, st.wy, st.wz)[2] }; },
      draw(g) { const p = PS.project(st.wx, st.wy, st.wz); fake.size = (0.3 * PS.ppu(p[2])) / 78; c.updateScale && c.updateScale(); c.x = Math.round(p[0]); c.y = Math.round(p[1]); BZ.drawCat(g, c); } };
  }
  function boComposite(out, depth) {
    const s = bo.state(), p = PS.project(s.wx, s.wy, s.wz); bg.clearRect(0, 0, PS.W, PS.H);
    if (!bo.drawsShadow) { const ground = PS.project(s.wx, PS.treadY(s.wz, S.phase), s.wz), rx = Math.round(0.12 * PS.ppu(ground[2])), ry = Math.max(2, Math.round(rx * 0.25)); bg.fillStyle = '#4c535a';
      for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1 && ((xx + yy) & 1) === 0) bg.fillRect(Math.round(ground[0]) + xx, Math.round(ground[1]) + yy, 1, 1); }
    bo.draw(bg);
    const x0 = Math.max(0, Math.round(p[0]) - 150), y0 = Math.max(0, Math.round(p[1]) - 240), w = Math.min(PS.W - x0, 300), h = Math.min(PS.H - y0, 280); if (w <= 0 || h <= 0) return;
    const im = bg.getImageData(x0, y0, w, h).data; let yb = -1, yt = 1e9; for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (im[(yy * w + xx) * 4 + 3] >= 128) { if (yy > yb) yb = yy; if (yy < yt) yt = yy; }
    const footRow = yb - Math.max(3, Math.round((yb - yt) * 0.16)); const dd = s.depth - 0.02, nf = 0.85 * (STAGE.nightAmt || 0); // at night she steps down one place inside her own ramps, Bayer-dithered in
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const j = (yy * w + xx) * 4; if (im[j + 3] < 128) continue; const k = (y0 + yy) * PS.W + x0 + xx; const dk = yy >= footRow ? dd - 0.3 : dd; if (dk >= depth[k]) continue; depth[k] = dk; /* paws stand on the tread, they don't sink into it */
      let r = im[j], g = im[j + 1], b = im[j + 2]; const shift = nf > 0 && PS.bay(x0 + xx, y0 + yy) < nf ? 1 : 0; if (shift) { const m = BOMAP.get((r << 16) | (g << 8) | b); if (m) { const c = m[0][Math.max(0, m[1] - shift)]; r = c[0]; g = c[1]; b = c[2]; } }
      out[k * 4] = r; out[k * 4 + 1] = g; out[k * 4 + 2] = b; }
  }
  // Bo's colors → their place in Desktop Bo's ramps, so night can step her down inside her own ramps
  const BOMAP = new Map(); for (const key in BZ.RAMPS) { const rgb = BZ.RAMPS[key].map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); rgb.forEach((c, i) => { const id = (c[0] << 16) | (c[1] << 8) | c[2]; if (!BOMAP.has(id)) BOMAP.set(id, [rgb, i]); }); }
  // shoppers ride the belt toward the camera
  const W0 = STAGE.world; let nextId = 1;
  function spawnShopper(z) { const R = Math.random, pick = (a) => a[Math.floor(R() * a.length)], long = R() < 0.55; // riders stand on their right (screen left) about 7 times in 10
    W0.shoppers.push({ born: S.time, fin: 1, id: nextId++, x: (R() < 0.7 ? -1 : 1) * (0.14 + 0.2 * R()), z, y: 0, coat: pick(['coat1', 'coat2', 'coat3', 'navy', 'moss', 'plum']), skin: pick(['skin1', 'skin2', 'skin3']),
      style: { hem: long ? 0.28 + 0.12 * R() : 0.74 + 0.06 * R(), belt: long && R() < 0.4, hair: pick(['hair', 'hair', 'walnut', 'ochre', 'steel']), hairLen: pick(['short', 'short', 'long', 'long', 'bald']), legs: pick(['ink', 'navy', 'walnut', 'steel', 'moss']), scarf: pick(['trim', 'pbutter', 'pteal', 'teal', 'ochre', 'plum']) },
      bag: R() < 0.6 ? { side: R() < 0.5 ? -1 : 1, ink: pick(['teal', 'navy', 'ochre', 'plum', 'moss']) } : null }); }
  // input
  const input = { lat: 0, up: false, down: false };
  addEventListener('keydown', (e) => { if (e.target.closest && e.target.closest('input,select,textarea')) return; if (e.key === 'ArrowLeft') input.lat = -1; else if (e.key === 'ArrowRight') input.lat = 1; else if (e.key === 'ArrowUp') input.up = true; else if (e.key === 'ArrowDown') input.down = true; else return; e.preventDefault(); });
  addEventListener('keyup', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') input.lat = 0; if (e.key === 'ArrowUp') input.up = false; if (e.key === 'ArrowDown') input.down = false; });

  // touch and click on the stage stand in for the arrow keys (a short press)
  cv.addEventListener('pointerdown', (e) => { const r = cv.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    if (u < 0.33) input.lat = -1; else if (u > 0.67) input.lat = 1; else if (v < 0.5) input.up = true; else input.down = true;
    setTimeout(() => { input.lat = 0; input.up = false; input.down = false; }, 1100); });
  // sky light → rebake the hall when the sun or ambient changes enough
  let lastBake = { shaft: 0.75, ambient: 1 };
  function relight(res) { if (!res) return; const sh = res.shaft ?? lastBake.shaft, am = res.ambient ?? lastBake.ambient;
    if (Math.abs(sh - lastBake.shaft) > 0.08 || Math.abs(am - lastBake.ambient) > 0.08) { STAGE.bake(sh, am); lastBake = { shaft: sh, ambient: am }; } }

  let acc = 0, last = 0, frameN = 0, alt = 0;
  function step(dt) {
    S.time += dt; S.lastDt = dt; S.phase += S.beltSpeed * dt; acc += dt;
    if (S.auto) S.hour = (S.hour + dt * (24 / 240)) % 24; // a day in four minutes
    for (const sh of W0.shoppers) { sh.z -= S.beltSpeed * PS.G.RUN * dt; sh.y = PS.treadY(sh.z, S.phase); if (sh.z < 3.2) { const tx = Math.sign(sh.x || 1) * Math.max(Math.abs(sh.x), 0.36); sh.x += (tx - sh.x) * Math.min(1, dt * 1.2); } } // near the camera they keep to the side lanes and slide out of frame
    for (const sh of W0.shoppers) sh.fin = Math.max(0, 1 - (S.time - (sh.born ?? -9)) / 1.6); // new riders dither in at the far end
    for (let i = W0.shoppers.length - 1; i >= 0; i--) if (W0.shoppers[i].z < 0.34) W0.shoppers.splice(i, 1);
    if (bo) { const bs = bo.state(); for (const sh of W0.shoppers) { const tgt = sh.z < 3.6 && sh.z > bs.wz ? Math.max(-1, Math.min(1, (bs.wx - sh.x) * 5)) : 0; sh.look = (sh.look || 0) + (tgt - (sh.look || 0)) * Math.min(1, dt * 1.5); } } // riders near her glance down at the cat
    const crowd = (S.weather === 'rain' || S.weather === 'snow') ? 0.6 : 1; // weather drives footfall (research PX-TOWER-02)
    if (W0.shoppers.length < 3 * crowd && Math.random() < dt * 0.22 * crowd) spawnShopper(11 + Math.random() * 3);
    while (acc >= 0.033) { acc -= 0.033; bo.tick({ phase: S.phase, beltSpeed: S.beltSpeed, shoppers: W0.shoppers.map(s => ({ wx: s.x, wz: s.z, half: 0.2 })), input, flow: 6 }); }
    alt = Math.floor(S.phase);
  }
  function draw(forceSky) { frameN++; const skyNow = forceSky || frameN % 4 === 1; STAGE.setHour(S.hour); if (Math.abs(S.hour - (S._sunH ?? -9)) > (S.auto ? 0.5 : 0.25)) { S._sunH = S.hour; STAGE.setSunHour(S.hour); STAGE.bake(STAGE.light.shaft, STAGE.light.ambient); }
    const bd = bo && bo.state ? bo.state().depth : 1.4; if (S.focusT == null || Math.abs(bd - S.focusT) > 0.3) S.focusT = bd; const focus = S.focusT, sk = STAGE.skyState || {}; /* the lens re-focuses only when she has moved a step or two, so the background doesn't breathe with every hop */ S.shaftS = (S.shaftS ?? (sk.shaft ?? 0.7)) + ((sk.shaft ?? 0.7) - (S.shaftS ?? 0.7)) * Math.min(1, (S.lastDt || 1 / 30) * 0.6); // clouds crossing the sun fade the beams over a couple of seconds
    STAGE.frame(ctx, { ...S, skyNow, bo, boComposite, post: usePost ? (out, depth) => POST.render(out, depth, { air: Object.assign(POST.airFor(S.hour, S.weather, S.shaftS, S.air ?? 1), { night: STAGE.nightAmt || 0 }), focus, lens: S.lens, time: S.time, dt: S.lastDt || 1 / 30, grade: 0.5 }) : null }); if (skyNow) relight(STAGE.skyState); hud(); }
  function loop(ts) { const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60; last = ts; step(dt); draw(false); requestAnimationFrame(loop); }
  window.__step = (secs, fps = 30, force = true) => { const n = Math.round(secs * fps); for (let i = 0; i < n; i++) step(1 / fps); draw(force); };
  window.__S = S;

  const BOWORDS = { lookback: 'looking back at you', loaf: 'loafing', climb: 'climbing', trot: 'hurrying up', backtrack: 'turning back', ride: 'riding down', groom: 'grooming', stretch: 'stretching', watch: 'watching someone', sidestep: 'stepping aside', flinch: 'startled', sit: 'sitting' }; let lastWord = null;
  // HUD: the voice stays (MOODS from the game's constants)
  const MOODS = ['INDIFFERENT', 'INDIFFERENT', 'CURIOUS', 'ALERT', 'FOCUSED', 'COMPOSED', 'WEAVING', 'GLIDING', 'FLOWING', 'ASCENDING', 'UNBOTHERED', 'TRANSCENDENT', 'OMNISCIENT', 'BEYOND', 'RETAIL-BLESSED', 'RETAIL-BLESSED'];
  const pips = $('pips'); for (let i = 0; i < 15; i++) pips.appendChild(document.createElement('i'));
  function hud() { const flow = 6 + 5 * Math.sin(S.time / 23); const f = Math.max(0, Math.min(15, flow));
    $('mood').textContent = 'MOOD: ' + MOODS[Math.floor(f)]; $('alt').textContent = 'ALT ' + alt;
    [...pips.children].forEach((p, i) => { p.className = i < Math.round(f) ? (i >= 10 ? 'hot' : 'on') : ''; });
    if (bo && bo.state) { const st = bo.state(), w = BOWORDS[st.behavior] || ''; if (w !== lastWord) { lastWord = w; $('bonow').textContent = w; } }
    $('skynow').textContent = S.weather + ' · ' + String(Math.floor(S.hour)).padStart(2, '0') + ':' + String(Math.floor((S.hour % 1) * 60)).padStart(2, '0'); }

  // sky panel
  const WEATHERS = (window.SKY && SKY.WEATHERS) ? SKY.WEATHERS.map(w => w.id || w) : ['clear', 'fair', 'overcast', 'rain', 'snow', 'mist'];
  const wrow = $('weathers');
  for (const w of WEATHERS) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = w; b.setAttribute('aria-pressed', w === S.weather); b.onclick = () => { S.weather = w; [...wrow.children].forEach(c => c.setAttribute('aria-pressed', c === b)); }; wrow.appendChild(b); }
  $('hour').oninput = (e) => { S.hour = +e.target.value; };
  $('air').oninput = (e) => { S.air = +e.target.value; }; $('lens').oninput = (e) => { S.lens = +e.target.value; }; $('lens').value = S.lens;
  $('auto').onclick = (e) => { S.auto = !S.auto; e.target.setAttribute('aria-pressed', S.auto); };
  $('still').onclick = (e) => { S.reduced = !S.reduced; e.target.setAttribute('aria-pressed', S.reduced); if (window.BOMO && BOMO.setReduced) BOMO.setReduced(S.reduced); };
  $('still').setAttribute('aria-pressed', S.reduced);
  setInterval(() => { if (S.auto) $('hour').value = S.hour; }, 1000);

  // Mall FM panel
  const tracks = $('tracks');
  if (window.MALLFM && MALLFM.tracks) {
    for (const t of MALLFM.tracks) { const row = document.createElement('div'); row.className = 'track';
      const b = document.createElement('button'); b.textContent = '▶'; b.setAttribute('aria-label', 'Play ' + t.title); b.setAttribute('aria-pressed', 'false');
      b.onclick = () => { const on = MALLFM.now && MALLFM.now() === t.id; if (on) { MALLFM.stop(); } else { MALLFM.play(t.id); if (MALLFM.ambience && !ambStarted) { ambStarted = true; MALLFM.ambience(true); $('amb').setAttribute('aria-pressed', true); } } setTimeout(syncFm, 60); }; // the first track brings the mall in with it
      const d = document.createElement('div'); d.innerHTML = '<div class="t"></div><div class="b"></div><div class="r"></div>'; d.querySelector('.t').textContent = t.title; d.querySelector('.b').textContent = t.blurb || '';
      const r = d.querySelector('.r'); if ((t.refs || []).length) { const det = document.createElement('details'), sm = document.createElement('summary'); sm.textContent = 'Sources (' + t.refs.length + ')'; det.appendChild(sm);
        t.refs.forEach((ref, i) => { if (i) det.append(' · '); const a = document.createElement('a'); a.href = ref.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = ref.name; det.appendChild(a); }); r.appendChild(det); }
      row.append(b, d); row.dataset.id = t.id; tracks.appendChild(row); }
    $('vol').oninput = (e) => MALLFM.setVolume && MALLFM.setVolume(+e.target.value);
    if (MALLFM.setVolume) MALLFM.setVolume(+$('vol').value);
    // the mall around the music: its own toggle, and the stage tells it the weather, the hour and how busy the belt is
    if (MALLFM.ambience) { const ab = $('amb'); ab.onclick = () => { const on = ab.getAttribute('aria-pressed') !== 'true'; ambStarted = true; MALLFM.ambience(on); ab.setAttribute('aria-pressed', on); syncFm(); };
      $('ambvol').oninput = (e) => MALLFM.setAmbienceVolume && MALLFM.setAmbienceVolume(+e.target.value);
      setInterval(() => { if (MALLFM.setScene) MALLFM.setScene({ weather: S.weather, hour: S.hour, crowd: Math.min(1, STAGE.world.shoppers.length / 3) }); }, 2000); }
    else { $('amb').disabled = true; }
  } else tracks.textContent = 'Mall FM is not loaded.';
  let ambStarted = false;
  function syncFm() { const now = window.MALLFM && MALLFM.now ? MALLFM.now() : null; [...tracks.children].forEach(r => { const b = r.querySelector('button'); const on = r.dataset.id === now; b.setAttribute('aria-pressed', on); b.textContent = on ? '■' : '▶'; }); $('fmnow').textContent = now ? 'on air' : ($('amb').getAttribute('aria-pressed') === 'true' ? 'mall sounds' : 'off'); }
})();
