const { chromium } = require('/opt/npm-tools/node_modules/playwright-core');
const glob = require('fs').readdirSync('/opt/pw-browsers').find(d => d.startsWith('chromium-'));
(async () => {
  const b = await chromium.launch({ executablePath: `/opt/pw-browsers/${glob}/chrome-linux64/chrome`, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const mode of ['post', 'drift']) {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await p.goto('http://localhost:8733/index.html?run=0&hour=14&weather=fair' + (mode === 'drift' ? '&post=0' : '')); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const r = await p.evaluate((mode) => { window.__step(3, 30, false);  const t = [];
      for (let i = 0; i < 300; i++) { const a = performance.now(); window.__step(1 / 30, 30, false); t.push(performance.now() - a); }
      t.sort((a, b) => a - b); return { median: +t[150].toFixed(1), p95: +t[285].toFixed(1), max: +t[299].toFixed(1) }; }, mode);
    console.log(mode, JSON.stringify(r)); await p.close(); }
  await b.close();
})();
