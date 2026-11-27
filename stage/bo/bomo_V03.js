// bomo.js: BO motion. Bo on the endless down-moving escalator, drawn by Desktop Bo's own engine (BZ).
// Contract (stage2/BRIEF.md "BO motion"):
//   BOMO.init(opts)  BOMO.tick(s)  BOMO.state()  BOMO.draw(ctx[, phaseNow])
// Classic script. Needs bz/*.js (font-data, raster, rex, cat, items, sound, world) and src/shared.js loaded first.
//
// How it works, in one paragraph: Bo lives in BELT coordinates. bb is her body centre along the belt in steps
// (world z = (bb - phase) * RUN), n is the step she stands on, x is lateral (world units). Standing still she rides
// the belt down toward the camera; to stay put she must climb. Every tick: (1) a behavior (climb, trot, backtrack,
// ride, groom, stretch, watch, sidestep, flinch) sets what she wants; (2) a motor either walks her on the tread with
// Desktop Bo's gaits (feet phase-locked to her speed over the tread, so nothing slides) or runs a hop (gather,
// push, air, land, settle) with escalator pose keys added to BZ.POSES; (3) cat.animate() eases the pose (BZ lerp,
// tail springs, tail gestures); (4) during hops the skeleton is pitched and the planted paws are used as anchors,
// so a pushing hind paw or a landing front paw never slides or sinks.
var BOMO = (function () {
  'use strict';
  const B = {};
  const G = PS.G, RUN = G.RUN, RISE = G.RISE;
  const TALL = 0.30, UNIT = TALL / 78, SPU = UNIT / RUN;      // world units per BZ unit; steps per BZ unit
  const FRAME = 33, DT = FRAME / 1000;
  const TURN = (6 / 256) * 2 * Math.PI * (FRAME / 45);        // world.js TURN (read_out: 6/256 turn per 45 ms)
  const GAIT = { walk: { a: 8.5, stance: 0.64, speed: 1.1 }, brisk: { a: 9.5, stance: 0.58, speed: 1.9 } }; // world.js GAITS
  const UP = -Math.PI / 2, DOWN = Math.PI / 2;                 // BZ heading: away from the camera / toward it
  const FRONT = 14, HIND = 11.5, NOSE = 33, RUMP = 20;         // stand pose extents along the body, BZ units (cat.js STAND)
  const WALK_STEPS = 1.1 * (0.85 + 0.15 * 0.85) * UNIT / RUN / DT; // Bo's walk over the tread, steps/s (tempo 0.85): ~0.296
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  let rnd = Math.random;
  const rr = (a, b) => a + rnd() * (b - a), ri = (n) => Math.floor(rnd() * n), chance = (p) => rnd() < p;
  const pick = (w) => { let s = 0; for (const k in w) s += Math.max(0, w[k] || 0); if (s <= 0) return null; let r = rnd() * s; for (const k in w) { r -= Math.max(0, w[k] || 0); if (r <= 0) return k; } return null; };

  // ── escalator pose keys, BZ pose format (cat.js P()): added to BZ.POSES at init ──
  // Bo's carriage (05-art-direction.md): tail low with an S and the tip up.
  const TAIL_BO = { tailEl: -38, tailCurl: 5.6, tailHook: 34, tailSide: 4, tailAmp: 5, tailSpeed: 0.07, tailWave: 0.55 };
  const TAIL_LASH = { tailEl: 16, tailCurl: -1, tailHook: 0, tailAmp: 30, tailSpeed: 0.36, tailWave: 0.7 }; // world.js tail mood 'lash'
  function addPoses() {
    const P = (o, modes) => Object.assign(BZ.clonePose(BZ.POSES.stand), TAIL_BO, o, { modes: Object.assign({ fl: 'ik', fr: 'ik', bl: 'ik', br: 'ik' }, modes || {}) });
    Object.assign(BZ.POSES, {
      escStand: P({ headPitch: 3 }),
      escLookUp: P({ headDX: -1, headDY: 1, headPitch: 17, earBack: -0.2, pupil: 0.6 }),            // sizing up the step above
      // hop up: gather (weight back on the haunches, eyes on the lip), push (hinds extend, forepaws fold up), air, land on the forepaws
      escGather: P({ hipX: -10, hipY: 22, chestX: 10, chestY: 22.5, backLift: 4, bellyLift: 1, headDX: 3, headDY: -2, headPitch: 12,
        fl: [13, 2.5, 4.2], fr: [13, 2.5, -4.2], bl: [-10.5, 2.5, 4.8], br: [-10.5, 2.5, -4.8], tailEl: -30, tailCurl: 3.4, tailHook: 18, tailAmp: 1.5, tailSpeed: 0.1, earBack: -0.15, pupil: 0.75 }),
      escPush: P({ hipX: -13, hipY: 33, chestX: 13, chestY: 37, backLift: 0.5, bellyLift: 2, headDX: 3, headDY: -1, headPitch: -2,
        fl: [16, 19, 4], fr: [15, 17, -4], flexFL: 1.2, flexFR: 1.2, bl: [-22, 2.5, 4.4], br: [-21, 2.5, -4.4], tailEl: -24, tailCurl: 3, tailHook: 14, tailAmp: 2, earBack: 0.1, pupil: 0.8 }),
      escAir: P({ hipX: -13, hipY: 27, chestX: 14, chestY: 29, backLift: 0.5, bellyLift: 2, headDX: 3, headDY: -2, headPitch: -6,
        fl: [17, 15, 4], fr: [16, 13, -4], flexFL: 1.1, flexFR: 1.1, bl: [-21, 5, 4.4], br: [-20, 4, -4.4], flexBL: 0.3, flexBR: 0.3,
        tailEl: -16, tailCurl: 3, tailHook: 20, tailAmp: 2, earBack: 0.2, pupil: 0.8 }),
      escReach: P({ hipX: -13, hipY: 27, chestX: 14, chestY: 28, backLift: 0.5, bellyLift: 2, headDX: 3, headDY: -3, headPitch: -6,
        fl: [25, 6, 4], fr: [24, 4.5, -4], flexFL: -0.2, flexFR: -0.2, bl: [-15, 10, 4.4], br: [-14, 9, -4.4], flexBL: 1.1, flexBR: 1.1,
        tailEl: -6, tailCurl: 2.6, tailHook: 24, tailAmp: 2, earBack: 0.2, pupil: 0.8 }),
      escLand: P({ hipX: -12, hipY: 30, chestX: 12, chestY: 23.5, backLift: 4, bellyLift: 2, headDX: 3, headDY: -6, headPitch: -8,
        fl: [17, 2.5, 4], fr: [17, 2.5, -4], bl: [-13, 8, 4.4], br: [-12, 7, -4.4], flexBL: 0.9, flexBR: 0.9, tailEl: 4, tailCurl: 1.6, tailHook: 22, tailAmp: 3, earBack: 0.1 }),
      escSettle: P({ hipY: 29.5, chestY: 28.5, backLift: 3, headDY: -2, headPitch: 0 }),
      // hop down: peer over the lip, push off, drop with the forepaws reaching
      escPeer: P({ hipX: -12, hipY: 29.5, chestX: 12, chestY: 25, backLift: 2, headDX: 5, headDY: -11, headPitch: -30,
        fl: [16.5, 2.5, 4], fr: [16.5, 2.5, -4], bl: [-12, 2.5, 4.4], br: [-12, 2.5, -4.4], tailEl: 8, tailCurl: 1.2, tailHook: 18, earBack: -0.1, pupil: 0.7 }),
      escDropPush: P({ hipX: -13, hipY: 30, chestX: 13, chestY: 27, headDX: 4, headDY: -8, headPitch: -20,
        fl: [20, 9, 4], fr: [19, 7, -4], flexFL: 0.8, flexFR: 0.8, bl: [-18, 2.5, 4.4], br: [-17, 2.5, -4.4], tailEl: 12, tailCurl: 1.4, tailHook: 20, pupil: 0.8 }),
      escDrop: P({ hipX: -13, hipY: 29, chestX: 13, chestY: 26, headDX: 4, headDY: -6, headPitch: -12,
        fl: [24, 0, 4], fr: [23, -1.5, -4], flexFL: -0.4, flexFR: -0.4, bl: [-19, 8, 4.4], br: [-18, 7, -4.4], flexBL: 0.9, flexBR: 0.9,
        tailEl: 20, tailCurl: 1.2, tailHook: 22, tailAmp: 3, earBack: 0.25, pupil: 0.8 }),
      // startle: Desktop Bo's flinch (arched, ears flat, mouth open), sprung off a crouch
      escFlinchPush: P({ hipY: 24, chestY: 21, chestX: 12, backLift: 6, headDX: -2, headDY: -8, headPitch: 4, earBack: 0.9, mouth: 0.6, pupil: 1,
        fl: [14, 6, 5], fr: [14, 5, -5], flexFL: 0.8, flexFR: 0.8, bl: [-14, 2.5, 5], br: [-14, 2.5, -5], tailEl: 40, tailCurl: 6, tailHook: 0, tailAmp: 2 }),
      escFlinch: Object.assign(BZ.clonePose(BZ.POSES.flinch), { tailEl: 50, tailCurl: 8 }),
      escSit: Object.assign(BZ.clonePose(BZ.POSES.sit), {}),
      // sitting down without the hind paws popping: hips drop back over planted hind paws (ik legs, hock folding),
      // so that when BZ's 'sit' leg mode takes over (hind paw at hips + 5) the paws are already there
      escSitDown: P({ hipX: -8, hipY: 15, chestX: 8, chestY: 26, backLift: 1, bellyLift: 0, headDX: -2, headDY: 1,
        fl: [10, 2.5, 3.4], fr: [10, 2.5, -3.4], bl: [-3, 2.5, 4.6], br: [-3, 2.5, -4.6], flexBL: 1.5, flexBR: 1.5, tailEl: -20, tailCurl: 2, tailHook: 10 }),
    });
  }

  // ── module state ──
  let O = null, cat = null, fake = null, T = 0;
  let ph = 0, lastPh = 0, belt = 0.5, flow = 0, shoppers = [], inp = null;
  let bb = 0.4, x = 0, th = UP, n = 0, yRel = 0, v = 0, pitch = 0;   // body in belt coordinates
  let motor = { kind: 'ground' };
  let beh = null, lastBeh = {}, energy = 0.55, label = 'stand';
  let want = null;
  let look = { yaw: 0, pitch: 0, w: 0, tgt: null, perk: 0, id: null };
  const pawW = { front: null, hind: null };   // last tick's world (b, x, yRel) of the front / hind paw pairs
  let anchor = null;                          // { which, b, x, tread }
  let tracks = [], nextId = 1;                // shoppers tracked across ticks
  let ev = [];
  let blinkN = 80, sb = 0, boVz = 0, zPrev = null, good = null;
  let stat = { slide: 0, clampZ: 0, popZ: 0 };

  const zNow = () => (bb - ph) * RUN;
  const hb = () => -Math.sin(th);             // heading component along the belt (+1 = up)
  function bLimits(level, heading) {          // where her centre may stand on tread `level` for this heading (paws on the tread, nose clear of the riser)
    const h = -Math.sin(heading), f = FRONT * SPU * h, k = -HIND * SPU * h, M = 0.025;
    let lo = level + M - Math.min(f, k), hi = level + 1 - M - Math.max(f, k);
    if (h > 0.2) hi = Math.min(hi, level + 0.985 - NOSE * SPU * h);
    if (h < -0.2) hi = Math.min(hi, level + 0.96 - RUMP * SPU * -h);
    return [lo, hi];
  }

  // ── init ──
  B.init = function (opts) {
    O = Object.assign({ homeZ: 0.45, zMin: 0.15, zMax: 1.15, xMax: 0.42, seed: 1, matchCamera: true, reduced: false, phase: 0, x: 0, z: null }, opts || {});
    rnd = O.seed != null ? mulberry(O.seed * 9973 + 17) : Math.random;
    addPoses();
    const noop = () => {};
    fake = { size: 1, items: [], cats: [], stage: { x: -1e6, y: -1e6, w: 2e6, h: 2e6 }, floorTop: -1e6, frame: 0,
      sound: { purr: noop, meow: noop, mew: noop, chirp: noop, trill: noop, hiss: noop, chatter: noop, play: noop, unlock: noop },
      pointer: { x: -999, y: -999, inside: false }, stimuli: [], scene: null, inSun: () => false, rel: () => ({ bond: 1, tension: 0 }) };
    cat = new BZ.Cat({ coat: 'bo', name: 'Bo', x: 0, y: 0, theta: UP }, fake);
    cat.think = noop; cat.state = 'idle'; cat.tailMood = 'esc'; cat.tailMoodT = 0;  // our own tail per pose; BZ's gestures still play
    cat.mood.grump = 0.1;
    fake.cats.push(cat);
    ph = lastPh = O.phase || 0; T = 0;
    const z0 = O.z != null ? O.z : O.homeZ;
    const b0 = z0 / RUN + ph; n = Math.floor(b0); bb = clamp(b0, n + 0.2, n + 0.62); yRel = n * RISE; x = O.x || 0; th = UP; v = 0; pitch = 0; // bb: as close to the asked z as a safe spot on that tread allows
    motor = { kind: 'ground' }; anchor = null; beh = null; lastBeh = {}; energy = 0.55; tracks = []; ev = []; nextId = 1;
    locks = [null, null, null, null]; fhold = null; boVz = 0; zPrev = null; good = null; blinkN = 80; sb = 0; label = 'stand';
    look = { yaw: 0, pitch: 0, w: 0, tgt: null, perk: 0, id: null, tw: 0, tYaw: 0, tPitch: 0 }; // a re-init starts clean
    nextMomentAt = Math.round(rr(2, 4) / DT); momentHist = []; momentCount = {}; frameKey = '';
    setBeh('climb', { treads: 2 });
    pawW.front = pawW.hind = null;
    cat.pose = BZ.clonePose(BZ.POSES.escStand);
    stat = { slide: 0, clampZ: 0, popZ: 0 };
    return B;
  };
  B.setReduced = (r) => { if (O) O.reduced = !!r; };

  // ── behaviors ──
  function setBeh(kind, p) {
    const was = beh && beh.moment, is = p && p.moment;
    if (was && !is) nextMomentAt = T + Math.round(rr(GAP[0], GAP[1]) / DT); // a moment just ended: some quiet climbing before the next
    beh = Object.assign({ kind, st: 'start', t: 0, k: 0 }, p || {}); lastBeh[kind] = T;
    if (B._trace) B._trace.push(kind + ' <- ' + (new Error().stack.split('\n')[2] || '').trim() + ' | ' + (new Error().stack.split('\n')[3] || '').trim());
  }
  // ── moments: what a viewer should catch within any minute. After a few seconds of climbing she picks one (weighted,
  //    the last two damped, the ones she has shown least boosted, so the order never settles into a cycle), trots up to
  //    the height it needs, and plays it riding the belt down; long ones get a hitch (up, a spring of two steps, settle again).
  const GAP = [2, 4];                                  // seconds of plain climbing between moments
  const MOMENTS = { ride: 2.6, groom: 2.8, stretch: 3.9, lookback: 3.6, backtrack: 3.4, watch: 2.6 }; // seconds of belt the first part needs
  let nextMomentAt = 0, momentHist = [], momentCount = {};
  function riderAhead() { let best = null, bd = 3.0; const z = zNow(); for (const t of tracks) { const dz = t.wz - z; if (dz > -0.3 && dz < bd && Math.abs(t.wx - x) < 1.3) { bd = dz; best = t; } } return best; }
  function chooseMoment() {
    const ks = Object.keys(MOMENTS), mean = ks.reduce((a, k) => a + (momentCount[k] || 0), 0) / ks.length, w = {};
    for (const k of ks) {
      let wk = 1 + 0.7 * Math.max(0, mean - (momentCount[k] || 0));
      if (momentHist[momentHist.length - 1] === k) wk *= 0.04; else if (momentHist[momentHist.length - 2] === k) wk *= 0.35;
      if (k === 'watch' && !riderAhead()) wk = 0; // only with someone to watch; the boost catches it up when a rider comes
      if (k === 'ride' || k === 'groom') wk *= 1.15;   // she is a sleepy cat
      if (O.reduced && (k === 'backtrack' || k === 'stretch')) wk *= 0.2;
      w[k] = wk;
    }
    return pick(w) || 'ride';
  }
  const momentZ = (k) => Math.min(zTop() - 0.14, zFloor() + MOMENTS[k] * beltW() + 0.03); // below the hop ceiling, so the dash never stalls
  function momentBeh(k) {
    if (k === 'ride') return { kind: 'ride', p: { moment: 'ride', segs: 2 + (chance(0.6) ? 1 : 0), loaf: chance(0.45) } };
    if (k === 'groom') return { kind: 'ride', p: { moment: 'groom', groom: true, segs: 2 + (chance(0.12) ? 1 : 0), dur2: 58 } };
    if (k === 'watch') { const r = riderAhead(); return { kind: 'watch', p: { moment: 'watch', who: r ? r.id : null, T: 80 + ri(30) } }; }
    if (k === 'lookback' && roomSec() < 3.4 && (zTop() - 0.14 - zFloor()) / beltW() < 3.4) { const sd = x > 0.05 ? -1 : x < -0.05 ? 1 : chance(0.5) ? 1 : -1; return { kind: 'ride', p: { moment: 'lookback', face0: UP + sd * 0.75, lookBack: true, segs: 2 } }; } // no room for a full turn: over the shoulder
    return { kind: k, p: { moment: k } };
  }
  function startMoment(k) {
    momentHist.push(k); if (momentHist.length > 6) momentHist.shift(); momentCount[k] = (momentCount[k] || 0) + 1;
    const next = momentBeh(k), zS = momentZ(k);
    if (zNow() < zS - 0.03) setBeh('trot', { zT: zS, then: next, dash: true }); else setBeh(next.kind, next.p); // the way up to a moment is a dash
  }
  // what to go back to after an interruption (a sidestep or a startle): a climb or trot keeps its target and queued plan
  function resumeOf(b) { if (!b) return null; if (b.resume) return b.resume; if (b.kind === 'trot' || b.kind === 'climb') return { kind: b.kind, p: { zT: b.zT, then: b.then, lift: b.lift, treads: b.treads } }; if (b.then) return { kind: 'trot', p: { zT: b.zT, then: b.then } }; return null; }
  function resume(b, fallback) { const r = b.resume; if (r) setBeh(r.kind, Object.assign({}, r.p)); else fallback(); }
  const since = (k) => (lastBeh[k] == null ? 1e9 : (T - lastBeh[k]) * DT);
  const cool = (k, s) => clamp(since(k) / s, 0, 1) ** 2;
  // how many seconds the belt needs to carry her from here to the bottom of the frame
  // the frame, read from PS.project / PS.CAM at runtime (the stage camera may change): the lowest z whose tread keeps
  // her feet inside the stage on every belt phase, and the highest z whose ear tips stay inside
  let frameZ = { lo: 0, hi: 9 }, frameKey = '';
  function frameBand() {
    const key = JSON.stringify(PS.CAM) + '|' + PS.W + 'x' + PS.H;
    if (key === frameKey) return frameZ;
    let lo = 0, hi = 9;
    for (let z = 0; z <= 2.5; z += 0.01) { let ok = true; for (let p = 0; p < 1; p += 0.125) { const P = PS.project(0, PS.treadY(z, p), z); if (!(P[2] > 0.05 && P[1] <= PS.H - 3)) { ok = false; break; } } if (ok) { lo = z; break; } }
    for (let z = lo; z <= 4; z += 0.01) { let ok = true; for (let p = 0; p < 1; p += 0.125) { const P = PS.project(0, PS.treadY(z, p) + TALL * 1.05, z); if (P[1] < 2) { ok = false; break; } } if (!ok) break; hi = z; }
    frameKey = key; frameZ = { lo, hi }; return frameZ;
  }
  const zFloor = () => Math.max(O.zMin, frameZ.lo) + 0.05;
  const zTop = () => Math.min(O.zMax, frameZ.hi);
  const beltW = () => Math.max(0.03, belt * RUN);                       // world units per second the belt carries her
  const roomSec = () => (zNow() - zFloor()) / beltW();
  // seconds of belt each stationary behavior needs (backtrack also drops a step); if she lacks the room she
  // first trots up to where it fits, then does it riding down through the middle of the frame
  const NEED = { ride: 2.2, groom: 3.6, stretch: 3.3, backtrack: 2.8, watch: 1.4 };
  const needZ = (k) => zFloor() + NEED[k] * beltW();
  function decide() {
    const z = zNow(), hi = z - zHome(), top = zTop() - 0.12;
    const fits = (k) => needZ(k) <= top;
    const w = {
      climb: 4.5,
      trot: (0.5 + flow * 0.22 + (hi < -0.15 ? 4 : 0) + (belt > 0.9 ? 3 : 0)) * (0.35 + energy) * cool('trot', 9),
      ride: fits('ride') ? (2.2 + (hi > 0.12 ? 2 : 0)) * (1.35 - energy) * cool('ride', 10) : 0,
      groom: fits('groom') ? 1.4 * cool('groom', 20) : 0,
      stretch: fits('stretch') ? 1.5 * cool('stretch', 25) : 0,
      backtrack: fits('backtrack') ? 1.5 * (0.5 + energy) * cool('backtrack', 18) : 0,
      watch: fits('watch') ? 1.1 * cool('watch', 8) : 0,
    };
    if (O.reduced) { w.trot *= 0.3; w.backtrack = 0; w.stretch *= 0.4; }
    const k = pick(w) || 'climb';
    if (k === 'climb') { setBeh('climb', { treads: 1 + ri(3) }); return; }
    if (k === 'trot') { setBeh('trot'); return; }
    const next = k === 'groom' ? { kind: 'ride', p: { groom: true } } : { kind: k, p: {} };
    if (z < needZ(k) - 0.02 || k === 'backtrack') setBeh('trot', { zT: k === 'backtrack' && chance(0.4) ? top + 0.04 : Math.min(top, needZ(k) + 0.04), then: next }); // up first (a backtrack starts just after a landing, near the lip), then the thing
    else setBeh(next.kind, next.p);
  }
  function zHome() { return Math.max(O.homeZ, zFloor() + 0.14) + 0.06 * Math.sin(T * 0.0021 + 1.3) + 0.03 * Math.sin(T * 0.0057); } // a slow wander around home (never below what the frame allows)

  // requested ground motion for this tick (behaviors fill it)
  function resetWant() { want = { th: th, v: 0, gait: 'walk', pose: 'escStand', ov: null, dir: 0, rate: 1, left: null, anim: null, pivot: false, anchor: null, back: false, yawn: false }; }
  const unitsPerTick = (stepsPerSec) => stepsPerSec * RUN / UNIT * DT;
  // walk on the current tread toward belt coordinate bt (heading th0). Returns true when there.
  function walkTo(bt, heading, stepsPerSec, gaitName) {
    const [lo, hi] = bLimits(n, heading); bt = clamp(bt, lo, hi);
    const dir = Math.sign(bt - bb) || 1, h = -Math.sin(heading);
    want.th = heading; want.gait = gaitName || 'walk';
    const left = Math.abs(bt - bb) / SPU;     // BZ units
    if (Math.abs(wrap(heading - th)) > 0.35) { want.v = 0; want.pivot = true; return false; }
    if (left < 0.6) { want.v = 0; return true; }
    if (dir * h <= 0) { want.v = unitsPerTick(WALK_STEPS * 0.55); want.left = left; want.back = true; return false; } // a step or two backward
    want.v = unitsPerTick(stepsPerSec); want.left = left; return false;
  }
  function turnTo(heading, dirSign, rate) { want.th = heading; want.v = 0; want.pivot = true; want.dir = dirSign || 0; want.rate = rate || 1; return Math.abs(wrap(heading - th)) < 0.05; }
  // a safe spot on this tread to pivot in (valid for every heading)
  const PIV_LO = 0.17, PIV_HI = 0.66;

  // climb rate needed to hold (or reach) target z, steps per second over the tread
  function needRate(zT) { return clamp(belt + 0.45 * (zT - zNow()) / RUN, 0.04, 4); }
  const hopSec = (style) => ({ normal: 22, bound: 17, double: 26 }[style] || 22) * DT + DT;

  function trotTarget(b) { return b.zT || Math.min(zTop() - 0.15, Math.max(zFloor() + 0.2, zHome() + (b.lift != null ? b.lift : 0.35))); }
  function planTread(trot) {
    const zT = trot ? trotTarget(beh) : zHome();
    const r = needRate(zT), tc = 1 / r;
    const bT = n + rr(0.64, 0.68), d = Math.max(0, bT - bb);
    const vw = WALK_STEPS * rr(0.9, 1.08), vb = WALK_STEPS * 1.7;
    const p = { bT, gait: 'walk', speed: vw, pause: 0, style: 'normal', k: 1, look: chance(0.45) };
    const ta = tc - hopSec('normal');
    if (!trot && d / vw <= ta) { p.pause = Math.min(ta - d / vw, 3.2); }
    else if (!beh.urgent && !beh.dash && d / vb <= ta && !(trot && chance(0.5))) { p.speed = trot ? vb : Math.max(vw, d / Math.max(0.05, ta)); p.gait = p.speed > WALK_STEPS * 1.25 ? 'brisk' : 'walk'; p.look = false; }
    else { // bound: brisk to a takeoff spot, long hops that land close to the next takeoff
      p.gait = 'brisk'; p.speed = vb; p.style = 'bound'; p.bT = Math.max(bb, n + (beh.urgent ? 0.3 : 0.44)); // urgent: spring from where she stands
      const far = zNow() < zT - 0.3 || r > 1.7;
      if ((far && chance(0.45)) || (trot && chance(beh.dash ? 0.5 : 0.22))) { p.style = 'double'; p.k = 2; }
    }
    if (beh.forceStyle) { p.style = beh.forceStyle; p.k = p.style === 'double' ? 2 : 1; p.gait = 'brisk'; p.speed = vb; p.pause = 0; p.bT = Math.max(bb, n + 0.42); } // test hook
    return p;
  }

  // ── hop motor ──
  const HOPS = { normal: [3, 3, 9, 3, 4], bound: [2, 3, 8, 2, 2], double: [4, 4, 13, 3, 3], startle: [1, 2, 9, 2, 3], down: [5, 2, 8, 3, 4], downQuick: [3, 2, 7, 2, 3], flinch: [0, 1, 7, 2, 4], aside: [2, 2, 7, 2, 3] };
  function startHop(k, style, o) {
    o = o || {};
    if (k > 0) { // the ceiling: never hop out of the top of the frame (gain = where she lands minus where she is)
      const head = zTop() - 0.05 - zNow(), gain = (kk) => (n + kk + 0.42 - bb) * RUN - (kk > 1 ? 0.45 : 0.35) * beltW(); // net of the belt during the flight
      if (k > 1 && head < gain(2)) { k = 1; style = 'bound'; }
      if (head < gain(1)) { if (!o.dx) return false; k = 0; style = 'aside'; o = Object.assign({}, o, { th1: th }); } // no headroom: a hop to the side instead
    }
    const S = HOPS[style];
    const m = { kind: 'hop', k, style, t: 0, Gt: S[0], Pt: S[1], At: S[2], Lt: S[3], St: S[4], n0: n, n1: n + k, x1: x + (o.dx || 0), H: 0, c1: bb, th0: th, th1: o.th1 != null ? o.th1 : th };
    if (k > 0) { m.c1 = m.n1 + (style === 'bound' ? rr(0.44, 0.52) : style === 'double' ? rr(0.36, 0.44) : rr(0.28, 0.36)); m.H = 0.055 + 0.03 * (k - 1); m.pitchUp = k > 1 ? 26 : 21; m.Hap = k > 1 ? 0.075 : style === 'bound' ? 0.07 : 0.066; } // Hap: apex height above the landing tread, world units
    else if (k < 0) { m.c1 = m.n1 + rr(0.56, 0.62); m.H = 0.035; }
    else { m.c1 = clamp(bb + (o.db || 0), ...bLimits(n, th)); m.H = 0.03; m.pitchUp = 8; m.us = 0.5; }
    const [lo, hi] = bLimits(m.n1, m.th1); m.c1 = clamp(m.c1, lo + 0.01, hi - 0.01);
    m.x1 = clamp(m.x1, -O.xMax, O.xMax);
    motor = m; cat.gait = null; v = 0;
    ev.push({ kind: k > 0 ? 'hop' : k < 0 ? 'hopDown' : 'jump', steps: k });
    return true;
  }
  // per tick, before animate: which pose and pitch this hop phase wants
  function hopPhase(m) {
    const t = m.t, up = m.k > 0 || m.style === 'aside', down = m.k < 0, fl = m.style === 'flinch';
    const p1 = m.Gt, p2 = p1 + m.Pt, p3 = p2 + m.At, p4 = p3 + m.Lt, p5 = p4 + m.St;
    if (t < p1) return { ph: 'gather', pose: up ? 'escGather' : 'escPeer', pitch: up ? 3 * (t + 1) / p1 : 0, k: 0.42, anchor: 'hind' };
    if (t < p2) { const u = (t - p1 + 1) / m.Pt; return { ph: 'push', pose: fl ? 'escFlinchPush' : up ? 'escPush' : 'escDropPush', pitch: up ? lerp(3, m.pitchUp, u) : down ? -8 * u : 0, k: 0.55, anchor: 'hind' }; }
    if (t < p3) { const u = (t - p2 + 1) / m.At;
      const pt = up ? lerp(m.pitchUp, -7, sstep(u)) : down ? -10 - 14 * Math.sin(Math.PI * Math.min(1, u * 1.1)) + 6 * u : 0;
      return { ph: 'air', u, pose: fl ? 'escFlinch' : up ? (u < 0.45 ? 'escAir' : 'escReach') : 'escDrop', pitch: pt, k: 0.38, anchor: null }; }
    if (t < p4) { const u = (t - p3) / m.Lt; return { ph: 'land', pose: fl ? 'escFlinch' : 'escLand', pitch: (up ? -7 : down ? -4 : 0) * (1 - u), k: 0.4, anchor: 'front' }; }
    if (t < p5) return { ph: 'settle', pose: fl ? 'escFlinch' : 'escSettle', pitch: 0, k: 0.3, anchor: 'front' };
    return null;
  }

  // ── skeleton helpers ──
  const IDX = () => BZ.IDX;
  function pitchSkel(deg) {
    if (Math.abs(deg) < 0.01) return;
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cy = 24;
    for (const vtx of cat.skel.pos) { if (!vtx) continue; const px = vtx[0], py = vtx[1] - cy; vtx[0] = px * c - py * s; vtx[1] = cy + px * s + py * c; }
    cat.skel.headPitch += a;
  }
  function pawsLocal(which) {
    const I = BZ.IDX, P = cat.skel.pos, a = which === 'front' ? [P[I.pawL], P[I.pawR]] : [P[I.bpL], P[I.bpR]];
    return { x: (a[0][0] + a[1][0]) / 2, y: (a[0][1] + a[1][1]) / 2, ymin: Math.min(a[0][1], a[1][1]), z: (a[0][2] + a[1][2]) / 2 };
  }
  function localToWorld(lx, lz) { const c = Math.cos(th), s = Math.sin(th); return { b: bb + lx * SPU * -s + lz * SPU * c, x: x + lx * UNIT * c + lz * UNIT * s }; }
  function recordPaws() {
    for (const w of ['front', 'hind']) { const L = pawsLocal(w), W = localToWorld(L.x, L.z); pawW[w] = { b: W.b, x: W.x, y: yRel + (L.ymin - 2.5) * UNIT }; }
    const I = BZ.IDX, P = cat.skel.pos; pawW.frontEach = [I.pawL, I.pawR].map((k) => worldOf(P[k]));
  }

  // ── foot lock: while a paw is in stance it holds its spot on the tread (the leg re-solves with BZ.ik2);
  //    in swing it blends from where it lifted off to where the gait puts it. Kills the slide of turns and pivots. ──
  const LEGS = [['pawL', 'wrL', 'elL', 'shL', 0.25, 1], ['pawR', 'wrR', 'elR', 'shR', 0.75, 1], ['bpL', 'hkL', 'knL', 'thL', 0, 0], ['bpR', 'hkR', 'knR', 'thR', 0.5, 0]];
  let locks = [null, null, null, null];
  function worldOf(l) { const c = Math.cos(th), s = Math.sin(th); return { b: bb + (l[0] * -s + l[2] * c) * SPU, x: x + (l[0] * c + l[2] * s) * UNIT }; }
  function localOf(w) { const c = Math.cos(th), s = Math.sin(th), dx = (w.x - x) / UNIT, dz = ((w.b - bb) * RUN) / UNIT; return [dx * c + dz * -s, dx * s + dz * c]; }
  function footLock() {
    if (motor.kind !== 'ground' || !cat.gait || !GAIT[cat.gait]) { locks = [null, null, null, null]; return; }
    const g = GAIT[cat.gait], I = BZ.IDX, P = cat.skel.pos;
    for (let i = 0; i < 4; i++) {
      const [pn, wn, en, rn, off, front] = LEGS[i], paw = P[I[pn]];
      const pl = (((cat.phase + off) % 1) + 1) % 1;
      let dx = 0, dz = 0;
      if (pl < g.stance) {
        if (!locks[i] || locks[i].mode !== 'st') locks[i] = { mode: 'st', W: worldOf(paw) };
        const L = localOf(locks[i].W); dx = L[0] - paw[0]; dz = L[1] - paw[2];
        const o = Math.hypot(dx, dz), CAP = 5;
        if (o > 0.01) { const k = (CAP * Math.tanh(o / CAP)) / o; if (k < 0.98) { dx *= k; dz *= k; locks[i].W = worldOf([paw[0] + dx, 0, paw[2] + dz]); } } // soft cap: past ~5 units the paw gives a little instead of wrenching the leg
        locks[i].dx = dx; locks[i].dz = dz;
      } else {
        if (locks[i] && locks[i].mode === 'st') locks[i] = { mode: 'sw', dx: locks[i].dx || 0, dz: locks[i].dz || 0 };
        if (locks[i] && locks[i].mode === 'sw') { const u = (pl - g.stance) / (1 - g.stance), k = 1 - sstep(u / 0.7); dx = locks[i].dx * k; dz = locks[i].dz * k; }
      }
      if (Math.abs(dx) + Math.abs(dz) < 0.01) continue;
      const W = P[I[wn]], R = P[I[rn]];
      paw[0] += dx; paw[2] += dz; W[0] += dx; W[2] += dz;
      const e = front ? BZ.ik2(R, W, 12, 12, -1) : BZ.ik2(R, W, 7.5, 10.5, 1);
      P[I[en]] = e;
    }
  }

  // gathering for a hop, the forepaws stay where they were planted; the body settles back over the haunches
  let fhold = null;
  function holdFront(hp) {
    if (!hp || hp.ph !== 'gather' || motor.k < 0) { fhold = null; return; }
    const I = BZ.IDX, P = cat.skel.pos;
    if (!fhold || fhold.m !== motor) fhold = { m: motor, W: [0, 1].map((i) => { const w = pawW.frontEach && pawW.frontEach[i]; return w || worldOf(P[I[LEGS[i][0]]]); }) };
    for (let i = 0; i < 2; i++) {
      const [pn, wn, en, rn] = LEGS[i], paw = P[I[pn]], W = P[I[wn]], R = P[I[rn]], L = localOf(fhold.W[i]);
      let dx = L[0] - paw[0], dz = L[1] - paw[2]; const o = Math.hypot(dx, dz); if (o > 7) { dx *= 7 / o; dz *= 7 / o; }
      paw[0] += dx; paw[2] += dz; W[0] += dx; W[2] += dz; P[I[en]] = BZ.ik2(R, W, 12, 12, -1);
    }
  }

  // ── shoppers: track, look, sidestep, brush ──
  function perceive() {
    const z = zNow(), nt = [];
    const free = tracks.slice();
    for (const s of shoppers) { // match each shopper to the nearest one seen last tick, to know who is who and how they move
      let bi = -1, bd = 0.25;
      free.forEach((t, i) => { const d = Math.hypot(t.wx - s.wx, t.wz - s.wz); if (d < bd) { bd = d; bi = i; } });
      let tr;
      if (bi >= 0) { tr = free.splice(bi, 1)[0]; tr.vz = lerp(tr.vz, s.wz - tr.wz, 0.5); tr.vx = lerp(tr.vx, s.wx - tr.wx, 0.5); tr.wx = s.wx; tr.wz = s.wz; tr.half = s.half || 0.18; }
      else tr = { id: nextId++, wx: s.wx, wz: s.wz, half: s.half || 0.18, vz: -belt * RUN * DT, vx: 0, seen: -1, looked: false };
      nt.push(tr);
    }
    tracks = nt;
    let threat = null, brush = null, interest = null, bi = 0;
    for (const t of tracks) {
      const dx = t.wx - x, dz = t.wz - z, lat = Math.max(0.35, t.half + 0.14);
      const vzRel = t.vz - boVz;   // against her average drift: climbing, she holds her place
      if (Math.abs(dx) < t.half + 0.035 && Math.abs(dz) < 0.1) brush = t;
      const closing = dz * vzRel < 0, ttc = closing ? Math.abs(dz) / Math.max(1e-4, Math.abs(vzRel)) : 1e9;
      // she sees what is ahead of her (and anything right beside her); a shopper coming up from behind is a surprise
      const ahead = dz * -Math.sin(th) > -0.06;
      const beside = Math.abs(dz) < 0.14 && dz * -Math.sin(th) > -0.03;
      if (Math.abs(dx) < lat && (beside || (closing && ahead && (ttc < 75 || Math.abs(dz) < 0.8) && Math.abs(dz) < 1.4))) { if (!threat || Math.abs(dz) < Math.abs(threat.wz - z)) threat = t; }
      // salience: near, moving relative to her, not already old news
      const d = Math.hypot(dx, dz);
      if (d < 1.4) { if (t.seen < 0) t.seen = T + 22 + ri(48); const age = T - t.seen, sal = (1.4 - d) * (age > 0 ? 1 : 0) * (age < 95 || d < 0.45 ? 1 : 0.15); if (sal > bi) { bi = sal; interest = t; } }
    }
    return { threat, brush, interest };
  }
  function lookAtWorld(tx, ty, tz, w) {   // head yaw / pitch overlay toward a world point (Bo's head ~23 units ahead, 48 up)
    const c = Math.cos(th), s = Math.sin(th);
    const hx = x + 23 * UNIT * c, hz = zNow() + 23 * UNIT * -s, hy = yRel - ph * RISE + 48 * UNIT;
    const dx = tx - hx, dz = tz - hz, dy = ty - hy;
    const df = dx * c + dz * -s, dl = dx * s + dz * c;
    let yaw = (Math.atan2(dl, df) * 180) / Math.PI; if (Math.abs(yaw) > 100) yaw = Math.sign(yaw) * 100;
    const pit = clamp((Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI * 0.8, -24, 30);
    look.tYaw = clamp(yaw, -78, 78); look.tPitch = pit; look.tw = w; look.tgt = [tx, ty, tz];
  }

  // ── the tick ──
  B.tick = function (s) {
    if (!cat) B.init();
    s = s || {};
    T++; cat.t++; fake.frame = T; ev = [];
    lastPh = ph; ph = s.phase != null ? s.phase : ph + (s.beltSpeed || 0) * DT;
    belt = s.beltSpeed != null ? s.beltSpeed : belt; flow = s.flow || 0; shoppers = s.shoppers || []; inp = s.input || null;
    housekeeping(); frameBand();
    resetWant(); look.tw = 0;
    const P = perceive();
    behave(P);
    // motor
    let hp = null;
    if (motor.kind === 'hop') { hp = hopPhase(motor); if (!hp) { endHop(); } else if (hp.ph === 'gather' || hp.ph === 'push') look.tw = 0; }
    if (motor.kind === 'ground') locomote(); else { cat.gait = null; v = 0; }
    // pose for this tick
    if (hp) { composePose(hp.pose, hopOverlay(hp)); pitch = hp.pitch; }
    else { pitch = 0; if (want.anim) { cat.anim = want.anim; } else composePose(want.pose, want.ov); }
    cat.state = hp && hp.ph !== 'settle' ? 'react' : beh && beh.kind === 'flinch' && beh.t < 40 ? 'flinch' : 'idle';
    if (want.anim === 'stretch' && beh && beh.speed) cat.strT = (cat.strT || 0) + (beh.speed - 1);
    cat.yawn = want.yawn && !hp;
    sitHandover();
    cat.animate();
    if (hp && hp.k) { BZ.lerpPose(cat.pose, BZ.POSES.escNow, hp.k * 0.6); cat.skel = BZ.buildSkeleton(cat.pose, cat.t, cat.tail, cat.shape); }
    pitchSkel(pitch);
    footLock();
    place(hp);
    holdFront(hp);
    if (hp) motor.t++;
    if (beh) beh.t++;
    guard();
    if (!(isFinite(bb) && isFinite(x) && isFinite(th) && isFinite(yRel))) { // self-heal a bad tick: back to the last good one, on her feet
      if (good) ({ bb, x, th, n, yRel } = good); else { n = Math.floor(O.homeZ / RUN + ph); bb = n + 0.4; x = 0; th = UP; yRel = n * RISE; }
      motor = { kind: 'ground' }; anchor = null; pitch = 0; cat.pose = BZ.clonePose(BZ.POSES.escStand); cat.skel = BZ.buildSkeleton(cat.pose, cat.t, cat.tail, cat.shape); stat.heal = (stat.heal || 0) + 1; setBeh('climb', { treads: 1 });
    } else good = { bb, x, th, n, yRel };
    { const z = zNow(); if (zPrev != null) boVz = lerp(boVz, z - zPrev, 0.04); zPrev = z; }
    recordPaws();
    label = hp ? 'hop:' + motor.style + ':' + hp.ph : beh ? beh.kind + (beh.st ? ':' + beh.st : '') : 'stand';
  };

  // leaving BZ's 'sit' leg mode (hind paw at hips + 5) for ik legs: start the ik paws where the sit put them, no pop
  function sitHandover() { // leaving BZ's sit or tuck leg modes for ik: start the ik paws where those modes put them, no pop
    const pz = cat.pose, M = pz.modes; if (!M) return;
    const a = cat.anim, tm = (a === 'escNow' ? BZ.POSES.escNow.modes : a === 'groom' ? BZ.POSES.sit.modes : (BZ.POSES[a] || BZ.POSES.stand).modes) || {};
    const nm = Object.assign({}, M); let did = false;
    for (const [k, sd, hind] of [['fl', 1, 0], ['fr', -1, 0], ['bl', 1, 1], ['br', -1, 1]]) {
      const m = M[k] || 'ik'; if (m === 'ik' || m === 'flat' || m === (tm[k] || 'ik')) continue;
      if (m === 'sit') pz[k] = [pz.hipX + 5, 2.5, sd * 4.6 * 0.95];             // BZ sit: hind paw at hips + 5
      else if (hind) pz[k] = [pz.hipX + 6, 2.5, sd * 4.6 * 1.05];              // tuck / hide (loaf)
      else pz[k] = [pz.chestX + 6, 2.5, sd * 4.6 * 0.55];
      if (hind) { if (sd > 0) pz.flexBL = 1.5; else pz.flexBR = 1.5; }
      nm[k] = 'ik'; did = true;
    }
    if (did) pz.modes = nm;
  }
  function housekeeping() {
    if (--blinkN <= 0) { cat.blink = 3; blinkN = 70 + ri(220); }
    if (cat.blink > 0) cat.blink--;
    if (sb > 0) { sb--; const u = 34 - sb; cat.slowBlink = u < 12 ? u / 12 : u < 22 ? 1 : (34 - u) / 12; } else cat.slowBlink = 0;
    if (cat.flickT > 0) cat.flickT--; if (cat.earT > 0) cat.earT--; if (cat.mouthT > 0) cat.mouthT--;
    cat.mood.grump += (0.1 - cat.mood.grump) * 0.004;
    energy = clamp(energy + (beh && (beh.kind === 'ride' || beh.kind === 'watch') ? 0.0009 : motor.kind === 'hop' ? -0.0006 : -0.00015), 0.05, 1);
  }

  function composePose(key, ov) {
    const p = BZ.clonePose(BZ.POSES[key] || BZ.POSES.escStand);
    ov = ov || {};
    if (ov.tail) Object.assign(p, ov.tail);
    // look overlay (eased in its own state so heads turn smoothly)
    look.yaw = lerp(look.yaw, look.tw ? look.tYaw : 0, 0.16); look.pitch = lerp(look.pitch, look.tw ? look.tPitch : 0, 0.14); look.w = lerp(look.w, look.tw || 0, 0.12);
    p.headYaw += look.yaw * look.w; p.headPitch += look.pitch * look.w;
    if (Math.abs(look.yaw * look.w) > 40) p.headDX -= 2;
    p.earBack += -0.25 * look.w + (ov.earBack || 0);
    p.headYaw += ov.yaw || 0; p.headPitch += ov.pitch || 0; p.headRoll += ov.roll || 0; p.headDY += ov.headDY || 0;
    if (ov.stepFL) p.fl = [p.fl[0], p.fl[1] + ov.stepFL, p.fl[2]];
    if (ov.stepFR) p.fr = [p.fr[0], p.fr[1] + ov.stepFR, p.fr[2]];
    if (ov.lid != null) p.lid = Math.max(p.lid, ov.lid);
    if (ov.mouth) p.mouth = ov.mouth;
    BZ.POSES.escNow = p; cat.anim = 'escNow';
  }
  function hopOverlay(hp) {
    const ov = { pitch: -hp.pitch * 0.75 }; // the head stays nearly level through the jump, eyes on the landing (gaze fixation)
    if (beh && beh.kind === 'flinch') { ov.earBack = 0.6; if (motor.style === 'startle') ov.mouth = hp.ph === 'push' ? 0.8 : 0; }
    return ov;
  }

  // ground locomotion: turn toward want.th, move along the heading at the eased speed; feet phase-locked to the tread
  function locomote() {
    let d = wrap(want.th - th);
    if (want.dir && Math.abs(d) > 2.4) d = want.dir * Math.abs(d);
    if (want.pivot && Math.abs(d) > 0.02) {
      // pivot (world.js steer): head leads, little steps on the spot. Bo turns slower than BZ's 0.13 rad/tick and steps
      // quicker (cycle ~10 ticks) so each planted paw only holds through ~0.35 rad of turn (the foot lock does the rest)
      const r = 0.068 * want.rate;
      th = wrap(th + clamp(d, -r, r)); cat.gait = 'walk'; cat.strideK = 0.3; cat.phase += 0.1 * Math.max(1, want.rate); cat.leadYaw = clamp(d * 40, -35, 35); v *= 0.7;
    } else {
      th = wrap(th + clamp(d, -TURN * 0.6, TURN * 0.6)); // walking turns: Bo's arc is lazier than BZ's
      if (want.v > 0 && Math.abs(d) > 0.02) cat.leadYaw = clamp(d * 50, -30, 30);
      let vt = want.v; if (Math.abs(d) > 1) vt *= 0.35;
      if (want.left != null) vt = Math.min(vt, 0.3 + want.left * 0.06);
      v += (vt - v) * (vt < v * 0.5 ? 0.22 : want.gait === 'brisk' ? 0.14 : 0.09); // she stops quicker than she starts
      if (want.left != null) v = Math.min(v, want.left);
      if (vt === 0 && v < 0.05) v = 0;
      const sg = want.back ? -1 : 1;
      if (v > 0) {
        const c = Math.cos(th), s = Math.sin(th);
        bb += sg * v * SPU * -s; x += sg * v * UNIT * c;
      }
      if (v > 0.04) { const g = GAIT[want.gait] || GAIT.walk; cat.gait = want.gait; cat.strideK = clamp(v / g.speed, 0.35, 1.1); cat.phase += sg * (g.stance * (v + 0.05)) / (2 * g.a * cat.strideK); } // backing up: the walk cycle runs in reverse
      else cat.gait = null;
    }
    // stay on the tread and on the escalator
    const [lo, hi] = bLimits(n, th);
    if (bb < lo || bb > hi) { const nb = clamp(bb, lo, hi); if (Math.abs(nb - bb) > 0.004) stat.slide++; bb = lerp(bb, nb, 0.5); if (Math.abs(nb - bb) < 0.002) bb = nb; v = Math.min(v, 0.2); }
    const xm = O.xMax;
    if (Math.abs(x) > xm) { x = clamp(x, -xm, xm); }
    cat.curV = v;
    yRel = n * RISE;
  }

  // place the origin after the skeleton is built: anchors for planted paws, ballistic flight in the air
  function place(hp) {
    if (!hp) { // sitting down / getting up: the forepaws stay where they are and the body moves over them
      if (want.anchor && motor.kind === 'ground' && !cat.gait) {
        const key = 'g:' + want.anchor + ':' + (beh ? beh.kind + beh.st : '');
        if (!anchor || anchor.key !== key) { const pw = pawW[want.anchor]; anchor = { key, b: pw ? pw.b : bb, x: pw ? pw.x : x }; }
        const L = pawsLocal(want.anchor), c = Math.cos(th), s = Math.sin(th), [lo, hi] = bLimits(n, th);
        bb = clamp(anchor.b - (L.x * SPU * -s + L.z * SPU * c), lo, hi); x = clamp(anchor.x - (L.x * UNIT * c + L.z * UNIT * s), -O.xMax, O.xMax);
      } else anchor = null;
      return;
    }
    const m = motor;
    if (hp.ph === 'air') {
      anchor = null;
      if (m.b0 == null) { m.b0 = bb; m.y0 = yRel; m.x0 = x; }
      const L = pawsLocal('front');
      const yEnd = m.n1 * RISE + (2.5 - L.ymin) * UNIT;
      const u = hp.u;
      bb = lerp(m.b0, m.c1, u); x = lerp(m.x0, m.x1, u);
      if (m.th1 !== m.th0) { const dth = wrap(m.th1 - th), r = 0.16; th = wrap(th + clamp(dth, -r, r)); cat.leadYaw = clamp(dth * 40, -30, 30); } // squaring up in the air
      if (m.k > 0 && m.Hap) { // ballistic: apex Hap above the landing, so it comes late (u* ~0.7) and she clears the lip early
        const D = Math.max(0.02, yEnd - m.y0), Hh = m.Hap, us = (D + Hh - Math.sqrt((D + Hh) * Hh)) / D, Bq = (D + Hh) / (us * us);
        yRel = m.y0 + 2 * Bq * us * u - Bq * u * u;
      } else if (m.k < 0) { const D = yEnd - m.y0, c = 0.35 * RISE; yRel = m.y0 + c * u + (D - c) * u * u; } // off the lip: a small lift, then gravity
      else yRel = lerp(m.y0, yEnd, u) + 4 * m.H * u * (1 - u);
      return;
    }
    const which = hp.anchor || 'front';
    const key = which + ':' + hp.ph;
    if (!anchor || anchor.key !== key) {
      const pw = pawW[which];
      const b0 = pw ? pw.b : bb, x0 = pw ? pw.x : x;
      const lvl = hp.ph === 'gather' || hp.ph === 'push' ? m.n0 : m.n1;
      anchor = { key, b: clamp(b0, lvl + 0.002, lvl + 0.998), x: x0, tread: lvl * RISE };
    }
    const L = pawsLocal(which), c = Math.cos(th), s = Math.sin(th);
    bb = anchor.b - (L.x * SPU * -s + L.z * SPU * c);
    x = anchor.x - (L.x * UNIT * c + L.z * UNIT * s);
    yRel = anchor.tread + (2.5 - L.ymin) * UNIT;
  }
  function endHop() {
    const m = motor;
    n = m.n1; yRel = n * RISE; motor = { kind: 'ground' }; anchor = null; pitch = 0;
    const [lo, hi] = bLimits(n, th); if (bb < lo - 0.01 || bb > hi + 0.01) stat.slide++;
    ev.push({ kind: 'land', steps: m.k });
  }

  function guard() {
    const z = zNow();
    if (z < O.zMin) { stat.popZ++; }
    if (Math.abs(x) > O.xMax + 1e-6) x = clamp(x, -O.xMax, O.xMax);
  }

  // ── behavior layer ──
  function interruptible() { return motor.kind === 'ground' && beh && !['flinch'].includes(beh.kind); }
  function behave(P) {
    const z = zNow();
    // shoppers first: a brush startles her, a shopper in her lane moves her aside, a passer-by gets a look
    if (P.brush && motor.kind === 'ground' && !(beh && beh.kind === 'flinch') && since('flinch') > 3) {
      setBeh('flinch', { from: P.brush.id, side: Math.sign(x - P.brush.wx) || (x > 0 ? -1 : 1), resume: resumeOf(beh) });
    } else if (P.threat && interruptible() && beh.kind !== 'sidestep' && !(beh.kind === 'backtrack' && beh.st === 'down') && roomSec() > 0.6) {
      const t = P.threat, lat = Math.max(0.35, t.half + 0.16);
      let side = Math.sign(x - t.wx) || (x > 0 ? -1 : 1), xT = t.wx + side * lat;
      if (Math.abs(xT) > O.xMax) { side = -side; xT = t.wx + side * lat; }
      if (Math.abs(xT) <= O.xMax && Math.abs(xT - x) > 0.04) setBeh('sidestep', { xT, from: t.id, prev: beh.kind, side: Math.sign(xT - x), low: beh.kind === 'ride' && beh.st === 'sit', resume: resumeOf(beh) });
    }
    if (P.interest && beh.kind !== 'flinch') {
      const t = P.interest; lookAtWorld(t.wx, (Math.floor(t.wz / RUN + ph) - ph) * RISE + 0.85, t.wz, beh.kind === 'groom' ? 0 : 1);
      look.id = t.id;
      if (false) { t.looked = true; setBeh('watch', { who: t.id, T: 30 + ri(40) }); }
    }
    // player input (game mode): up = trot, down = backtrack, lat = drift
    if (inp && motor.kind === 'ground') {
      if (inp.down && beh.kind !== 'backtrack') setBeh('backtrack', { hold: true });
      else if (inp.up && !inp.down && !['trot', 'flinch', 'sidestep'].includes(beh.kind)) setBeh('trot', { hold: true, lift: 0.6 });
      else if (!inp.up && !inp.down && Math.abs(inp.lat || 0) > 0.1 && ['ride', 'stretch', 'watch'].includes(beh.kind)) setBeh('climb', { treads: 2 });
    }
    // too close to the bottom of the frame: get up and climb, whatever she was doing
    if ((z < zFloor() + 0.02 || roomSec() < 0.5) && beh.kind === 'trot' && !beh.urgent) { beh.urgent = true; if (beh.st === 'go' || beh.st === 'wait') beh.st = 'plan'; } // a stroll this low becomes a bound
    const gettingUp = (beh.kind === 'ride' && (['rise', 'up'].includes(beh.st) || (beh.preHop && !beh.preHopped))) || (beh.kind === 'lookback' && beh.st === 'back');
    if ((z < zFloor() + 0.02 || roomSec() < 0.5) && interruptible() && !gettingUp && !['trot', 'sidestep', 'flinch'].includes(beh.kind) && !(beh.kind === 'backtrack' && ['turn2', 'stop2'].includes(beh.st))) {
      if (beh.kind === 'backtrack' && beh.st === 'down') { beh.st = 'stop2'; beh.t = 0; }
      else if (beh.kind !== 'backtrack') setBeh('trot', { lift: 0.12, urgent: true });
    }
    if (motor.kind === 'hop' && beh.kind !== 'flinch') return; // a hop runs to the end before anything else is decided
    const f = BEH[beh.kind]; if (f) f(beh); else decide();
  }

  // shared: get up from a low pose before moving off
  function rising(b) { if (b.rise == null) b.rise = 0; if (b.low) { b.rise++; want.pose = 'escStand'; if (b.rise < 8) return true; b.low = false; } return false; }
  function faceUpThen(b, rate) { // make sure she is on her feet, facing up the belt, in a pivot-safe spot
    const dU = wrap(th - UP);
    if (Math.abs(dU) > 0.06 && Math.abs(dU) < 1.25 && bb > n + 0.42 && zTop() - 0.05 - zNow() > (n + 1.42 - bb) * RUN - 0.35 * beltW()) { startHop(1, 'normal', { th1: UP }); return false; } // near the riser and roughly facing up: hop the step and square up in the air
    if (Math.abs(dU) > 0.06) {
      if (bb < n + PIV_LO - 0.01 || bb > n + PIV_HI + 0.01) { walkTo(clamp(bb, n + PIV_LO + 0.02, n + PIV_HI - 0.02), th, WALK_STEPS); return false; }
      turnTo(UP, b && b.side ? -b.side : x > 0 ? -1 : 1, rate || (roomSec() < 2.2 ? 1.7 : 1)); return false;
    }
    return true;
  }
  function lateralWant() { // input drift, or a slow wander across the treads
    if (inp && Math.abs(inp.lat || 0) > 0.1) return clamp(inp.lat, -1, 1) * 0.75;
    if (O.reduced) return 0;
    if (Math.abs(x) > 0.3) return -Math.sign(x) * 0.4;                                  // back toward the middle of the treads
    const w = Math.sin(T * 0.0021 + 0.7) * Math.sin(T * 0.00077 + 2.1);                 // now and then she angles across a few treads
    return Math.abs(w) > 0.42 ? Math.sign(w) * 0.4 : 0;
  }

  const BEH = {
    climb(b) { climbLike(b, false); },
    trot(b) { climbLike(b, true); },
    watch(b) {
      want.pose = 'escStand';
      if (b.who === 'nearest') { let bd = 9; for (const q of tracks) { const d = Math.hypot(q.wx - x, q.wz - zNow()); if (d < bd) { bd = d; b.who = q.id; } } }
      const t = tracks.find((q) => q.id === b.who);
      if (t) lookAtWorld(t.wx, (Math.floor(t.wz / RUN + ph) - ph) * RISE + 0.85, t.wz, 1);
      else { if (!b.amb) b.amb = pickAmbient(); lookAtWorld(...b.amb, 1); }
      if (b.t === 12 && chance(0.4)) cat.tailGesture('flick');
      if (b.t > (b.T || 60) || roomSec() < 0.8) {
        if (b.moment && b.t > 40 && t && roomSec() < 1.2) { setBeh('ride', { moment: 'watch', watchWho: t.id, preHop: true, face0: 'up', durForce: 90 }); return; } // up two steps, sit, keep watching
        setBeh('climb', { treads: 1 + ri(2) });
      }
    },
    sidestep(b) {
      if (rising(b)) return;
      const t = tracks.find((q) => q.id === b.from);
      if (t) lookAtWorld(t.wx, (Math.floor(t.wz / RUN + ph) - ph) * RISE + 0.8, t.wz, 0.8);
      const dx = b.xT - x;
      if (b.st === 'start') {
        if (Math.abs(dx) < 0.025 || b.t > 75) { b.st = 'straighten'; b.t = 0; }
        else if (bb > n + 0.5 && Math.abs(wrap(th - UP)) < 1.25) { startHop(1, 'normal', { dx: clamp(dx, -0.14, 0.14), th1: UP + Math.sign(dx) * 0.25 }); b.hopped = (b.hopped || 0) + 1; if (b.hopped > 1 || Math.abs(dx) < 0.15) { b.st = 'straighten'; b.t = 0; } }
        else { const ang = UP + Math.sign(dx) * 1.0; const [lo, hi] = bLimits(n, ang); const room = bb > lo && bb < hi;
          want.th = room ? ang : th; want.v = room ? unitsPerTick(WALK_STEPS * 1.7) : 0; want.gait = 'brisk'; want.left = Math.abs(dx) / UNIT / Math.max(0.3, Math.abs(Math.cos(th))); if (!room) { walkTo(n + 0.42, th, WALK_STEPS * 1.4, 'brisk'); } }
        return;
      }
      if (faceUpThen(b)) resume(b, () => setBeh(b.prev === 'trot' ? 'trot' : 'climb', { treads: 1 + ri(2) }));
    },
    flinch(b) {
      if (b.t === 0) {
        const facingUp = Math.abs(wrap(th - UP)) < 0.5;
        if (facingUp && roomSec() < 1.6 && bb > n + 0.3 && startHop(1, 'startle', { dx: b.side * 0.06 })) { b.up = true; }
        else startHop(0, 'flinch', { dx: b.side * 0.075 });
        cat.mood.grump = Math.min(1, cat.mood.grump + 0.3); cat.flickT = 20; ev.push({ kind: 'flinch' }); }
      if (motor.kind === 'hop') return;
      if ((roomSec() < 0.9 || b.up) && b.t > 14) { if (b.resume && b.resume.p.then) resume(b); else setBeh('trot', { lift: 0.15, urgent: true }); return; }
      if (b.t < 40) { want.pose = 'escFlinch'; want.ov = { earBack: 0.7 }; return; }
      want.pose = 'escStand'; want.ov = { tail: TAIL_LASH, earBack: 0.35 };
      if (b.t > 62 && b.resume && b.resume.p.then) { resume(b); return; }
      if (b.t > 62) { if (chance(0.55) && roomSec() > 2.4) setBeh('ride', { groom: true, quick: true, lash: true, durForce: Math.max(30, Math.round((roomSec() - 1.6) / DT)) }); else setBeh('trot', { lift: 0.2 }); }
    },
    backtrack(b) {
      const z = zNow();
      switch (b.st) {
        case 'start': b.nDown = b.hold ? 99 : z >= O.zMin + 0.9 && bb < n + 0.36 ? 1 : 0; b.quick = true; b.side = x > 0 ? -1 : 1; b.st = 'stop'; b.t = 0; // a step down only from the top of the band, else back down the tread to the lip; fall through
        case 'stop': // stops, glances back over a shoulder (the head leads the turn)
          want.pose = 'escStand';
          if (bb < n + PIV_LO || bb > n + PIV_HI) { walkTo(clamp(bb, n + PIV_LO + 0.02, n + PIV_HI - 0.02), th, WALK_STEPS); return; }
          want.ov = { yaw: (b.side > 0 ? -1 : 1) * 62 * sstep(b.t / 5), pitch: -6 };
          if (b.t > 4) { b.st = 'turn'; b.t = 0; }
          return;
        case 'turn':
          want.ov = { yaw: (b.side > 0 ? -1 : 1) * 20 * (1 - sstep(b.t / 14)) };
          if (turnTo(DOWN, b.side > 0 ? -1 : 1, 2.3)) { b.st = 'down'; b.t = 0; b.done = 0; }
          return;
        case 'down': {
          if (b.nDown === 0) { // the short version: trot back down the tread with the belt to the lip, then stop
            if (walkTo(Math.max(n + 0.2, bb - 0.18), DOWN, WALK_STEPS * 1.15, 'walk') || b.t > 16 || roomSec() < 1.6) { b.st = 'stop2'; b.t = 0; } // a few unhurried steps down with the belt
            return;
          }
          const stop = b.done >= b.nDown || roomSec() < 1.1 || (b.hold && !(inp && inp.down));
          if (stop) { b.st = 'stop2'; b.t = 0; return; }
          if (b.lipN !== n) { b.lipN = n; b.lip = n + rr(0.16, 0.18); }
          const lip = b.lip;
          want.pose = 'escStand';
          if (bb <= lip + 0.012) { startHop(-1, b.quick ? 'downQuick' : 'down'); b.done++; return; } // already near the lip after turning: drop straight off
          walkTo(lip, DOWN, b.quick ? WALK_STEPS * 1.9 : WALK_STEPS * 1.2, b.quick ? 'brisk' : 'walk');
          return;
        }
        case 'stop2': // facing the camera, near: a look at you, sometimes a slow blink
          want.pose = 'escStand';
          if (bb < n + PIV_LO || bb > n + PIV_HI) { walkTo(clamp(bb, n + PIV_LO + 0.02, n + PIV_HI - 0.02), th, WALK_STEPS); return; }
          if (b.t === 2 && chance(0.6)) sb = 34;
          want.ov = { pitch: 6 };
          if (b.t > (b.hold ? 4 : b.look2 || (b.look2 = 45 + ri(18))) || roomSec() < 0.95) { b.st = 'turn2'; b.t = 0; } // a look at you, 1.5 to 2.1 s
          return;
        case 'turn2': // back round: pivot until roughly side-on, then spring up the step and square up in the air
          if (faceUpThen(b, 2.3)) setBeh(b.hold && inp && inp.down ? 'backtrack' : 'trot', { lift: 0.15, urgent: roomSec() < 1.3 });
          return;
      }
    },
    ride(b) { // sit and ride the belt down; sometimes groom; then up and climbing again
      const z = zNow(), room = z - O.zMin;
      switch (b.st) {
        case 'start':
          if (b.preHop && !b.preHopped) { // a follow-on sit (after a stretch or a watch): up the steps first
            if (!faceUpThen(b, 2)) return; b.preHopped = true; const k2 = zTop() - 0.05 - zNow() > (n + 2.42 - bb) * RUN - 0.45 * beltW() ? 2 : 1; startHop(k2, k2 > 1 ? 'double' : 'bound'); return; }
          if (!b.face0) b.face0 = b.faceForce || (b.quick ? th : b.groom ? pick({ up: 1, side: 5, viewer: 3 }) : pick({ up: 4, side: 4, viewer: 2 }));
          b.face = b.face0;
          if (!b.faceForce && b.face === 'viewer' && roomSec() < 4.0) b.face = 'side';   // turning round to face you costs ~1.5 s of belt
          if (!b.faceForce && b.face === 'side' && roomSec() < 2.6) b.face = 'up';
          b.th = b.face === 'side' ? (x > 0 ? Math.PI - 0.35 : 0.35) : b.face === 'viewer' ? DOWN + rr(-0.3, 0.3) : typeof b.face === 'number' ? b.face : UP + rr(-0.2, 0.2);
          b.dur = b.seg ? b.dur2 || (b.groom ? 80 : 70) : b.durForce || (b.moment ? 999 : b.groom ? 70 + ri(50) : 35 + ri(45)); b.st = 'orient'; b.t = 0; // a moment fills the room; fall through
        case 'orient':
          if (v > 0.05 && Math.abs(wrap(b.th - th)) <= 0.06) return; // come to a stop before sitting
          if (Math.abs(wrap(b.th - th)) > 0.06) {
            if (bb < n + PIV_LO || bb > n + PIV_HI) { walkTo(clamp(bb, n + PIV_LO + 0.02, n + PIV_HI - 0.02), th, WALK_STEPS); return; }
            turnTo(b.th, 0, 1.4); return;
          }
          b.st = 'sitdown'; b.t = 0; ev.push({ kind: 'sit' }); return;
        case 'sitdown': { // hind paws stay put, the rump drops back over them, the forepaws step back one then the other
          want.pose = 'escSitDown'; want.anchor = 'hind'; b.low = true;
          const u = b.t / 12; want.ov = { stepFL: Math.sin(Math.PI * clamp(u / 0.5, 0, 1)) * 5, stepFR: Math.sin(Math.PI * clamp((u - 0.35) / 0.5, 0, 1)) * 5 };
          if (b.t >= 12) { b.st = 'sit'; b.t = 0; }
          return; }
        case 'sit': {
          want.anim = null; want.pose = 'escSit'; b.low = true; if (b.t < 16) want.anchor = 'hind';
          if (b.lash) want.ov = { tail: { tailAmp: 34, tailSpeed: 0.5, tailWave: 0.7 } };
          if (b.groom && b.t > 16 && b.t < 16 + b.dur) { want.anim = 'groom'; if (b.t === 17 && !b.seg) cat.groomKind = pick({ paw: 5, flank: 2, cello: 1 }); }
          else if (b.loaf && b.t > 22) { want.anim = 'loaf'; if (b.t === 60) sb = 34; } // sleepy: down into a loaf, a slow blink
          else if (b.lookBack && b.t > 6) { // over her shoulder at you: as far round as the look goes, then the head a little further; a slow blink
            lookAtWorld(PS.CAM.x, PS.CAM.y, PS.CAM.z, 1); want.ov = { yaw: Math.sign(look.tYaw || 1) * 44 * sstep((b.t - 6) / 14), pitch: 4 };
            if (b.t === 30 || b.t === 95) sb = 34; if (b.t === 60) cat.earT = 10; }
          else if (b.watchWho != null) { const t = tracks.find((q) => q.id === b.watchWho); if (t) lookAtWorld(t.wx, (Math.floor(t.wz / RUN + ph) - ph) * RISE + 0.85, t.wz, 1); }
          else if (!b.groom && b.t > 20 && b.t % 70 === 30) { b.amb = chance(0.5) ? pickAmbient() : null; }
          if (!b.groom && !b.loaf && !b.lookBack && b.watchWho == null && b.amb && b.t % 70 > 30) lookAtWorld(...b.amb, 0.9);
          if (b.yawn && b.t > 18 && b.t < 44) want.yawn = true;
          if (b.face === 'viewer' && b.t === 30) sb = 34;
          const end = (b.groom ? 16 + b.dur + 10 : b.dur) * (O.reduced ? 1.2 : 1);
          if (b.t > end || roomSec() < (Math.abs(wrap(th - UP)) < 0.4 ? 0.85 : 1.3) + (b.loaf ? 0.3 : 0) || (inp && (inp.up || inp.down))) { b.st = 'rise'; b.t = 0; } // side-on or facing you she needs time to turn
          return; }
        case 'rise': { // back onto long legs: the hind legs take over from BZ's sit mode where they are, forepaws step forward
          if (!b.riseInit) { b.riseInit = true; } // (the leg-mode handover happens in sitHandover)
          want.pose = 'escStand'; want.anchor = 'hind';
          const u = b.t / 12; want.ov = { stepFL: Math.sin(Math.PI * clamp(u / 0.5, 0, 1)) * 5, stepFR: Math.sin(Math.PI * clamp((u - 0.3) / 0.5, 0, 1)) * 5 };
          if (b.t < 13) return; }
          b.st = 'up'; b.t = 0; return;
        case 'up':
          if (!faceUpThen(b, 2)) return;
          if ((b.seg || 0) + 1 < (b.segs || 1)) { // the hitch: spring two steps back up and settle again, still the same moment
            if (!b.hitched) { b.hitched = true; const k2 = zTop() - 0.05 - zNow() > (n + 2.42 - bb) * RUN - 0.45 * beltW() ? 2 : 1; startHop(k2, k2 > 1 ? 'double' : 'bound'); return; }
            b.hitched = false; b.seg = (b.seg || 0) + 1; b.st = 'start'; b.riseInit = false; b.loaf = b.loaf && chance(0.5); return;
          }
          if (b.moment && !b.offHop && roomSec() < 1.6) { b.offHop = true; if (startHop(1, 'bound')) return; } // and off she goes: one spring up, still part of the moment
          setBeh(zNow() < zHome() - 0.1 ? 'trot' : 'climb', { treads: 1 + ri(3), lift: 0.1 });
          return;
      }
    },
    lookback(b) { // she turns round on the step and looks at you for a few seconds (eyes, a slow blink, an ear), then back up
      switch (b.st) {
        case 'start': b.side = x > 0 ? -1 : 1; b.fth = DOWN + (x > 0 ? 0.3 : -0.3); b.hold = 75 + ri(30); b.st = 'turn'; b.t = 0; // fall through
        case 'turn':
          want.ov = { yaw: (b.side > 0 ? -1 : 1) * 40 * (1 - sstep(b.t / 10)) }; // the head comes round first
          if (bb < n + PIV_LO || bb > n + PIV_HI) { walkTo(clamp(bb, n + PIV_LO + 0.02, n + PIV_HI - 0.02), th, WALK_STEPS * 1.4); return; }
          if (turnTo(b.fth, b.side > 0 ? -1 : 1, 2.2)) { b.st = 'hold'; b.t = 0; }
          return;
        case 'hold':
          want.pose = 'escStand'; lookAtWorld(PS.CAM.x, PS.CAM.y, PS.CAM.z, 1);
          if (b.t === 14) sb = 34; if (b.t === 40) cat.earT = 10; if (b.t === 30 && chance(0.5)) cat.tailGesture('curl');
          if (b.t > b.hold || roomSec() < 1.15) { b.st = 'back'; b.t = 0; }
          return;
        case 'back':
          if (faceUpThen(b, 2.2)) setBeh('climb', { treads: 1 + ri(2) });
          return;
      }
    },
    stretch(b) { // turn side-on if there is room, then Desktop Bo's timed stretch (gather, pour, tremble and yawn, back leg, shake)
      const z = zNow();
      switch (b.st) {
        case 'start':
          b.side = Math.abs(x) < 0.26; b.th = b.side ? (x > 0 ? Math.PI : 0) + rr(-0.12, 0.12) : UP;
          b.speed = clamp((112 * DT) / Math.max(0.5, roomSec() - 0.6), 1, 1.35); b.st = 'orient'; b.t = 0; // fall through
        case 'orient': {
          if (!b.side && (bb < n + 0.37 || bb > n + 0.56)) { walkTo(n + 0.47, UP, WALK_STEPS); return; }
          if (Math.abs(wrap(b.th - th)) > 0.06) { if (bb < n + PIV_LO || bb > n + PIV_HI) { walkTo(n + 0.42, th, WALK_STEPS); return; } turnTo(b.th, 0, 0.9); return; }
          b.st = 'stretch'; b.t = 0; return; }
        case 'stretch':
          want.anim = 'stretch';
          if (b.t * b.speed > 114 || roomSec() < 0.75) { b.st = 'up'; b.t = 0; }
          return;
        case 'up':
          if (b.moment) { setBeh('ride', { moment: 'stretch', preHop: true, face0: chance(0.5) ? 'up' : 'side', durForce: 80, yawn: true }); return; } // then up, a sit, a yawn
          if (faceUpThen(b)) setBeh('climb', { treads: 1 + ri(2) });
          return;
      }
    },
  };
  function pickAmbient() { // something to look at that isn't a shopper: the skylight, a shopfront, back down the escalator
    const z = zNow(), k = pick({ sky: 3, left: 2, right: 2, back: 1 });
    if (k === 'sky') return [x + rr(-1, 1), 12, z + rr(4, 9)];
    if (k === 'left') return [-3, rr(0.6, 2), z + rr(-0.5, 2)];
    if (k === 'right') return [3, rr(0.6, 2), z + rr(-0.5, 2)];
    return [x * 0.5, 0.3, z - 3];
  }

  function climbLike(b, trot) {
    if (motor.kind === 'hop') return;
    if (b.st === 'start') { b.st = 'orient'; b.t = 0; }
    if (b.st === 'orient') { if (!faceUpThen(b)) return; b.st = 'plan'; }
    const lat = lateralWant();
    if (b.st === 'plan') {
      if (trot && !b.hold && zNow() >= trotTarget(b) - 0.05) { if (b.then) { setBeh(b.then.kind, b.then.p); return; } setBeh('climb', { treads: 1 + ri(3) }); return; }
      b.plan = planTread(trot || b.urgent); b.st = 'go'; b.t = 0; b.wait = 0; }
    const p = b.plan, z = zNow();
    // headings: straight up, or angled for player drift
    const head = UP + lat * 0.9;
    if (b.st === 'go') {
      if (Math.abs(lat) > 0.1) { // drifting across: walk at an angle, then hop
        const [lo, hi] = bLimits(n, head);
        want.th = head; want.gait = p.gait; want.v = bb < hi - 0.01 ? unitsPerTick(p.speed) : 0;
        if (bb >= Math.min(hi - 0.015, p.bT)) { b.st = 'wait'; b.t = 0; }
        return;
      }
      if (walkTo(p.bT, UP, p.speed, p.gait) || bb >= p.bT - 0.012) { b.st = 'wait'; b.t = 0; }
      return;
    }
    if (b.st === 'wait') {
      if (trot && b.then && zNow() >= trotTarget(b) - 0.05) { setBeh(b.then.kind, b.then.p); return; } // high enough already: straight into the moment
      const ticks = Math.round(p.pause / DT);
      want.pose = b.t > 3 && p.look && ticks > 12 ? 'escLookUp' : 'escStand';
      if (Math.abs(wrap(th - UP)) > 0.4) { turnTo(UP, 0, 1); return; }
      if (b.t >= ticks || roomSec() < 0.6) {
        // decide at the lip: hop, or something else entirely
        b.k++;
        if (b.kind === 'climb' && !b.hold && T >= nextMomentAt) { startMoment(chooseMoment()); if (beh.kind !== 'climb' && beh.kind !== 'trot') return; b = beh; }
        if (b.hold && !(inp && inp.up)) { setBeh('climb', { treads: 1 }); }
        let st = p.style, k = p.k;
        const head = zTop() - 0.05 - zNow(), gain = (kk) => (n + kk + 0.42 - bb) * RUN - (kk > 1 ? 0.45 : 0.35) * beltW();
        if (k === 2 && head < gain(2)) { k = 1; st = 'bound'; }
        if (head < gain(1)) { want.pose = 'escLookUp'; b.t = Math.max(0, ticks - 3); return; } // no headroom: stand and let the belt bring her down a little
        startHop(k, st, { dx: lat * 0.05 });
        (beh || b).st = 'plan';

      }
    }
  }

  // ── output ──
  B.state = function (phaseNow) {
    const p = phaseNow != null ? phaseNow : ph;
    const wz = (bb - p) * RUN, wy = yRel - p * RISE;
    const P = PS.project(x, wy, wz);
    return { wx: x, wy, wz, theta: th, anim: label, depth: P[2], behavior: beh ? beh.moment || beh.kind : null, grounded: motor.kind !== 'hop', step: n, events: ev.slice() };
  };

  // BZ camera for the draw: BZ's own pitch for this heading (cat.js BZ.camera), shifted by how much more or less steeply
  // the stage camera sees the tread where she is than at her home spot, so planted feet track the stage's perspective.
  function camShift(wx, gy, wz) {
    if (!O.matchCamera) return 0;
    const a = PS.project(wx, gy, wz), b = PS.project(wx, gy, wz + 0.02);
    const sinp = clamp((a[1] - b[1]) / (0.02 * PS.ppu(a[2])), 0.05, 0.85);
    return Math.asin(sinp) - (13.4 / 256) * 2 * Math.PI;   // 13.4/256 turn = BZ's pitch facing away (7 + 64/10)
  }
  function bzCamera(shift) {
    return function (theta) {
      let yawP = ((theta - Math.PI / 2) / (2 * Math.PI)) * 256; yawP = ((yawP + 128) % 256 + 256) % 256 - 128;
      const pitchA = clamp(((7 + Math.abs(64 - Math.abs(yawP)) / 10) / 256) * 2 * Math.PI + shift, (7 / 256) * 2 * Math.PI, 0.6);
      return { c: Math.cos(theta), s: Math.sin(theta), pc: Math.cos(pitchA), ps: Math.sin(pitchA) };
    };
  }
  B.draw = function (ctx, phaseNow) {
    if (!cat) return;
    const p = phaseNow != null ? phaseNow : ph;
    const wz = (bb - p) * RUN, wy = yRel - p * RISE;
    const P = PS.project(x, wy, wz);
    const size = (TALL * PS.ppu(P[2])) / 78;
    fake.size = size; cat.updateScale();
    // contact shadow on the tread under her centre: 50% screen-door in the riser's darkest step, thinning with height
    const lvl = Math.floor(bb), gy = (lvl - p) * RISE, hgt = Math.max(0, wy - gy);
    const dens = motor.kind === 'hop' ? clamp(1 - hgt / 0.05, 0, 1) : 1;
    if (dens > 0.05) shadow(ctx, x, gy, wz, size, dens);
    cat.x = Math.round(P[0]); cat.y = Math.round(P[1]);
    const beta = Math.atan2(x - PS.CAM.x, wz - PS.CAM.z);
    const th0 = cat.theta, cam0 = BZ.camera;
    cat.theta = wrap(th - beta);
    BZ.camera = bzCamera(camShift(x, gy, wz));
    cat.look = null;
    if (look.tgt && look.w > 0.3) { const q = PS.project(look.tgt[0], look.tgt[1], look.tgt[2]); cat.look = [q[0], q[1]]; } // eyes follow her look (iris eases 0.6 px per frame)
    // seen from behind and above, BZ's flat discs let the eyes and muzzle poke out past the back of the head:
    // any face part that sits behind the head centre is drawn pulled inside the head disc (restored after)
    const I = BZ.IDX, Ps = cat.skel.pos, cam = BZ.camera(cat.theta), H = Ps[I.head], saved = [];
    const depth = (v) => (-v[0] * cam.s + v[2] * cam.c) * cam.pc - v[1] * cam.ps;
    for (const nm of ['eyeL', 'eyeR', 'nose', 'muzL', 'muzR', 'chin', 'mouth', 'tongue']) {
      const v = Ps[I[nm]]; if (!v) continue; const dd = depth(v) - depth(H);
      if (dd > 0) { saved.push([v, v.slice()]); const k = Math.max(0.35, 1 - dd / 3); for (let q = 0; q < 3; q++) v[q] = H[q] + (v[q] - H[q]) * k; }
    }
    try { BZ.drawCat(ctx, cat); } finally { BZ.camera = cam0; cat.theta = th0; for (const [v, o] of saved) { v[0] = o[0]; v[1] = o[1]; v[2] = o[2]; } }
  };
  function shadow(ctx, wx, gy, wz, size, dens) {
    const c = Math.cos(th), s = Math.sin(th), L = 15 * UNIT, W = 6.5 * UNIT;
    const pts = [[L, 0], [-L, 0], [0, W], [0, -W]].map(([f, l]) => PS.project(wx + f * c + l * s, gy, wz + f * -s + l * c));
    const o = PS.project(wx, gy, wz), cx = o[0] - 1 * size, cy = o[1];
    let rx = 0, ry = 0; for (const q of pts) { rx = Math.max(rx, Math.abs(q[0] - o[0])); ry = Math.max(ry, Math.abs(q[1] - o[1])); }
    rx = Math.max(rx, 4 * size) + 2 * size; ry = Math.max(ry, 1.6 * size) + 0.8 * size;
    ctx.fillStyle = PS.R.riser[0];
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry), thr = 0.5 * dens;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const dx = (xx + 0.5 - cx) / rx, dy = (yy + 0.5 - cy) / ry; if (dx * dx + dy * dy > 1) continue;
      if (PS.bay(xx, yy) < thr) ctx.fillRect(xx, yy, 1, 1);
    }
  }

  // ── test / debug hooks (not part of the contract) ──
  B._dbg = {
    get cat() { return cat; }, get motor() { return motor; }, get beh() { return beh; }, get stat() { return stat; },
    force(kind, p) { setBeh(kind, p); },
    // world positions of all four paws (b in steps, yRel bottom) for the sinking / sliding checks
    paws() {
      const I = BZ.IDX, out = [];
      for (const nm of ['pawL', 'pawR', 'bpL', 'bpR']) { const v0 = cat.skel.pos[I[nm]], W = localToWorld(v0[0], v0[2]); out.push({ nm, b: W.b, x: W.x, y: yRel + (v0[1] - 2.5) * UNIT, ly: v0[1] }); }
      return out;
    },
    get body() { return { bb, x, th, n, yRel, ph, v, pitch }; },
    get want() { return want; },
  };
  return B;
})();
