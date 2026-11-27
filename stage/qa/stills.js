// node qa/stills.js outDir "weather:hour" ... — stage canvas stills after 6 s of play
const { chromium } = require('/opt/npm-tools/node_modules/playwright-core');
const glob = require('fs').readdirSync('/opt/pw-browsers').find(d => d.startsWith('chromium-'));
const fs = require('fs');
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: `/opt/pw-browsers/${glob}/chrome-linux64/chrome`, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const spec of process.argv.slice(3)) {
    const [wx, hr, secs] = spec.split(':');
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://localhost:8733/index.html?run=0&weather=${wx}&hour=${hr}${process.env.EXTRA || ""}`); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const info = await p.evaluate((s) => { window.__step(+s || 6, 30); const st = window.BOMO ? BOMO.state() : {}; return { st, url: document.getElementById('stage').toDataURL() }; }, secs);
    fs.writeFileSync(`${out}/${wx}-${hr}.png`, Buffer.from(info.url.split(',')[1], 'base64'));
    console.log(spec, JSON.stringify(info.st), errs.slice(0, 2).join(' | '));
    await p.close();
  }
  await b.close();
})();
