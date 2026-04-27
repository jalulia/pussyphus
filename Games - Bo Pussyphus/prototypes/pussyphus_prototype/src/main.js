// ════════════════════════════════════════
// MAIN — game loop, state machine, orchestration
// ════════════════════════════════════════
import * as K from './constants.js';
import * as input from './input.js';
import * as sceneSetup from './render/scene.js';
import * as dither from './render/dither.js';
import * as escalator from './world/escalator.js';
import * as environment from './world/environment.js';
import * as npcs from './world/npcs.js';
import * as cat from './cat/cat.js';
import * as catModel from './cat/catModel.js';
import * as catAnim from './cat/catAnim.js';
import * as catTail from './cat/catTail.js';
import * as hud from './ui/hud.js';
import * as titleScreen from './ui/titleScreen.js';
import * as mallfm from './ui/mallfm.js';
import * as mixer from './audio/mixer.js';
import * as music from './audio/music.js';
import * as crowd from './audio/crowd.js';
import * as shepard from './audio/shepard.js';
import * as foley from './audio/foley.js';

// ── Game state ──
let state = 'title';  // 'title' | 'play'
let flow = 0;
let flowPrev = 0;
let alt = 0;
let beltPhase = 0;
let t = 0;
let lastTime = 0;

// ── Boot ──
const gc = document.getElementById('gc');

sceneSetup.init(gc);
dither.init();
escalator.init(sceneSetup.scene);
environment.init(sceneSetup.scene);
catModel.init(sceneSetup.scene);
hud.init();
titleScreen.init();
input.init(gc);

escalator.update(beltPhase, sceneSetup.scene);

// ── Start game ──
function start() {
  if (state !== 'title') return;
  state = 'play';
  titleScreen.hide();
  flow = 0;
  flowPrev = 0;
  alt = 0;
  beltPhase = 0;
  cat.reset();
  catTail.reset();
  input.reset();
  foley.reset();
  npcs.reset(sceneSetup.scene);
}

// Title screen gesture — browser autoplay gate means we init audio here.
// Must use pointerdown (not click): on iOS Safari/Chrome, input.js calls
// preventDefault on touchstart bubbling up from #gc, which cancels the
// simulated click. pointerdown covers mouse, touch, and pen in one path,
// and Tone.start() must be kicked synchronously in the gesture callback —
// any preceding `await` would lose the user-gesture token on iOS.
let audioUnlocked = false;
async function unlockAndStart() {
  if (!audioUnlocked) {
    audioUnlocked = true;
    try {
      await mixer.init();
      await music.init();
      music.start();
      // Shepard routes directly to master (bypasses crowd filter + reverb).
      // Level starts at 0 — the MALL FM panel's LEVEL slider bleeds it in.
      shepard.init(mixer.getMasterBus());
      foley.init(mixer.getFoleyBus(), mixer.getMasterBus());
      // MALL FM panel — the audition surface. Stands up a bottom tab that
      // expands into the lab. Safe to init after audio so every control
      // finds a live bus on first interaction.
      mallfm.init();
    } catch (e) {
      audioUnlocked = false;
      console.warn('audio init failed', e);
    }
  }
  start();
}
const tsEl = document.getElementById('ts');
tsEl.addEventListener('pointerdown', unlockAndStart);
// Fallback for ancient browsers without Pointer Events — harmless if
// pointerdown already fired because unlockAndStart is idempotent.
tsEl.addEventListener('click', unlockAndStart);

// ── Main loop ──
function loop(ts) {
  if (!lastTime) lastTime = ts;
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  t = ts / 1000;

  // Belt
  const beltSpeed = state === 'play' ? K.BELT_BASE_SPEED + flow * K.BELT_FLOW_MULT : K.BELT_TITLE_SPEED;
  beltPhase += beltSpeed * dt;
  if (state === 'play') alt = Math.floor(beltPhase * 2);

  // Input
  if (state === 'play') {
    input.update(dt);
    if (input.consumeStart()) start();
  } else {
    if (input.consumeStart()) start();
  }

  // Flow decay
  if (state === 'play') flow = Math.max(0, flow - dt * K.FLOW_DECAY_RATE);

  // NPC spawning
  if (state === 'play' && Math.random() < dt * K.NPC_SPAWN_RATE) {
    npcs.spawn(sceneSetup.scene);
  }

  // Update escalator
  escalator.update(beltPhase, sceneSetup.scene);

  // Update NPCs
  const npcResult = npcs.update(dt, beltSpeed, t, cat.headX, cat.stepZ, sceneSetup.scene);

  // Flow from dodges/hits
  if (state === 'play') {
    flow = Math.min(K.FLOW_MAX, flow + npcResult.dodged * K.FLOW_DODGE_GAIN);
    if (npcResult.hit > 0) {
      flow = Math.max(0, flow - npcResult.hit * K.FLOW_HIT_LOSS);
      // Tail flicks away from the nearest collider.
      catTail.impact(-(npcResult.nearestDir || 1));
      // TODO: extract bump direction from NPC collision data
    }

    // Fragment triggers — fire on integer flow crossings at or above 5.
    const prevI = Math.floor(flowPrev);
    const nextI = Math.floor(flow);
    if (nextI > prevI && nextI >= 5) {
      music.triggerRandomFragment();
    }
    flowPrev = flow;
  }

  // Audio — per-frame crowd analysis (drives filter, reverb, drone, foley).
  crowd.update(dt, npcs.npcs, cat.headX, cat.stepZ, flow);
  // Shepard advances phase every frame; setLevel(0) keeps it silent by default.
  shepard.update(dt);
  // Foley — clatter scheduling, driven by belt speed and flow.
  foley.update(dt, flow / K.FLOW_MAX, beltSpeed);

  // Update environment
  environment.update();
  environment.flickerNeon(sceneSetup.scene, t);

  // Cat physics
  if (state === 'play') {
    const frontStepY = escalator.findStepSurface(cat.headZ);
    const backStepY  = escalator.findStepSurface(cat.buttZ);
    cat.updateSpringChain(dt, input.input.lateralTarget, input.input.stepTarget, frontStepY, backStepY, flow);
  }

  // Tail state machine — drives target offsets the spring chain resolves.
  catTail.update(dt, cat.smoothX, flow);

  // Cat animation
  catAnim.animate(t, npcResult.nearestDist, npcResult.nearestDir);

  // Camera
  sceneSetup.updateCamera(cat.headX, cat.groundY, cat.stepZ, flow);

  // Render
  dither.render(sceneSetup.renderer, sceneSetup.scene, sceneSetup.camera, flow, t);

  // HUD
  hud.update(flow, alt, npcs.npcs.length);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
