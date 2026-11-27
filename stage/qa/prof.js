const { chromium } = require('/opt/npm-tools/node_modules/playwright-core');
const glob = require('fs').readdirSync('/opt/pw-browsers').find(d => d.startsWith('chromium-'));
(async () => {
  const b = await chromium.launch({ executablePath: `/opt/pw-browsers/${glob}/chrome-linux64/chrome`, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto('http://localhost:8733/index.html?run=0&hour=14&weather=fair'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const r = await p.evaluate(() => { window.__step(3, 30, false); const acc = {}, rows = [];
    for (let i = 0; i < 300; i++) { const a = performance.now(); window.__step(1 / 30, 30, false); const tot = performance.now() - a; const pr = Object.assign({}, STAGE.prof || {}); rows.push([tot, pr, STAGE.world.shoppers.map(s => +s.z.toFixed(1)).join(',')]); for (const k in pr) (acc[k] = acc[k] || []).push(pr[k]); }
    const med = (a) => { a = a.slice().sort((x, y) => x - y); return [+a[a.length >> 1].toFixed(1), +a[Math.floor(a.length * 0.95)].toFixed(1)]; };
    rows.sort((x, y) => y[0] - x[0]);
    return { sections: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, med(v)])), worst: rows.slice(0, 5).map(r => [r[0].toFixed(1), JSON.stringify(r[1]), r[2]]) }; });
  console.log(JSON.stringify(r, null, 1)); await b.close();
})();
