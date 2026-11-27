/* MALL FM (sound/mallfm.js), global MALLFM.
   Four original, generative, endless mall-radio tracks for Pussyphus, synthesized in pure Web Audio:
   oscillators, biquads, a waveshaper, delay lines, and buffers this file computes itself
   (noise, slow modulation, a procedural mall impulse). No samples, no libraries.

   Contract
     MALLFM.tracks          -> [{ id, title, blurb, refs:[{name,url}], bpm }]
     MALLFM.play(id)        2.5 s equal-power crossfade; creates/resumes the AudioContext (call from a user gesture)
     MALLFM.stop()          1.5 s fade out, then the context suspends
     MALLFM.setVolume(v)    0..1, perceptual (gain = v*v), default 0.8
     MALLFM.now()           -> id | null
   Test hook (not part of the contract)
     MALLFM._render(id, seconds, {seed, sampleRate, volume}) -> Promise<AudioBuffer> via OfflineAudioContext

   Signal path per track instance
     voices -> instrument buses (pan, vibrato or tremolo) -> dry + reverb send (+ echo send)
     dry + convolver(procedural mall impulse) + room tone -> tape (soft asymmetric saturation, wow/flutter/drift delay,
     34 Hz high-pass, gentle low-pass) -> loudness trim -> crossfade gain -> master volume -> soft safety clip -> out */
