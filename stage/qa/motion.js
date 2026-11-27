// Ambient motion budget for the Pussyphus stage: Bo, shoppers and the belt held still; counts stage pixels that change per frame.
// node qa/motion.js <weather> <hour> <frames>
const { chromium } = require('/opt/npm-tools/node_modules/playwright-core');
const glob = require('fs').readdirSync('/opt/pw-browsers').find(d => d.startsWith('chromium-'));
(async () => {
  const wx = process.argv[2] || 'fair', hour = +(process.argv[3] || 14), N = +(process.argv[4] || 300);
  const b = await chromium.launch({ executablePath: `/opt/pw-browsers/${glob}/chrome-linux64/chrome`, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:${process.env.PORT || 8733}/index.html?run=0&weather=${wx}&hour=${hour}`); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const r = await p.evaluate(([n]) => {
    const S = window.__S; S.beltSpeed = 0; STAGE.world.shoppers.length = 0; if (window.BOMO) { BOMO.draw = () => {}; BOMO.drawsShadow = true; BOMO.tick = () => {}; }
    if (window.SKY && SKY.setWeather) SKY.setWeather(S.weather);
    window.__step(2, 30);
    const cv = document.getElementById('stage'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    let prev = g.getImageData(0, 0, W, H).data; const per = [], ever = new Uint8Array(W * H);
    for (let f = 0; f < n; f++) { window.__step(1 / 30, 30, false); const d = g.getImageData(0, 0, W, H).data; let c = 0;
      for (let i = 0, k = 0; i < d.length; i += 4, k++) if (d[i] !== prev[i] || d[i + 1] !== prev[i + 1] || d[i + 2] !== prev[i + 2]) { c++; ever[k] = 1; }
      per.push(c / (W * H)); prev = d; }
    let ev = 0; for (const v of ever) ev += v; const s = per.slice().sort((a, b) => a - b), mean = per.reduce((a, b) => a + b, 0) / n;
    // where the ever-changed pixels are, in 8 horizontal bands
    const bands = Array(8).fill(0); for (let k = 0; k < W * H; k++) if (ever[k]) bands[Math.floor((k / W) / (H / 8))]++;
    return { W, H, frames: n, meanPct: +(mean * 100).toFixed(3), p50Pct: +(s[n >> 1] * 100).toFixed(3), p95Pct: +(s[Math.floor(n * 0.95)] * 100).toFixed(3), maxPct: +(s[n - 1] * 100).toFixed(3), everChangedPct: +(ev / (W * H) * 100).toFixed(2), bandsPct: bands.map(v => +(v / (W * H / 8) * 100).toFixed(1)) };
  }, [N]);
  console.log(JSON.stringify({ weather: wx, hour, ...r, errs: errs.slice(0, 3) }));
  await b.close();
})();
