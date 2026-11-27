// node qa/gif.js out.gif weather hour seconds fps [warm]
const { chromium } = require('/opt/npm-tools/node_modules/playwright-core');
const glob = require('fs').readdirSync('/opt/pw-browsers').find(d => d.startsWith('chromium-'));
const fs = require('fs'), { execSync } = require('child_process');
(async () => {
  const [out, wx, hr, secs, fps, warm] = [process.argv[2], process.argv[3] || 'fair', process.argv[4] || 14, +(process.argv[5] || 8), +(process.argv[6] || 15), +(process.argv[7] || 20)];
  const dir = out + '.frames'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch({ executablePath: `/opt/pw-browsers/${glob}/chrome-linux64/chrome`, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:${process.env.PORT || 8733}/index.html?run=0&weather=${wx}&hour=${hr}`); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  await p.evaluate((w) => window.__step(w, 30), warm);
  const n = Math.round(secs * fps), beh = {};
  for (let i = 0; i < n; i++) { const r = await p.evaluate((f) => { window.__step(1 / f, 30, false); return [document.getElementById('stage').toDataURL(), window.BOMO ? BOMO.state().behavior : '']; }, fps);
    fs.writeFileSync(`${dir}/f${String(i).padStart(4, '0')}.png`, Buffer.from(r[0].split(',')[1], 'base64')); beh[r[1]] = (beh[r[1]] || 0) + 1; }
  await b.close();
  execSync(`ffmpeg -y -loglevel error -framerate ${fps} -i ${dir}/f%04d.png -vf "split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none" ${out}`);
  console.log(out, JSON.stringify(beh), errs.slice(0, 2).join(' | '));
})();
