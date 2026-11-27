// node render.js <outdir> <seconds> [ids...]  -> <outdir>/<id>.wav (48 kHz, 16-bit stereo) + stats json
const { chromium } = require('/opt/npm-tools/node_modules/playwright-core');
const fs = require('fs'), path = require('path');
const out = process.argv[2], secs = +process.argv[3] || 30, SEED = +(process.env.SEED || 7);
let ids = process.argv.slice(4);
(async () => {
  const exe = fs.readdirSync('/opt/pw-browsers').filter(d => /^chromium-\d+$/.test(d)).map(d => `/opt/pw-browsers/${d}/chrome-linux64/chrome`)[0];
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, 'harness.html'));
  if (!ids.length) ids = await page.evaluate(() => MALLFM.tracks.map(t => t.id));
  fs.mkdirSync(out, { recursive: true });
  const stats = {};
  for (const id of ids) {
    const r = await page.evaluate(([id, s, sd]) => window.renderTrack(id, s, sd), [id, secs, SEED]);
    const pcm = Buffer.from(r.b64, 'base64');
    const hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
    hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(r.sr, 24);
    hdr.writeUInt32LE(r.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(path.join(out, id + '.wav'), Buffer.concat([hdr, pcm]));
    stats[id] = { peak: r.peak, samplesOver08: r.over, nonFinite: r.nan, renderMs: Math.round(r.ms), seconds: secs };
    console.log(id, JSON.stringify(stats[id]));
  }
  fs.writeFileSync(path.join(out, 'render-stats.json'), JSON.stringify(stats, null, 1));
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