var MALLFM = (function () {
  'use strict';
  var TAU = Math.PI * 2;

  // ───────── helpers ─────────
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function db(x) { return Math.pow(10, x / 20); }
  function pick(r, a) { return a[Math.floor(r() * a.length) % a.length]; }
  function rr(r, a, b) { return a + (b - a) * r(); }
  function ri(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function osc(c, type, f, det) { var o = c.createOscillator(); o.type = type; o.frequency.value = f; if (det) o.detune.value = det; return o; }
  function gn(c, v) { var g = c.createGain(); g.gain.value = v; return g; }
  function bq(c, type, f, q, gainDb) {
    var b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q == null ? 0.707 : q;
    if (gainDb != null) b.gain.value = gainDb; return b;
  }

  // ───────── buffers this file computes (cached per context) ─────────
  var cache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function seamless(d, n) { // crossfade the overhang into the head so the loop point is continuous
    var len = d.length - n, out = new Float32Array(len);
    for (var i = 0; i < len; i++) out[i] = d[i];
    for (var j = 0; j < n; j++) { var w = j / n; out[j] = d[j] * w + d[len + j] * (1 - w); }
    return out;
  }
  function toBuf(c, data, sr) { var b = c.createBuffer(1, data.length, sr); b.getChannelData(0).set(data); return b; }
  function normRms(d) { var s = 0; for (var i = 0; i < d.length; i++) s += d[i] * d[i]; var k = 1 / Math.sqrt(s / d.length || 1); for (i = 0; i < d.length; i++) d[i] *= k; return d; }
  // slow modulation: a sum of sinusoids at exact multiples of 1/sec, so the loop is periodic with no seam. RMS 1.
  function modBuf(c, sec, lo, hi, seed) {
    var sr = 8000, n = Math.floor(sec * sr), d = new Float32Array(n), r = mulberry(seed);
    var k0 = Math.max(1, Math.ceil(lo * sec)), k1 = Math.max(k0, Math.floor(hi * sec));
    for (var k = k0; k <= k1; k++) {
      var a = rr(r, 0.4, 1) / Math.sqrt(k), ph = r() * TAU, w = TAU * k / n;
      for (var i = 0; i < n; i++) d[i] += a * Math.sin(w * i + ph);
    }
    return toBuf(c, normRms(d), sr);
  }
  function buffers(c) {
    var B = cache && cache.get(c); if (B) return B;
    var sr = c.sampleRate, r = mulberry(9001), X = 2048;
    function gen(sec, fn) { var d = new Float32Array(Math.floor(sr * sec) + X); fn(d); return toBuf(c, seamless(d, X), sr); }
    B = {
      white: gen(4.7, function (d) { for (var i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }),
      pink: gen(6.1, function (d) {
        var b0 = 0, b1 = 0, b2 = 0;
        for (var i = 0; i < d.length; i++) { var w = r() * 2 - 1; b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
      }),
      brown: gen(7.3, function (d) { var b = 0; for (var i = 0; i < d.length; i++) { b = (b + 0.02 * (r() * 2 - 1)) / 1.02; d[i] = b; } normRms(d); }),
      drift: modBuf(c, 13.7, 0.12, 1.1, 77),   // tape speed drift
      babble: modBuf(c, 5.3, 2.5, 9, 78),      // water and murmur flutter
      breath: modBuf(c, 23.1, 0.05, 0.3, 79)   // very slow swells
    };
    if (cache) cache.set(c, B);
    return B;
  }

  // procedural mall impulse: diffuse decaying noise whose low-pass cutoff falls over time (air, glass,
  // terrazzo and soft shopfronts lose highs first), a few early reflections, stereo decorrelated, unit energy.
  function impulse(c, o, seed) {
    var sr = c.sampleRate, r = mulberry(seed), pre = o.pre || 0.03;
    var len = Math.floor(sr * (pre + o.rt60 * 1.1)), b = c.createBuffer(2, len, sr);
    var hf0 = o.hf0 || 8500, hf1 = o.hf1 || 1300, hfT = o.hfT || o.rt60 * 0.3, build = o.build || 0.035;
    var er = o.er || [[0.011, 2.0], [0.019, 1.6], [0.027, 1.4], [0.038, 1.1], [0.053, 0.9], [0.071, 0.7]];
    var E = [0, 0], start = Math.floor(pre * sr), dec = Math.exp(-6.9078 / (o.rt60 * sr)), bk = Math.exp(-1 / (build * sr));
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), s1 = 0, s2 = 0, a = 0, env = 1, bu = 1;
      for (var i = start; i < len; i++) {
        if (((i - start) & 63) === 0) { var t = (i - start) / sr, fc = hf1 + (hf0 - hf1) * Math.exp(-t / hfT); a = 1 - Math.exp(-TAU * fc / sr); }
        s1 += a * (r() * 2 - 1 - s1); s2 += a * (s1 - s2);
        d[i] = s2 * env * (1 - bu); env *= dec; bu *= bk;
      }
      for (var j = 0; j < er.length; j++) {
        var idx = Math.floor(er[j][0] * (ch ? 1.07 : 0.94) * sr), g = er[j][1] * 0.25;
        for (var q = 0; q < 8 && idx + q < len; q++) d[idx + q] += g * Math.sin(Math.PI * (q + 0.5) / 8);
      }
      for (i = 0; i < len; i++) E[ch] += d[i] * d[i];
    }
    var k = 1 / Math.sqrt((E[0] + E[1]) / 2);
    for (ch = 0; ch < 2; ch++) { var dd = b.getChannelData(ch); for (i = 0; i < len; i++) dd[i] *= k; }
    return b;
  }
  // unity small-signal gain, softly compressing, slightly asymmetric (even harmonics), like a warm cassette deck
  function satCurve(bias) {
    var n = 4096, cu = new Float32Array(n), tb = Math.tanh(bias), s = 1 - tb * tb;
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1; cu[i] = (Math.tanh(x + bias) - tb) / s; }
    return cu;
  }
  function clipCurve() { // transparent below 0.8, smooth ceiling near 0.95
    var n = 4096, cu = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); cu[i] = a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2)); }
    return cu;
  }

  // ───────── a running track ─────────
  function Instance(c, dest, def, seed, live) {
    var I = this; I.ctx = c; I.def = def; I.r = mulberry(seed); I.live = live; I.keepers = []; I.stopped = false;
    I.B = buffers(c); I.t0 = live ? c.currentTime + 0.12 : 0.02;
    var fx = def.fx;
    I.fade = gn(c, live ? 0 : 1); I.fade.connect(dest);
    I.trim = gn(c, db(def.trimDb || 0)); I.trim.connect(I.fade);
    I.sum = gn(c, 1);
    var tp = tape(I, fx); I.sum.connect(tp.input);
    if (fx.comp) { // gentle transient control for the sparse tracks, so loud onsets do not set the peak
      var k = c.createDynamicsCompressor(); k.threshold.value = fx.comp.th; k.knee.value = fx.comp.knee; k.ratio.value = fx.comp.ratio;
      k.attack.value = fx.comp.att; k.release.value = fx.comp.rel; tp.out.connect(k); k.connect(I.trim);
    } else tp.out.connect(I.trim);
    I.dry = gn(c, 1); I.dry.connect(I.sum);
    I.send = gn(c, 1);
    var conv = c.createConvolver(); conv.normalize = false; conv.buffer = impulse(c, fx.rev, (seed ^ 0x5bd1) >>> 0);
    var wet = gn(c, fx.wet); I.send.connect(conv); conv.connect(wet); wet.connect(I.sum);
    if (fx.echo) I.echoIn = echo(I, fx.echo);
    if (fx.room != null) roomTone(I, fx.room);
    I.S = def.init(I);
    I.cursor = I.t0;
  }
  Instance.prototype.keep = function (n) { this.keepers.push(n); return n; };
  Instance.prototype.lfo = function (hz, depth, param, type) {
    var o = osc(this.ctx, type || 'sine', hz), g = gn(this.ctx, depth); o.connect(g); g.connect(param);
    o.start(this.t0); this.keep(o); return g;
  };
  Instance.prototype.loop = function (buf, offset, rate) {
    var s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; if (rate) s.playbackRate.value = rate;
    s.start(this.t0, (offset || 0) % buf.duration); this.keep(s); return s;
  };
  Instance.prototype.mod = function (buf, depth, param, rate) { // slow random modulation of a parameter
    var s = this.loop(buf, rr(this.r, 0, buf.duration), rate || 1), g = gn(this.ctx, depth); s.connect(g); g.connect(param); return g;
  };
  // instrument bus: o = { gain, pan, dry, send, echo, vib:{hz, depth (pitch fraction)}, trem:{hz, depth} }
  Instance.prototype.bus = function (o) {
    var c = this.ctx, g = gn(c, o.gain == null ? 1 : o.gain), node = g;
    if (o.vib) { // delay-line vibrato: the whole instrument shares one vibrato, as on a combo organ
      var d = c.createDelay(0.05); d.delayTime.value = 0.006;
      this.lfo(o.vib.hz, o.vib.depth / (TAU * o.vib.hz), d.delayTime); node.connect(d); node = d;
    }
    if (o.trem) { // shared motor tremolo, as on a vibraphone
      var a = gn(c, 1 - o.trem.depth / 2); this.lfo(o.trem.hz, o.trem.depth / 2, a.gain); node.connect(a); node = a;
    }
    if (c.createStereoPanner) { var p = c.createStereoPanner(); p.pan.value = o.pan || 0; node.connect(p); node = p; }
    var dg = gn(c, o.dry == null ? 1 : o.dry); node.connect(dg); dg.connect(this.dry);
    if (o.send) { var sg = gn(c, o.send); node.connect(sg); sg.connect(this.send); }
    if (o.echo && this.echoIn) { var eg = gn(c, o.echo); node.connect(eg); eg.connect(this.echoIn); }
    return g;
  };
  Instance.prototype.pump = function (until) {
    var n = 0; while (!this.stopped && this.cursor < until && n++ < 1e6) this.cursor = this.def.step(this, this.cursor, this.S);
  };
  Instance.prototype.fadeTo = function (target, dur) {
    var c = this.ctx, g = this.fade.gain, now = c.currentTime, v = g.value;
    g.cancelScheduledValues(now); g.setValueAtTime(v, now);
    for (var i = 1; i <= 12; i++) {
      var u = i / 12, s = target > v ? Math.sin(u * Math.PI / 2) : 1 - Math.cos(u * Math.PI / 2);
      g.linearRampToValueAtTime(v + (target - v) * s, now + dur * u);
    }
  };
  Instance.prototype.dispose = function () {
    this.stopped = true;
    this.keepers.forEach(function (n) { try { n.stop(); } catch (e) { /* already stopped */ } });
    try { this.fade.disconnect(); } catch (e) { /* already gone */ }
  };

  function tape(I, o) {
    var c = I.ctx, input = gn(c, 1), pre = gn(c, o.drive), sh = c.createWaveShaper(), post = gn(c, 1 / o.drive);
    sh.curve = satCurve(o.bias); sh.oversample = '2x';
    var dl = c.createDelay(0.1); dl.delayTime.value = 0.02;
    I.lfo(o.wowHz, o.wow / (TAU * o.wowHz), dl.delayTime);        // wow: o.wow = peak pitch deviation (fraction)
    I.lfo(o.flutHz, o.flutter / (TAU * o.flutHz), dl.delayTime);  // flutter
    I.mod(I.B.drift, o.drift, dl.delayTime);                       // slow random speed drift (seconds of delay, RMS)
    var hp = bq(c, 'highpass', o.hp || 34, 0.6), lp = bq(c, 'lowpass', o.lp, 0.5);
    input.connect(pre); pre.connect(sh); sh.connect(post); post.connect(dl); dl.connect(hp); hp.connect(lp);
    return { input: input, out: lp };
  }
  // tape-and-spring echo: modulated delay, band-limited feedback, two allpasses for a little spring smear
  function echo(I, o) {
    var c = I.ctx, input = gn(c, 1), d = c.createDelay(2), lp = bq(c, 'lowpass', o.lp, 0.5), hp = bq(c, 'highpass', o.hp, 0.5);
    var ap1 = bq(c, 'allpass', 820, 0.6), ap2 = bq(c, 'allpass', 1900, 0.6), fb = gn(c, o.fb), out = gn(c, o.wet), rs = gn(c, 0.35);
    d.delayTime.value = o.time; I.lfo(0.29, 0.0011, d.delayTime);
    input.connect(d); d.connect(lp); lp.connect(hp); hp.connect(ap1); ap1.connect(ap2); ap2.connect(fb); fb.connect(d);
    ap2.connect(out); out.connect(I.sum); ap2.connect(rs); rs.connect(I.send);
    return input;
  }
  // HVAC air plus a far-off murmur: two loops at unrelated rates so the bed never repeats audibly
  function roomTone(I, level) {
    var c = I.ctx, B = I.B;
    var a = I.loop(B.brown, rr(I.r, 0, 7), 1), a2 = I.loop(B.brown, rr(I.r, 0, 7), 0.71);
    var lp = bq(c, 'lowpass', 240, 0.5), pk = bq(c, 'peaking', 118, 3, 5), g = gn(c, db(level));
    a.connect(lp); a2.connect(lp); lp.connect(pk); pk.connect(g); g.connect(I.sum);
    var m = I.loop(B.pink, rr(I.r, 0, 6), 1), m2 = I.loop(B.pink, rr(I.r, 0, 6), 0.83);
    var bp = bq(c, 'bandpass', 480, 0.9), mg = gn(c, db(level - 4)), am = gn(c, 1);
    I.mod(B.babble, 0.35, am.gain, 0.61);
    m.connect(bp); m2.connect(bp); bp.connect(am); am.connect(mg); mg.connect(I.sum);
  }

  // ───────── voices ─────────
  // Italian combo organ: triangle "flute" footages plus a square "reed" tab, summed into one PeriodicWave per
  // registration and key (a divide-down organ's fixed tone), with a soft low-pass baked into the harmonics.
  // stops: {'16':g,'8':g,'4':g,'2.67':g,'2':g}
  var waveCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function organWave(c, o, m) {
    var W = waveCache && waveCache.get(c); if (!W) { W = {}; if (waveCache) waveCache.set(c, W); }
    var key = JSON.stringify(o.stops) + '|' + (o.reed || 0) + '|' + (o.cut || 2600) + '|' + m;
    if (W[key]) return W[key];
    var f = mtof(m), fc = Math.min(o.cut || 2600, f * 16), parts = [], minMul = 99, k;
    for (k in o.stops) { var mul = Math.round(16 / +k) / 2; parts.push([mul, o.stops[k], 'tri']); minMul = Math.min(minMul, mul); }
    if (o.reed) { parts.push([1, o.reed, 'sq']); minMul = Math.min(minMul, 1); }
    var f0 = f * minMul, N = Math.max(1, Math.min(256, Math.floor(9000 / f0))), im = new Float32Array(N + 1), re = new Float32Array(N + 1);
    parts.forEach(function (p) {
      for (var kt = 1; ; kt += 2) {
        var n = Math.round(kt * p[0] / minMul); if (n > N) break;
        var x = n * f0 / fc, H = 1 / (1 + x * x);
        im[n] += p[2] === 'tri' ? p[1] * (8 / (Math.PI * Math.PI)) / (kt * kt) * ((kt - 1) / 2 % 2 ? -1 : 1) * H : p[1] * (4 / Math.PI) / kt * H;
      }
    });
    W[key] = { wave: c.createPeriodicWave(re, im, { disableNormalization: true }), f0: f0 };
    return W[key];
  }
  // every voice ends with its envelopes frozen at 0 (so no automation keeps running) and detaches itself when done
  function fin(src, out, stopAt, gains) {
    for (var i = 0; i < gains.length; i++) gains[i].gain.setValueAtTime(0, stopAt);
    src.onended = function () { try { out.disconnect(); } catch (e) { /* gone */ } };
  }
  function organ(I, bus, t, m, dur, vel, o) {
    var c = I.ctx, a = o.a || 0.012, rel = o.rel || 0.08, end = Math.max(t + a, t + dur), w = organWave(c, o, m), stop = end + rel + 0.05;
    var ov = c.createOscillator(), env = gn(c, 0);
    ov.setPeriodicWave(w.wave); ov.frequency.value = w.f0; if (o.det) ov.detune.value = o.det;
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vel, t + a);
    env.gain.setValueAtTime(vel, end); env.gain.linearRampToValueAtTime(0, end + rel);
    ov.connect(env); env.connect(bus); ov.start(t); ov.stop(stop); fin(ov, env, stop, []);
  }
  // rhythm-box voices, all soft: no fast high transients
  function drum(I, bus, t, kind, vel) {
    var c = I.ctx, B = I.B;
    function tone(f0, f1, tp, tau, lvl) {
      var o = osc(c, 'sine', f0), g = gn(c, 0), stop = t + tau * 8 + 0.02;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + tp);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl * vel, t + 0.004); g.gain.setTargetAtTime(0, t + 0.004, tau);
      o.connect(g); g.connect(bus); o.start(t); o.stop(stop); fin(o, g, stop, [g]);
    }
    function hiss(type, f, q, a, tau, lvl, when) {
      var tt = when || t, s = c.createBufferSource(), fl = bq(c, type, f, q), g = gn(c, 0), stop = tt + a + tau * 8 + 0.02;
      s.buffer = B.white; g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(lvl * vel, tt + a); g.gain.setTargetAtTime(0, tt + a, tau);
      s.connect(fl); fl.connect(g); g.connect(bus); s.start(tt, rr(I.r, 0, 4)); s.stop(stop); fin(s, g, stop, [g]);
    }
    switch (kind) {
      case 'tom': tone(126, 97, 0.07, 0.13, 0.9); hiss('lowpass', 650, 0.7, 0.003, 0.02, 0.22); break; // skin on a mortar
      case 'bd': tone(98, 78, 0.06, 0.1, 0.7); break;
      case 'cga': tone(258, 236, 0.04, 0.075, 0.5); break;
      case 'shk': hiss('bandpass', 6500, 1.0, 0.006, 0.022, 0.6); break;
      case 'clap':
        for (var k = 0; k < 3; k++) hiss('bandpass', 1150, 0.9, 0.003, 0.006, 0.5, t + k * 0.0095);
        hiss('bandpass', 1050, 0.8, 0.004, 0.04, 0.32, t + 0.028); break;
    }
  }
  // two-oscillator synth through a 2-pole low-pass whose cutoff falls fast after each key: the plink
  function lead(I, bus, t, m, dur, vel) {
    var c = I.ctx, f = mtof(m), end = t + Math.max(dur, 0.06), stop = end + 0.5, base = f * 3 + 1500;
    var o1 = osc(c, 'square', f), o2 = osc(c, 'sawtooth', f, 7), g1 = gn(c, 0.36), g2 = gn(c, 0.42);
    var vcf = bq(c, 'lowpass', base, 1.8), env = gn(c, 0);
    vcf.frequency.setValueAtTime(Math.min(f * 4 + 4200 * vel, 9500), t); vcf.frequency.setTargetAtTime(base, t + 0.004, 0.12); vcf.frequency.setValueAtTime(base, t + 0.8);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vel, t + 0.005);
    env.gain.setTargetAtTime(vel * 0.36, t + 0.005, 0.22); env.gain.setTargetAtTime(0, end, 0.07);
    if (dur > 0.55) {
      var lf = osc(c, 'sine', 5.2), lg = gn(c, 0);
      lg.gain.setValueAtTime(0, t + 0.3); lg.gain.linearRampToValueAtTime(7, t + 0.95);
      lf.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune); lf.start(t); lf.stop(stop);
    }
    o1.connect(g1); o2.connect(g2); g1.connect(vcf); g2.connect(vcf); vcf.connect(env); env.connect(bus);
    o1.start(t); o2.start(t); o1.stop(stop); o2.stop(stop); fin(o1, env, stop, [env]);
  }
  // two-operator FM: music box (ratio 3.5), DX-style bell, or electric-piano body (ratio 1)
  function fm(I, bus, t, m, vel, o) {
    var c = I.ctx, f = mtof(m), ratio = o.ratio || 3.5, idx = (o.index || 1.6) * Math.min(1, 1600 / f), T = o.decay || 1.4, a = o.a || 0.003;
    var car = osc(c, 'sine', f), mod = osc(c, 'sine', f * ratio), mg = gn(c, 0), env = gn(c, 0);
    var stop = t + (o.dur ? Math.min(T * 1.05, o.dur + 1.6) : T * 1.05) + 0.05;
    mg.gain.setValueAtTime(idx * f * ratio, t); mg.gain.setTargetAtTime(idx * f * ratio * (o.sus || 0.08), t, o.idecay || 0.12);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vel, t + a); env.gain.setTargetAtTime(0, t + a, T / 6.9);
    if (o.dur) env.gain.setTargetAtTime(0, t + o.dur, 0.25);
    mod.connect(mg); mg.connect(car.frequency); car.connect(env); env.connect(bus);
    car.start(t); mod.start(t); car.stop(stop); mod.stop(stop); fin(car, env, stop, [env, mg]);
  }
  function bass(I, bus, t, m, dur, vel) {
    var c = I.ctx, f = mtof(m), end = t + dur, stop = end + 0.45, s = osc(c, 'sine', f), tr = osc(c, 'triangle', f), tg = gn(c, 0.6), lp = bq(c, 'lowpass', 1100, 0.5), env = gn(c, 0);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vel, t + 0.012);
    env.gain.setTargetAtTime(vel * 0.5, t + 0.012, 0.3); env.gain.setTargetAtTime(0, end, 0.06);
    s.connect(lp); tr.connect(tg); tg.connect(lp); lp.connect(env); env.connect(bus);
    s.start(t); tr.start(t); s.stop(stop); tr.stop(stop); fin(s, env, stop, [env]);
  }
  // additive felt piano: stretched partials (inharmonicity), two slightly detuned strings, faster decay up the series.
  // half:true plays it as if recorded an octave up and replayed at half tape speed (Eno slowed 1/1 this way).
  function piano(I, bus, t, m, vel, o) {
    o = o || {};
    var c = I.ctx, half = !!o.half, mm = half ? m + 12 : m, f0 = mtof(mm), sp = half ? 0.5 : 1, ts = half ? 2 : 1;
    var Bh = 0.00038 * Math.pow(2, (mm - 60) / 24), T60 = (o.T || clamp(10 * Math.pow(0.5, (mm - 48) / 15), 1.6, 11)) * ts;
    var bright = o.bright == null ? 0.5 : o.bright, out = gn(c, vel * 0.42), a = 0.004 * ts, longest = null, gains = [];
    out.connect(bus);
    var N = Math.max(1, Math.min(14, Math.floor(9500 / (f0 * sp)))), stop = t + T60 + 0.05;
    for (var n = 1; n <= N; n++) {
      var fn = n * f0 * Math.sqrt(1 + Bh * n * n) * sp, amp = Math.pow(n, -1.0) * Math.exp(-(n - 1) * (1 - bright) * 0.55), tau = T60 / 6.9 / (1 + 0.55 * (n - 1));
      for (var s = 0; s < 2; s++) {
        var ov = osc(c, 'sine', fn, s ? 0.7 : -0.7), g = gn(c, 0), st = t + Math.min(T60, tau * 9) + 0.05;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp * 0.5, t + a); g.gain.setTargetAtTime(0, t + a, tau); g.gain.setValueAtTime(0, st);
        ov.connect(g); g.connect(out); ov.start(t); ov.stop(st); if (n === 1) longest = ov;
      }
    }
    var h = c.createBufferSource(), hl = bq(c, 'lowpass', 2600 * sp, 0.7), hg = gn(c, 0);
    h.buffer = I.B.white; h.playbackRate.value = sp;
    hg.gain.setValueAtTime(0, t); hg.gain.linearRampToValueAtTime(0.06, t + 0.002 * ts); hg.gain.setTargetAtTime(0, t + 0.002 * ts, 0.01 * ts); hg.gain.setValueAtTime(0, t + 0.12 * ts);
    h.connect(hl); hl.connect(hg); hg.connect(out); h.start(t, rr(I.r, 0, 4)); h.stop(t + 0.12 * ts);
    fin(longest, out, stop, gains);
  }
  // bars tuned 1 : 4 : 10 (vibraphone, marimba). Marimba: short; vibraphone: long, tremolo on its bus.
  function bar(I, bus, t, m, vel, parts) {
    var c = I.ctx, f = mtof(m), out = gn(c, vel), first = null; out.connect(bus);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], fr = f * p[0]; if (fr > 9000) continue;
      var ov = osc(c, 'sine', fr), g = gn(c, 0), st = t + p[2] * 1.15 + 0.05;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p[1], t + 0.003); g.gain.setTargetAtTime(0, t + 0.003, p[2] / 6.9); g.gain.setValueAtTime(0, st);
      ov.connect(g); g.connect(out); ov.start(t); ov.stop(st); if (!first) first = ov;
    }
    fin(first, out, t + parts[0][2] * 1.15 + 0.05, []);
  }
  function vibe(I, bus, t, m, vel) { var T = clamp(7 - (m - 60) * 0.09, 2.5, 8); bar(I, bus, t, m, vel, [[1, 1, T], [4, 0.36, 1.3], [10, 0.25, 0.4]]); }
  function marimba(I, bus, t, m, vel, hard) { var T = clamp(1.5 - (m - 60) * 0.035, 0.35, 1.8), h = hard || 0.5; bar(I, bus, t, m, vel, [[1, 1, T], [3.98, 0.42 * h, 0.25], [9.3, 0.22 * h, 0.06], [13.6, 0.1 * h, 0.025]]); }
  function pad(I, bus, t, m, dur, vel, o) {
    o = o || {}; var c = I.ctx, f = mtof(m), A = o.a || 2.5, R = o.r || 3.5, end = Math.max(t + A, t + dur), stop = end + R + 0.1;
    var lp = bq(c, 'lowpass', o.cut || 1300, 0.4), env = gn(c, 0);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vel, t + A); env.gain.setValueAtTime(vel, end); env.gain.linearRampToValueAtTime(0, end + R);
    var os = [osc(c, 'triangle', f, -5), osc(c, 'triangle', f, 5), osc(c, 'sine', f * 2)], gs = [0.5, 0.5, 0.1];
    for (var i = 0; i < 3; i++) { var g = gn(c, gs[i]); os[i].connect(g); g.connect(lp); os[i].start(t); os[i].stop(stop); }
    lp.connect(env); env.connect(bus); fin(os[0], env, stop, []);
  }
  // a soft sung "oo": sawtooth through three formant bandpasses, slow swell
  function choir(I, bus, t, m, dur, vel) {
    var c = I.ctx, f = mtof(m), end = t + dur, stop = end + 2.7, src = osc(c, 'sawtooth', f), lf = osc(c, 'sine', 4.6), lg = gn(c, 5), env = gn(c, 0), sum = gn(c, 1);
    lf.connect(lg); lg.connect(src.detune);
    var soft = bq(c, 'lowpass', 2600, 0.5); src.connect(soft);
    [[330, 7, 1], [760, 9, 0.35], [2400, 12, 0.06]].forEach(function (F) { var b = bq(c, 'bandpass', F[0], F[1]), g = gn(c, F[2]); soft.connect(b); b.connect(g); g.connect(sum); });
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vel, t + 1.8); env.gain.setValueAtTime(vel, end); env.gain.linearRampToValueAtTime(0, end + 2.6);
    sum.connect(env); env.connect(bus);
    src.start(t); lf.start(t); src.stop(stop); lf.stop(stop); fin(src, env, stop, []);
  }
  function glide(I, bus, t, m1, m2, dur, vel) {
    var c = I.ctx, s = osc(c, 'sine', mtof(m1)), tr = osc(c, 'triangle', mtof(m1)), tg = gn(c, 0.15), env = gn(c, 0), end = t + dur, stop = end + 3.1;
    [s.frequency, tr.frequency].forEach(function (p) { p.setValueAtTime(mtof(m1), t + dur * 0.25); p.exponentialRampToValueAtTime(mtof(m2), t + dur * 0.8); });
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vel, t + 2.2); env.gain.setValueAtTime(vel, end); env.gain.linearRampToValueAtTime(0, end + 3);
    s.connect(env); tr.connect(tg); tg.connect(env); env.connect(bus);
    s.start(t); tr.start(t); s.stop(stop); tr.stop(stop); fin(s, env, stop, []);
  }
  // fountain: band-limited spray with babbling amplitude, a basin rumble, a 47 s pump swell
  function fountain(I, bus, level) {
    var c = I.ctx, B = I.B, pump = gn(c, 0.8); I.lfo(1 / 47, 0.2, pump.gain); pump.connect(bus);
    var s1 = I.loop(B.white, rr(I.r, 0, 4), 1), s2 = I.loop(B.white, rr(I.r, 0, 4), 0.77);
    var bp = bq(c, 'bandpass', 1500, 0.35), hs = bq(c, 'highshelf', 3800, 0.7, -10), g = gn(c, db(level));
    I.mod(B.babble, db(level) * 0.38, g.gain, 1.0);
    s1.connect(bp); s2.connect(bp); bp.connect(hs); hs.connect(g); g.connect(pump);
    var b1 = I.loop(B.brown, rr(I.r, 0, 7), 1.13), bl = bq(c, 'lowpass', 420, 0.5), bg = gn(c, db(level - 8));
    b1.connect(bl); bl.connect(bg); bg.connect(pump);
  }
  function droplet(I, bus, t, vel) { // rising sine chirp: a bubble at the surface
    var c = I.ctx, f = rr(I.r, 700, 2300), o = osc(c, 'sine', f), g = gn(c, 0), d = rr(I.r, 0.012, 0.045), stop = t + d * 4 + 0.02;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rr(I.r, 1.25, 1.9), t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, d * 0.5);
    o.connect(g); g.connect(bus); o.start(t); o.stop(stop); fin(o, g, stop, [g]);
  }

  // ───────── track 1: Tendé Arcade (Mamman Sani direction) ─────────
  var SAHEL_BOX = {
    tom: [0.9, 0, 0, 0, 0, 0, 0.55, 0, 0, 0.32, 0, 0],
    tomFill: [0.9, 0, 0, 0, 0, 0, 0.5, 0, 0.35, 0.42, 0, 0.5],
    cga: [0, 0, 0, 0.42, 0, 0.22, 0, 0, 0, 0, 0.36, 0.2],
    shk: [0.5, 0.18, 0.28, 0.42, 0.18, 0.28, 0.5, 0.18, 0.28, 0.42, 0.18, 0.28],
    clap: [0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0.5, 0, 0],
    bd: [0.55, 0, 0, 0, 0, 0, 0.25, 0, 0, 0, 0, 0]
  };
  function sahelPhrase(I, S) {
    var r = I.r, L = S.ladder, notes;
    if (S.last && !S.last.rep && r() < 0.62) { // sung lines come back, a little changed
      notes = S.last.notes.map(function (n) { return { m: n.m, u: n.u, trill: n.trill }; });
      var k = ri(r, 0, notes.length - 2); notes[k].u = Math.max(1, notes[k].u + pick(r, [-1, 1, 2]));
      if (r() < 0.4) { var cad = notes[notes.length - 1]; cad.m = cad.m === S.tonic ? S.tonic + 7 : S.tonic; }
      S.last = { notes: notes, rep: true };
    } else {
      var n = ri(r, 4, 8), i = L.indexOf(S.tonic + 7) + ri(r, -1, 2), peak = ri(r, 1, n - 2);
      notes = [];
      for (var j = 0; j < n; j++) {
        if (j > 0) i += j <= peak ? pick(r, [1, 1, 2, 0, -1]) : -pick(r, [1, 1, 2, 0]);
        i = clamp(i, 1, L.length - 2);
        var long = r() < 0.38, u = long ? ri(r, 3, 6) : ri(r, 1, 2);
        notes.push({ m: L[i], u: u, trill: long && r() < 0.35 });
      }
      var tgt = pick(r, [S.tonic, S.tonic, S.tonic + 7, S.tonic + 12]);
      notes[n - 1].m = tgt; notes[n - 1].u = pick(r, [6, 8, 9, 12]); notes[n - 1].trill = r() < 0.25;
      S.last = { notes: notes, rep: false };
    }
    S.queue = notes.concat([{ m: null, u: ri(r, 6, 18) }]); // silence between lines
    S.oct2 = pick(r, [0, 0, -12, 12]);
  }
  function sahelNote(I, S, t, ev) {
    var dur = ev.u * S.u * 0.94, v1 = 0.55 * rr(I.r, 0.92, 1.05);
    var reg1 = { stops: { '8': 0.5, '4': 0.3, '2': 0.26 }, reed: 0.36, cut: 8500 };
    if (ev.trill) { // kitsch organ trill with the upper neighbour, then hold
      var L = S.ladder, nb = L[Math.min(L.length - 1, L.indexOf(ev.m) + 1)] || ev.m + 2, step = 1 / 9.5, tt = t, k = 0;
      while (tt < t + dur * 0.5) { organ(I, S.org1, tt, k % 2 ? nb : ev.m, step * 0.85, v1, { stops: reg1.stops, reed: reg1.reed, cut: reg1.cut, a: 0.006, rel: 0.03 }); tt += step; k++; }
      organ(I, S.org1, tt, ev.m, t + dur - tt, v1, reg1);
    } else organ(I, S.org1, t, ev.m, dur, v1, reg1);
    // the second take, overdubbed in slight heterophony: late, a hair sharp, skips some short notes
    if (ev.u <= 1 && I.r() < 0.45) return;
    organ(I, S.org2, t + rr(I.r, 0.025, 0.07), ev.m + S.oct2, dur * rr(I.r, 0.85, 1.05), 0.5, { stops: { '8': 0.45, '2.67': 0.16, '2': 0.16 }, reed: 0.16, cut: 6000, det: 5 });
  }
  var SAHEL = {
    id: 'sahel', title: 'Tendé Arcade', bpm: 76,
    blurb: 'Italian-style combo organ over a soft 12/8 rhythm box, a free-time line doubled in slight heterophony, tape-and-spring echo. After Mamman Sani.',
    refs: [
      { name: 'Sahel Sounds: La Musique Electronique du Niger', url: 'https://sahelsounds.com/products/mammane-sani-et-son-orgue-la-musique-electronique-du-niger' },
      { name: 'Sahel Sounds: Mamman Sani', url: 'https://sahelsounds.com/pages/mamman-sani' },
      { name: 'Bandcamp Daily review', url: 'https://daily.bandcamp.com/hidden-gems/mamman-sani-abdoulaye-la-musique-electronique-du-niger-review' },
      { name: 'Loncke 2009, Cahiers d\'ethnomusicologie (WoDaaBe songs)', url: 'https://core.ac.uk/download/224094287.pdf' },
      { name: 'SMEM: Elgam 244 combo organ, rhythm presets', url: 'https://www.smemmusic.ch/en/elgam-244-analog-combo-organ' },
      { name: 'Tende (drum)', url: 'https://en.wikipedia.org/wiki/Tende_(drum)' }
    ],
    trimDb: -5.1, // measured on 120 s renders, seeds 7, 3, 11: -20 LUFS integrated
    fx: { lp: 10000, hp: 80, drive: 1.9, bias: 0.12, wow: 0.0026, wowHz: 0.47, flutter: 0.0009, flutHz: 6.6, drift: 0.00035,
      rev: { rt60: 2.3, pre: 0.03, hf0: 10500, hf1: 2400 }, wet: 0.5, room: -50,
      echo: { time: 0.526, fb: 0.36, lp: 2300, hp: 280, wet: 0.9 } },
    init: function (I) {
      var r = I.r, S = {};
      S.beat = 60 / 76; S.bar = S.beat * 4; S.u = S.bar / 12;
      S.tonic = 62 + pick(r, [0, -2, 3]);
      S.ladder = [];
      for (var o = -1; o <= 2; o++) [0, 3, 5, 7, 10].forEach(function (d) { var m = S.tonic + o * 12 + d; if (m >= S.tonic - 5 && m <= S.tonic + 24) S.ladder.push(m); });
      S.org1 = I.bus({ gain: 0.5, pan: -0.22, send: 0.3, echo: 0.34, vib: { hz: 6.1, depth: 0.0026 } });
      S.org2 = I.bus({ gain: 0.32, pan: 0.32, send: 0.36, echo: 0.22, vib: { hz: 6.1, depth: 0.0026 } });
      S.drone = I.bus({ gain: 0.12, pan: 0.04, send: 0.4, echo: 0.04 });
      S.box = I.bus({ gain: 0.3, pan: 0.06, send: 0.12, echo: 0.05 });
      S.bars = 0; S.mt = I.t0 + S.bar * 0.75; S.queue = []; S.last = null; S.oct2 = 0;
      return S;
    },
    step: function (I, t, S) {
      var B = SAHEL_BOX, fill = S.bars % 8 === 7, claps = (S.bars % 8) >= 4;
      for (var k = 0; k < 12; k++) {
        var tk = t + k * S.u, tom = fill ? B.tomFill[k] : B.tom[k];
        if (tom) drum(I, S.box, tk, 'tom', tom);
        if (B.cga[k]) drum(I, S.box, tk, 'cga', B.cga[k]);
        if (B.shk[k]) drum(I, S.box, tk, 'shk', B.shk[k]);
        if (B.bd[k]) drum(I, S.box, tk, 'bd', B.bd[k]);
        if (claps && B.clap[k]) drum(I, S.box, tk, 'clap', B.clap[k]);
      }
      if (S.bars % 8 === 0) { // a held drone that shifts every 8 bars
        var ch = pick(I.r, [[0, 7], [0, 7], [-2, 5], [5, 12], [0, 7]]), d = S.bar * 8 + 0.4;
        organ(I, S.drone, t, S.tonic - 12 + ch[0], d, 0.6, { stops: { '8': 0.5, '4': 0.25 }, cut: 900, a: 0.8, rel: 0.9 });
        organ(I, S.drone, t, S.tonic - 12 + ch[1], d, 0.45, { stops: { '8': 0.5 }, cut: 900, a: 1.2, rel: 0.9 });
      }
      if (S.bars % 16 === 11) { // a pair a step apart rises and fades (after "Bodo")
        var pr = pick(I.r, [[5, 7], [3, 5], [7, 10]]);
        organ(I, S.org2, t, S.tonic + pr[0], S.bar * 2, 0.26, { stops: { '8': 0.5, '4': 0.2 }, cut: 1800, a: 2.4, rel: 2.2 });
        organ(I, S.org2, t + 0.3, S.tonic + pr[1], S.bar * 2, 0.22, { stops: { '8': 0.5, '4': 0.2 }, cut: 1800, a: 2.4, rel: 2.2 });
      }
      while (S.mt < t + S.bar) {
        if (!S.queue.length) sahelPhrase(I, S);
        var ev = S.queue.shift();
        if (ev.m != null) sahelNote(I, S, S.mt + rr(I.r, -0.012, 0.02), ev);
        S.mt += ev.u * S.u;
      }
      S.bars++; return t + S.bar;
    }
  };

  // ───────── track 2: Bolero del Segundo Piso (Frankie Reyes direction) ─────────
  var QUAL = { maj7: [0, 4, 7, 11], six: [0, 4, 7, 9], dom7: [0, 4, 7, 10], min7: [0, 3, 7, 10], min6: [0, 3, 7, 9], dim7: [0, 3, 6, 9] };
  var RN = { I: [0, 'maj7'], I6: [0, 'six'], I7: [0, 'dom7'], ii: [2, 'min7'], II7: [2, 'dom7'], iii: [4, 'min7'], III7: [4, 'dom7'],
    IV: [5, 'maj7'], iv: [5, 'min6'], V7: [7, 'dom7'], vi: [9, 'min7'], VI7: [9, 'dom7'], '#i': [1, 'dim7'] };
  var MAJ = [0, 2, 4, 5, 7, 9, 11];
  var A_T = [
    ['I', 'I', 'vi', 'vi', 'ii', 'V7', 'I', 'V7'],
    ['I', 'VI7', 'ii', 'V7', 'I', 'I7', 'IV', ['iv', 'V7']],
    ['I', ['#i', 'ii'], 'V7', 'V7', 'ii', 'V7', 'I', ['vi', 'V7']],
    ['I', 'I6', 'I7', 'IV', 'iv', 'I', 'II7', 'V7']
  ];
  var B_T = [
    ['I7', 'I7', 'IV', 'IV', 'II7', 'II7', 'ii', 'V7'],
    ['iii', 'VI7', 'ii', 'V7', 'iii', 'VI7', 'ii', 'V7'],
    ['vi', 'III7', 'vi', 'vi', 'II7', 'II7', ['ii', 'V7'], 'V7'],
    ['IV', 'iv', 'iii', 'VI7', 'ii', 'V7', ['iii', 'VI7'], ['ii', 'V7']]
  ];
  // two-bar rhythm cells, [start, length] in eighths over 16 eighths
  var CELLS = [
    [[0, 3], [3, 1], [4, 4], [8, 2], [10, 2], [12, 4]],
    [[1, 1], [2, 2], [4, 4], [8, 6], [14, 2]],
    [[0, 4 / 3], [4 / 3, 4 / 3], [8 / 3, 4 / 3], [4, 4], [8, 8]],
    [[0, 2], [2, 1], [3, 1], [4, 4], [8, 3], [11, 1], [12, 4]],
    [[2, 2], [4, 2], [6, 2], [8, 8]],
    [[0, 6], [6, 2], [8, 2], [10, 2], [12, 4]]
  ];
  function chordSym(sec, e) { var c = sec.harm[Math.floor(e / 8)]; return Array.isArray(c) ? (e % 8 < 4 ? c[0] : c[1]) : c; }
  function chordPcs(key, sym) { var rn = RN[sym]; return QUAL[rn[1]].map(function (x) { return (key + rn[0] + x) % 12; }); }
  function scalePcs(key, cp) { // key scale, bent toward the chord: drop natural notes beside an altered chord tone
    var sc = MAJ.map(function (x) { return (key + x) % 12; });
    cp.forEach(function (p) { if (sc.indexOf(p) < 0) sc = sc.filter(function (s) { return (s + 1) % 12 !== p && (p + 1) % 12 !== s; }); });
    cp.forEach(function (p) { if (sc.indexOf(p) < 0) sc.push(p); });
    return sc;
  }
  function boleroMelody(r, key, sec, plan, lo, hi, prev0, fromP) {
    var notes = [], prev = prev0 || key + ri(r, 4, 9);
    while (prev > hi) prev -= 12; while (prev < lo) prev += 12;
    for (var p = fromP || 0; p < 4; p++) {
      var cell = plan[p], base = p * 16, centre = clamp(key + ri(r, 3, 9), lo + 3, hi - 7), span = ri(r, 4, 9), arch = r() < 0.65;
      for (var j = 0; j < cell.length; j++) {
        var e = base + cell[j][0], len = cell[j][1], u = cell.length > 1 ? j / (cell.length - 1) : 0;
        var target = centre + span * (arch ? Math.pow(Math.sin(Math.PI * u), 0.8) : 1 - u) - 2;
        var cp = chordPcs(key, chordSym(sec, Math.floor(e))), strong = (e % 4 === 0) || len >= 2;
        var ok = strong ? cp : scalePcs(key, cp), last = j === cell.length - 1;
        if (last && p === 3) ok = sec.cadence === 'I' ? [key % 12, (key + 4) % 12] : [(key + 2) % 12, (key + 7) % 12, (key + 11) % 12];
        var best = prev, bc = 1e9;
        for (var m = lo; m <= hi; m++) {
          if (ok.indexOf(m % 12) < 0) continue;
          var leap = Math.abs(m - prev), cost = Math.abs(m - target) * 0.6 + leap * 0.5 + (leap > 7 ? 6 : 0) + (m === prev ? 3 : 0) + (leap === 1 || leap === 2 ? -0.8 : 0) + r() * 1.5;
          if (cost < bc) { bc = cost; best = m; }
        }
        notes.push({ e: e, len: len, m: best, strong: strong }); prev = best;
      }
    }
    return notes;
  }
  function boleroForm(I, S) {
    var r = I.r, key = S.key, A = pick(r, A_T), Bt = pick(r, B_T);
    var Aopen = A.slice(), Aclose = A.slice(0, 6).concat([['ii', 'V7'], 'I']);
    var planA = [pick(r, CELLS), pick(r, CELLS)], planB = [pick(r, CELLS), pick(r, CELLS), pick(r, CELLS)];
    planA = [planA[0], planA[1], planA[0], pick(r, CELLS)];
    planB = [planB[0], planB[1], planB[0], planB[2]];
    var lo = 64, hi = 83;
    var secA = { harm: Aopen, cadence: 'V' }, secA2 = { harm: Aclose, cadence: 'I' }, secB = { harm: Bt, cadence: 'V' };
    var melA = boleroMelody(r, key, secA, planA, lo, hi);
    // A' keeps A's tune and re-sets only the last phrase to land on the tonic
    var headA = melA.filter(function (n) { return n.e < 48; });
    var melA2 = headA.concat(boleroMelody(r, key, secA2, planA, lo, hi, headA.length ? headA[headA.length - 1].m : 0, 3));
    var melB = boleroMelody(r, key, secB, planB, lo, hi);
    var melA3 = melA2.map(function (n) { return { e: n.e, len: n.len, m: n.m, strong: n.strong }; });
    // a small variation on the return: one held note split into two
    for (var q = 0; q < melA3.length; q++) if (melA3[q].len >= 4 && r() < 0.35) { var nn = melA3[q]; melA3.splice(q + 1, 0, { e: nn.e + nn.len / 2, len: nn.len / 2, m: nn.m, strong: false }); nn.len /= 2; q++; }
    S.sections = [{ sec: secA, mel: melA }, { sec: secA2, mel: melA2 }, { sec: secB, mel: melB, thirds: true }, { sec: secA2, mel: melA3, thirds: true }];
    S.sbar = 0;
  }
  function voiceChord(cp, prevV) { // close voicing in A3..C5, nearest to the previous one
    var best = null, bc = 1e9;
    for (var inv = 0; inv < cp.length; inv++) {
      var v = [], base = 57;
      for (var k = 0; k < cp.length; k++) { var pc = cp[(inv + k) % cp.length], m = base + ((pc - base) % 12 + 12) % 12; if (v.length && m <= v[v.length - 1]) m += 12; while (v.length && m - v[v.length - 1] > 12) m -= 12; v.push(m); }
      if (v[v.length - 1] > 74) continue;
      var cost = 0; if (prevV) for (k = 0; k < v.length; k++) cost += Math.abs(v[k] - (prevV[k] || prevV[prevV.length - 1]));
      if (cost < bc) { bc = cost; best = v; }
    }
    return best || cp.map(function (p) { return 60 + p; });
  }
  var BOLERO = {
    id: 'bolero', title: 'Bolero del Segundo Piso', bpm: 74,
    blurb: 'A plinky two-oscillator synth sings an original bolero over the guitar-trio comb pattern, soft bass, music-box bells. After Frankie Reyes.',
    refs: [
      { name: 'Stones Throw: Boleros Valses y Mas', url: 'https://www.stonesthrow.com/news/frankie-reyes-boleros-valses-y-mas/' },
      { name: 'NPR on Frankie Reyes', url: 'https://www.npr.org/2016/08/24/491233462/simple-idea-spooky-result-latin-american-ballads-get-a-ghostly-makeover' },
      { name: 'LA Weekly on Gabriel Reyes-Whittaker', url: 'https://www.laweekly.com/electronic-boleros-and-difficult-techno-the-many-sounds-of-gabriel-reyes-whittaker/' },
      { name: 'El Bolero (Toledo course PDF, Spanish)', url: 'https://www.toledo.es/wp-content/uploads/mayores/Primer%20trimestre/Iniciaci%C3%B3n%20musical/musica-01%20El%20Bolero.pdf' },
      { name: 'EcuRed: Bolero (Spanish)', url: 'https://www.ecured.cu/Bolero' }
    ],
    trimDb: 1.2, // measured on 120 s renders, seeds 7, 3, 11: -20 LUFS integrated
    fx: { lp: 11000, hp: 105, drive: 1.6, bias: 0.08, wow: 0.0016, wowHz: 0.55, flutter: 0.0006, flutHz: 7.1, drift: 0.0003,
      rev: { rt60: 2.7, pre: 0.035, hf0: 11000, hf1: 2600 }, wet: 0.5, room: -52 },
    init: function (I) {
      var r = I.r, S = {};
      S.beat = 60 / 74; S.bar = S.beat * 4; S.e8 = S.beat / 2; S.key = pick(r, [65, 67, 63]);
      S.lead = I.bus({ gain: 0.4, pan: -0.08, send: 0.32 });
      S.lead2 = I.bus({ gain: 0.2, pan: 0.34, send: 0.36 });
      S.bell = I.bus({ gain: 0.3, pan: 0.42, send: 0.5 });
      S.comp = I.bus({ gain: 0.16, pan: 0.3, send: 0.26 });
      S.bass = I.bus({ gain: 0.19, pan: 0, send: 0.08 });
      S.shk = I.bus({ gain: 0.12, pan: -0.42, send: 0.14 });
      S.voicing = null; S.forms = 0;
      boleroForm(I, S); S.si = 0;
      return S;
    },
    step: function (I, t, S) {
      var r = I.r, sec = S.sections[S.si], bi = S.sbar, key = S.key, e8 = S.e8, sw = e8 * 0.06;
      function at(k) { return t + k * e8 + (k % 2 ? sw : 0) + rr(r, -0.006, 0.006); }
      var harm = sec.sec.harm[bi], c1 = Array.isArray(harm) ? harm[0] : harm, c2 = Array.isArray(harm) ? harm[1] : harm;
      if (c1 === 'I' && r() < 0.4) c1 = 'I6'; if (c2 === 'I' && c2 !== c1 && r() < 0.4) c2 = 'I6';
      // next bar's first chord, for a linking bass note
      var nsi = S.si, nb = bi + 1; if (nb >= 8) { nb = 0; nsi = (S.si + 1) % 4; }
      var nh = S.sections[nsi].sec.harm[nb], nxt = Array.isArray(nh) ? nh[0] : nh;
      function root(sym) { var m = key + RN[sym][0]; while (m > 56) m -= 12; while (m < 45) m += 12; return m; }
      // comb pattern: bass on 1, chord on the "and" (a quarter), chord, then bass-chord-bass-chord
      var v1 = voiceChord(chordPcs(key, c1), S.voicing), v2 = c2 === c1 ? v1 : voiceChord(chordPcs(key, c2), v1); S.voicing = v2;
      var reg = { stops: { '8': 0.4, '4': 0.18, '2': 0.06 }, reed: 0.12, cut: 3600, a: 0.006, rel: 0.07 };
      [[1, 1.6, 0.55, v1], [3, 0.8, 0.45, v1], [5, 0.8, 0.5, v2], [7, 0.8, 0.42, v2]].forEach(function (s) {
        s[3].forEach(function (m) { organ(I, S.comp, at(s[0]) + rr(r, 0, 0.008), m, s[1] * e8, s[2] * rr(r, 0.9, 1.05), reg); });
      });
      var r1 = root(c1), r2 = root(c2), last;
      if (nxt !== c2) { var nr = root(nxt); last = nr + pick(r, [-1, 1, -2, 2]); } else last = r2;
      bass(I, S.bass, at(0), r1, e8 * 3.6, 0.6); // the guitar's bass string rings into the second cell
      bass(I, S.bass, at(4), c2 === c1 ? r1 + (r1 + 7 > 55 ? -5 : 7) : r2, e8 * 1.7, 0.5);
      bass(I, S.bass, at(6), c2 === c1 && nxt === c2 ? r1 : last, e8 * 1.7, 0.46);
      [0.35, 0.15, 0.22, 0.15, 0.3, 0.15, 0.22, 0.15].forEach(function (v, k) { drum(I, S.shk, at(k), 'shk', v); });
      // the tune
      sec.mel.forEach(function (n) {
        if (Math.floor(n.e / 8) !== bi) return;
        var k = n.e - bi * 8, tt = t + k * e8 + (Math.round(k) % 2 && Math.abs(k - Math.round(k)) < 0.01 ? sw : 0) + rr(r, -0.008, 0.008), d = n.len * e8 * 0.92;
        lead(I, S.lead, tt, n.m, d, n.strong ? 0.5 : 0.4);
        if (n.len >= 2 && r() < 0.7 && n.m + 12 <= 98) fm(I, S.bell, tt + 0.004, n.m + 12, 0.16, { ratio: 3.5, index: 2.2, idecay: 0.12, decay: 1.6 });
        if (sec.thirds && n.len >= 1) { // trío habit: a third below
          var cp = chordPcs(key, chordSym(sec.sec, Math.floor(n.e))), ok = n.strong ? cp : scalePcs(key, cp);
          for (var dd = 3; dd <= 4; dd++) if (ok.indexOf((n.m - dd + 12) % 12) >= 0) { lead(I, S.lead2, tt + 0.012, n.m - dd, d, 0.3); break; }
        }
        if (n.len >= 6 && r() < 0.5) { // a music-box answer inside a long note
          var cpa = chordPcs(key, chordSym(sec.sec, Math.floor(n.e) + 3)), mm = n.m + 5, gap = S.beat / 3;
          for (var a = 0; a < 3; a++) { while (cpa.indexOf(mm % 12) < 0) mm++; fm(I, S.bell, tt + e8 * 3 + a * gap, mm, 0.12, { ratio: 3.5, index: 1.3, idecay: 0.08, decay: 1.4 }); mm++; }
        }
      });
      S.sbar++;
      if (S.sbar >= 8) {
        S.sbar = 0; S.si++;
        if (S.si >= 4) { S.si = 0; S.forms++; if (r() < 0.5) { S.key += pick(r, [5, -2, 2, -5, 3]); while (S.key > 69) S.key -= 12; while (S.key < 60) S.key += 12; } boleroForm(I, S); }
      }
      return t + S.bar;
    }
  };

  // ───────── track 3: Music for Concourses (Eno direction) ─────────
  var CONC_SETS = [ // aligned by index so the harmony drifts by step: Bb lydian -> G minor 9 -> Eb major 9 #11
    [46, 53, 62, 69, 72, 76, 77, 82],
    [43, 53, 62, 69, 70, 74, 77, 81],
    [51, 55, 62, 69, 70, 74, 77, 82]
  ];
  var CONC_LOOPS = [ // len and start in seconds; notes: [offset s, index into the set]
    { v: 'ep', notes: [[0, 0]], len: 23.9, start: 0.6, vel: 0.17, pan: 0, send: 0.5 },
    { v: 'piano', notes: [[0, 2]], len: 17.3, start: 2.2, vel: 0.55, pan: -0.35, send: 0.6 },
    { v: 'piano', notes: [[0, 3], [0.85, 4]], len: 21.7, start: 6.4, vel: 0.48, pan: 0.3, send: 0.6 },
    { v: 'vibe', notes: [[0, 6]], len: 19.9, start: 9.1, vel: 0.36, pan: 0.45, send: 0.65, trem: 4.4 },
    { v: 'vibe', notes: [[0, 5], [0.55, 4], [1.25, 3]], len: 26.3, start: 13.7, vel: 0.3, pan: -0.5, send: 0.65, trem: 4.9 },
    { v: 'half', notes: [[0, 1], [0.3, 2], [0.62, 4]], len: 29.1, start: 4.0, vel: 0.36, pan: -0.1, send: 0.55 },
    { v: 'choir', notes: [[0, 3]], len: 31.7, start: 15.5, vel: 0.7, pan: 0.15, send: 0.75 },
    { v: 'vibe', notes: [[0, 7]], len: 37.1, start: 21.0, vel: 0.22, pan: 0.6, send: 0.7, trem: 5.3 },
    { v: 'air', notes: [[0, 1]], len: 43.3, start: 0.2, vel: 0.5, pan: -0.25, send: 0.8, dur: 24 }, // a breath of air under the loops
    { v: 'air', notes: [[0, 3]], len: 51.7, start: 11.0, vel: 0.4, pan: 0.25, send: 0.8, dur: 28 }
  ];
  var CONCOURSE = {
    id: 'concourse', title: 'Music for Concourses', bpm: 0,
    blurb: 'Eight loops of 17 to 37 s that never line up: felt piano, vibraphone, one sung note, a half-speed tape, in a 4.6 s atrium. After Eno, Music for Airports.',
    refs: [
      { name: 'Wikipedia: Ambient 1: Music for Airports', url: 'https://en.wikipedia.org/wiki/Music_for_Airports' },
      { name: 'Reverb Machine: deconstructing Music for Airports', url: 'https://reverbmachine.com/blog/deconstructing-brian-eno-music-for-airports/' },
      { name: 'teropa: JavaScript Systems Music', url: 'https://teropa.info/blog/2016/07/28/javascript-systems-music' },
      { name: 'Acoustics 2021: shopping mall public spaces (RT 4-5 s)', url: 'https://doaj.org/article/6ed92bb16ca047529435842b01a73223' }
    ],
    trimDb: -1.6, // measured on 120 s renders, seeds 7, 3, 11: -20 LUFS integrated
    fx: { lp: 12000, hp: 40, comp: { th: -18, knee: 8, ratio: 2.5, att: 0.003, rel: 0.35 }, drive: 1.35, bias: 0.05, wow: 0.0012, wowHz: 0.31, flutter: 0.0004, flutHz: 5.3, drift: 0.0003,
      rev: { rt60: 4.6, pre: 0.045, hf0: 11000, hf1: 2400, build: 0.05 }, wet: 0.62, room: -56 },
    init: function (I) {
      var r = I.r, S = { set: 0, nextTide: I.t0 + rr(r, 170, 230) };
      S.loops = CONC_LOOPS.map(function (L) {
        var o = { gain: 1, pan: L.pan, send: L.send }; if (L.trem) o.trem = { hz: L.trem, depth: 0.32 };
        return { def: L, bus: I.bus(o), next: I.t0 + L.start, vel: L.vel * rr(r, 0.95, 1.05) };
      });
      return S;
    },
    step: function (I, t, S) {
      var w = 1.0, sets = CONC_SETS;
      if (t >= S.nextTide) { S.set = (S.set + 1) % sets.length; S.nextTide += rr(I.r, 170, 240); }
      S.loops.forEach(function (L) {
        while (L.next < t + w) {
          var d = L.def, tt = L.next, lvl = L.vel * rr(I.r, 0.94, 1.06); // tape machines drift a little in level
          d.notes.forEach(function (n) {
            var m = sets[S.set][n[1]], at = tt + n[0];
            if (d.v === 'piano') piano(I, L.bus, at, m, lvl * 0.85, { T: 6.5, bright: 0.82 });
            else if (d.v === 'half') piano(I, L.bus, at, m, lvl * 0.85, { half: true, T: 4, bright: 0.6 });
            else if (d.v === 'vibe') vibe(I, L.bus, at, m, lvl * 0.85);
            else if (d.v === 'choir') choir(I, L.bus, at, m, 4.5, lvl * 0.5);
            else if (d.v === 'ep') fm(I, L.bus, at, m, lvl, { ratio: 1, index: 1.0, idecay: 0.5, sus: 0.12, decay: 7, a: 0.01 });
            else if (d.v === 'air') pad(I, L.bus, at, m, d.dur, lvl * 0.1, { a: 8, r: 10, cut: 900 });
          });
          L.next += d.len;
        }
      });
      return t + w;
    }
  };

  // ───────── track 4: Fountain Court (kankyō ongaku direction) ─────────
  var F_LADDER = [60, 62, 65, 67, 69, 72, 74, 77, 79, 81, 84];
  var F_CHORDS = [[41, [57, 60, 64, 67]], [38, [57, 60, 64, 65]], [46, [57, 62, 64, 69]], [48, [55, 58, 62, 65]]];
  var F_ALT = [45, [55, 60, 64, 67]];
  function fFigure(r) {
    var f = [], i = ri(r, 4, 7);
    for (var k = 0; k < 8; k++) { f.push(i); i = clamp(i + pick(r, [-2, -1, 1, 2, 1, -1]), 3, 9); }
    f[ri(r, 1, 7)] = null; // one rest in the cycle
    return f;
  }
  var FOUNTAIN = {
    id: 'fountain', title: 'Fountain Court', bpm: 84,
    blurb: 'Two soft marimbas phase one 8-step figure, DX-style glass bells, long pad tones gliding to the bass, and a procedural fountain. After Takada, Yoshimura, Ashikawa, Hosono.',
    refs: [
      { name: 'Wikipedia: Kankyō Ongaku (Light in the Attic, 2019)', url: 'https://en.wikipedia.org/wiki/Kanky%C5%8D_Ongaku' },
      { name: 'The Outline: Kankyō Ongaku, Hosono Muji BGM', url: 'https://theoutline.com/post/7200/kankyo-ongaku-lights-in-the-attic-interview-review' },
      { name: 'Pen: Satoshi Ashikawa', url: 'https://pen-online.com/culture/satoshi-ashikawa-the-first-echoes-of-kankyo-ongaku' },
      { name: 'Wikipedia: Midori Takada', url: 'https://en.wikipedia.org/wiki/Midori_Takada' },
      { name: 'Wikipedia: Hiroshi Yoshimura', url: 'https://en.wikipedia.org/wiki/Hiroshi_Yoshimura' },
      { name: 'Tokyo Art Beat: Yoshimura exhibition (Japanese)', url: 'https://www.tokyoartbeat.com/articles/-/hiroshi-yoshimura-report-202305' }
    ],
    trimDb: -3.2, // measured on 120 s renders, seeds 7, 3, 11: -20 LUFS integrated
    fx: { lp: 11000, hp: 45, comp: { th: -16, knee: 8, ratio: 2, att: 0.003, rel: 0.3 }, drive: 1.4, bias: 0.06, wow: 0.0012, wowHz: 0.41, flutter: 0.0005, flutHz: 6.2, drift: 0.0003,
      rev: { rt60: 3.6, pre: 0.04, hf0: 11000, hf1: 2400 }, wet: 0.56, room: -54 },
    init: function (I) {
      var r = I.r, S = {};
      S.beat = 60 / 84; S.e8 = S.beat / 2; S.bar = S.beat * 4;
      S.fig = fFigure(r);
      S.A = { bus: I.bus({ gain: 0.55, pan: -0.3, send: 0.38 }), next: I.t0, per: S.e8, k: 0, oct: 0, v: 0.5 };
      S.B = { bus: I.bus({ gain: 0.55, pan: 0.32, send: 0.42 }), next: I.t0 + S.e8 * 0.5, per: S.e8 * (1 + 1 / 224), k: 0, oct: -12, v: 0.42 };
      S.padBus = I.bus({ gain: 0.062, pan: 0, send: 0.5 });
      S.low = I.bus({ gain: 0.3, pan: 0, send: 0.25 });
      S.bells = I.bus({ gain: 0.42, pan: 0.2, send: 0.7 });
      S.water = I.bus({ gain: 1, pan: -0.12, send: 0.3 });
      S.drops = [I.bus({ gain: 1, pan: -0.55, send: 0.4 }), I.bus({ gain: 1, pan: 0.05, send: 0.4 }), I.bus({ gain: 1, pan: 0.5, send: 0.4 })];
      fountain(I, S.water, -37);
      S.ci = 0; S.nextChord = I.t0; S.chordLen = S.bar * 4;
      S.nextBell = I.t0 + rr(r, 6, 11); S.nextDrop = I.t0;
      return S;
    },
    step: function (I, t, S) {
      var r = I.r, end = t + S.bar;
      function breath(tt) { return 0.6 + 0.4 * (0.5 - 0.5 * Math.cos(TAU * (tt - I.t0) / 96)); }
      [S.A, S.B].forEach(function (M) {
        while (M.next < end) {
          var st = S.fig[M.k % 8];
          if (st != null) marimba(I, M.bus, M.next, F_LADDER[st] + M.oct, M.v * breath(M.next) * rr(r, 0.9, 1.05), 0.9);
          M.k++; M.next += M.per;
          if (M === S.A && M.k % 64 === 0) { var j = ri(r, 0, 7); if (S.fig[j] != null) S.fig[j] = clamp(S.fig[j] + pick(r, [-1, 1]), 3, 9); } // additive mutation
        }
      });
      while (S.nextChord < end) {
        var ch = S.ci % 4 === 1 && r() < 0.3 ? F_ALT : F_CHORDS[S.ci % 4], tt = S.nextChord, d = S.chordLen + 1.5;
        ch[1].forEach(function (m, i) { pad(I, S.padBus, tt + i * 0.07, m, d, 0.5, { a: 3, r: 4, cut: 1200 }); });
        if (S.ci % 16 === 15) { // the Muji-BGM gesture: a build to a higher note, a glide down to the deep bass
          pad(I, S.padBus, tt, ch[1][3] + 12, d, 0.3, { a: 5, r: 4, cut: 1600 });
          glide(I, S.low, tt, ch[0] + 12, ch[0], d, 0.5);
        } else fm(I, S.low, tt, ch[0], 0.36, { ratio: 1, index: 0.8, idecay: 0.6, sus: 0.1, decay: 9, a: 0.02, dur: d });
        S.ci++; S.nextChord += S.chordLen;
      }
      while (S.nextBell < end) { // sparse postcard motifs
        var n = ri(r, 2, 4), i = ri(r, 6, 9), bt = S.nextBell;
        for (var k = 0; k < n; k++) { fm(I, S.bells, bt, F_LADDER[i] + 12, 0.22 * rr(r, 0.8, 1), { ratio: 3.5, index: 2.4, idecay: 0.2, decay: 3.2 }); bt += rr(r, 0.45, 0.9); i = clamp(i + pick(r, [-1, -2, 1]), 4, 10); }
        S.nextBell += rr(r, 14, 26);
      }
      while (S.nextDrop < end) { droplet(I, pick(r, S.drops), S.nextDrop, rr(r, 0.005, 0.016)); S.nextDrop += -Math.log(1 - r()) / 5; }
      return end;
    }
  };

  var DEFS = [SAHEL, BOLERO, CONCOURSE, FOUNTAIN];
  function byId(id) { for (var i = 0; i < DEFS.length; i++) if (DEFS[i].id === id) return DEFS[i]; return null; }

  // ───────── live playback ─────────
  var ctx = null, master = null, cur = null, curId = null, volume = 0.8, timer = null, suspendT = null;
  var LOOKAHEAD = 1.6, XFADE = 2.5;
  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'playback' });
      master = gn(ctx, volume * volume);
      var clip = ctx.createWaveShaper(); clip.curve = clipCurve(); master.connect(clip); clip.connect(ctx.destination);
    }
    if (ctx.state !== 'running') ctx.resume();
    if (!timer) timer = setInterval(function () { if (cur) cur.pump(ctx.currentTime + LOOKAHEAD); }, 150);
  }
  function retire(inst, dur) {
    inst.fadeTo(0, dur); inst.stopped = true;
    var tail = (inst.def.fx.rev.rt60 + dur + 1) * 1000;
    setTimeout(function () { inst.dispose(); }, tail);
  }
  var api = {
    tracks: DEFS.map(function (d) { return { id: d.id, title: d.title, blurb: d.blurb, refs: d.refs.slice(), bpm: d.bpm }; }),
    play: function (id) {
      var def = byId(id); if (!def) return false;
      ensure(); if (suspendT) { clearTimeout(suspendT); suspendT = null; }
      if (cur && curId === id) return true;
      if (cur) retire(cur, XFADE);
      cur = new Instance(ctx, master, def, (Date.now() ^ (Math.random() * 1e9)) >>> 0, true);
      cur.fadeTo(1, XFADE); cur.pump(ctx.currentTime + LOOKAHEAD); curId = id;
      return true;
    },
    stop: function () {
      if (!cur) return;
      retire(cur, 1.5); cur = null; curId = null;
      suspendT = setTimeout(function () { if (!cur && ctx) ctx.suspend(); suspendT = null; }, 7000);
    },
    setVolume: function (v) {
      volume = clamp(+v || 0, 0, 1);
      if (master) master.gain.setTargetAtTime(volume * volume, ctx.currentTime, 0.05);
    },
    now: function () { return curId; },
    _render: function (id, seconds, opts) {
      opts = opts || {};
      var def = byId(id), sr = opts.sampleRate || 48000, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var oc = new OAC(2, Math.ceil(sr * seconds), sr), m = gn(oc, opts.volume == null ? 1 : opts.volume);
      var clip = oc.createWaveShaper(); clip.curve = clipCurve(); m.connect(clip); clip.connect(oc.destination);
      var inst = new Instance(oc, m, def, opts.seed == null ? 1 : opts.seed, false);
      api._last = inst;
      inst.pump(LOOKAHEAD);
      // schedule the way live playback does: suspend every second, pump the next window, resume
      for (var k = 1; k < seconds; k++) (function (tk) {
        oc.suspend(tk).then(function () { try { inst.pump(tk + LOOKAHEAD); } finally { oc.resume(); } });
      })(k);
      return oc.startRendering();
    },
    _version: '1.0'
  };
  return api;
})();
