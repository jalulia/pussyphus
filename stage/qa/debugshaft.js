// node qa/debugshaft.js out.png weather hour debug — POST.debug render (1 shaft only, 2 transmittance)
const { chromium } = require('/opt/npm-tools/node_modules/playwright-core');
const glob = require('fs').readdirSync('/opt/pw-browsers').find(d => d.startsWith('chromium-'));
(async () => {
  const [out, wx, hr, dbg] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: `/opt/pw-browsers/${glob}/chrome-linux64/chrome`, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(`http://localhost:8733/index.html?run=0&weather=${wx}&hour=${hr}`); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const url = await p.evaluate((d) => { POST.debug = +d; window.__step(6, 30); return document.getElementById('stage').toDataURL(); }, dbg);
  require('fs').writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); await b.close();
})();
