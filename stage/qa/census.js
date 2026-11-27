// node qa/census.js seconds — Bo's behavior census on the page as shipped (belt, riders, wander)
const { chromium } = require('/opt/npm-tools/node_modules/playwright-core');
const glob = require('fs').readdirSync('/opt/pw-browsers').find(d => d.startsWith('chromium-'));
(async () => {
  const secs = +(process.argv[2] || 300);
  const b = await chromium.launch({ executablePath: `/opt/pw-browsers/${glob}/chrome-linux64/chrome`, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:${process.env.PORT || 8733}/index.html?run=0&hour=14&post=0${process.env.EXTRA || ''}`); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const r = await p.evaluate((secs) => { const beh = {}, anim = {}; let n = 0, off = 0, zmin = 9, zmax = -9, xmin = 9, xmax = -9, thMin = 9, thMax = -9, near = 0, starts = {}, prev = null;
    for (let i = 0; i < secs * 10; i++) { window.__step(0.1, 30, false); const s = BOMO.state(); n++; beh[s.behavior] = (beh[s.behavior] || 0) + 1; const a = (s.anim || '').split(':')[0]; anim[a] = (anim[a] || 0) + 1;
      if (s.behavior !== prev) { starts[s.behavior] = (starts[s.behavior] || 0) + 1; prev = s.behavior; }
      const feet = PS.project(s.wx, s.wy, s.wz)[1]; if (feet > PS.H - 1) off++; zmin = Math.min(zmin, s.wz); zmax = Math.max(zmax, s.wz); xmin = Math.min(xmin, s.wx); xmax = Math.max(xmax, s.wx); thMin = Math.min(thMin, s.theta); thMax = Math.max(thMax, s.theta);
      for (const sh of STAGE.world.shoppers) if (Math.abs(sh.z - s.wz) < 0.35 && Math.abs(sh.x - s.wx) < 0.45) { near++; break; } }
    const pct = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(100 * v / n).toFixed(1)]));
    return { samples: n, behaviorPct: pct(beh), animPct: pct(anim), starts, feetOffFramePct: +(100 * off / n).toFixed(2), z: [+zmin.toFixed(2), +zmax.toFixed(2)], x: [+xmin.toFixed(2), +xmax.toFixed(2)], theta: [+thMin.toFixed(2), +thMax.toFixed(2)], riderBesideHerPct: +(100 * near / n).toFixed(1) }; }, secs);
  console.log(JSON.stringify(r), errs.slice(0, 3).join(' | ')); await b.close();
})();
