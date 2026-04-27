// ============================================================
// PUSSYPHUS — Phase 1 Sound: The Escalator's Voice + Bo's Feet
// Pure Web Audio API. Zero dependencies. Zero samples.
// ============================================================
//
// INTEGRATION (3 hooks):
//   1. Call `PussyphusAudio.init()` inside the click handler that starts the game.
//   2. Call `PussyphusAudio.update(dt, flow, beltSpeed)` every frame from your game loop.
//   3. Call `PussyphusAudio.triggerPawStep()` each time Bo completes a step in her walk cycle.
//
// Optional:
//   - `PussyphusAudio.setVolume(0-1)` — master volume, wire to Win95 UI slider
//   - `PussyphusAudio.mute()` / `PussyphusAudio.unmute()` — toggle
//   - `PussyphusAudio.triggerCollision()` — stub for Phase 2
//

const PussyphusAudio = (() => {

  // ─── Constants (tune these) ───────────────────────────────
  // All K.AUDIO_* constants. Pull these into your K object if you prefer.

  const A = {
    // Master
    MASTER_GAIN:          0.6,

    // Belt motor drone
    MOTOR_FREQ_A:         55,      // Hz — low fundamental
    MOTOR_FREQ_B:         57,      // Hz — detuned against A, ~2Hz beat
    MOTOR_FREQ_AC:        120,     // Hz — AC mains electromagnetic hum
    MOTOR_GAIN_A:         0.08,
    MOTOR_GAIN_B:         0.07,
    MOTOR_GAIN_AC:        0.04,
    MOTOR_LPF_MIN:        200,     // Hz — cutoff at zero flow
    MOTOR_LPF_MAX:        300,     // Hz — cutoff at max flow
    MOTOR_LPF_Q:          1.0,

    // Step clatter
    CLATTER_DURATION:     0.020,   // seconds (20ms noise burst)
    CLATTER_FILTER_FREQ:  3000,    // Hz — bandpass center
    CLATTER_FILTER_Q:     2.5,
    CLATTER_GAIN:         0.12,
    CLATTER_JITTER_MAX:   0.15,    // ±15% timing randomization at zero flow
    STEP_LENGTH:          0.4,     // meters — escalator step depth

    // Fluorescent hum
    FLUOR_FREQ:           60,      // Hz — mains fundamental
    FLUOR_GAIN_60:        0.015,
    FLUOR_GAIN_120:       0.008,
    FLUOR_GAIN_180:       0.004,

    // Paw steps (Bo)
    PAW_DURATION:         0.008,   // seconds (8ms — lighter than clatter)
    PAW_FILTER_FREQ:      1500,    // Hz — bandpass center
    PAW_FILTER_Q:         3.0,
    PAW_GAIN:             0.10,
    PAW_JITTER_MAX:       0.12,    // timing irregularity at zero flow

    // Scheduling
    SCHEDULE_AHEAD:       0.05,    // seconds — schedule transients this far ahead
  };

  // ─── State ────────────────────────────────────────────────

  let ctx = null;
  let masterGain = null;
  let isMuted = false;
  let previousGain = A.MASTER_GAIN;

  // Persistent nodes
  let motorOscA = null;
  let motorOscB = null;
  let motorOscAC = null;
  let motorLPF = null;
  let motorBus = null;

  let fluorOsc60 = null;
  let fluorOsc120 = null;
  let fluorOsc180 = null;

  // Step clatter scheduling
  let nextClatterTime = 0;
  let noiseBuffer = null;       // reusable white noise buffer

  // Paw step state
  let lastPawStepTime = 0;

  // ─── Noise buffer ────────────────────────────────────────
  // One shared buffer of white noise. Transient sounds slice from it.

  function createNoiseBuffer(duration) {
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // ─── Init ─────────────────────────────────────────────────
  // Call once, inside a user-gesture handler (click/tap to start game).

  function init() {
    if (ctx) return; // already initialized

    ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Pre-generate a 0.1s noise buffer (longer than any transient we need)
    noiseBuffer = createNoiseBuffer(0.1);

    // Master gain → destination
    masterGain = ctx.createGain();
    masterGain.gain.value = A.MASTER_GAIN;
    masterGain.connect(ctx.destination);

    _initMotorDrone();
    _initFluorescentHum();

    // Seed the first clatter event
    nextClatterTime = ctx.currentTime + 0.5;

    console.log('[PussyphusAudio] Phase 1 initialized');
  }

  // ─── Belt Motor Drone ─────────────────────────────────────
  // Two detuned sines (55/57Hz beat) + AC motor hum (120Hz)
  // All through a shared lowpass whose cutoff tracks flow.

  function _initMotorDrone() {
    // Shared lowpass filter
    motorLPF = ctx.createBiquadFilter();
    motorLPF.type = 'lowpass';
    motorLPF.frequency.value = A.MOTOR_LPF_MIN;
    motorLPF.Q.value = A.MOTOR_LPF_Q;

    // Bus gain (so we can kill the whole drone if needed)
    motorBus = ctx.createGain();
    motorBus.gain.value = 1.0;

    motorLPF.connect(motorBus);
    motorBus.connect(masterGain);

    // Oscillator A — 55Hz
    motorOscA = ctx.createOscillator();
    motorOscA.type = 'sine';
    motorOscA.frequency.value = A.MOTOR_FREQ_A;
    const gainA = ctx.createGain();
    gainA.gain.value = A.MOTOR_GAIN_A;
    motorOscA.connect(gainA);
    gainA.connect(motorLPF);
    motorOscA.start();

    // Oscillator B — 57Hz (2Hz beat against A)
    motorOscB = ctx.createOscillator();
    motorOscB.type = 'sine';
    motorOscB.frequency.value = A.MOTOR_FREQ_B;
    const gainB = ctx.createGain();
    gainB.gain.value = A.MOTOR_GAIN_B;
    motorOscB.connect(gainB);
    gainB.connect(motorLPF);
    motorOscB.start();

    // Oscillator AC — 120Hz electromagnetic character
    motorOscAC = ctx.createOscillator();
    motorOscAC.type = 'sine';
    motorOscAC.frequency.value = A.MOTOR_FREQ_AC;
    const gainAC = ctx.createGain();
    gainAC.gain.value = A.MOTOR_GAIN_AC;
    motorOscAC.connect(gainAC);
    gainAC.connect(motorLPF);
    motorOscAC.start();
  }

  // ─── Fluorescent Hum ──────────────────────────────────────
  // 60Hz + harmonics. Always on. Never changes. The mall's electrical constant.

  function _initFluorescentHum() {
    const fluors = [
      { freq: A.FLUOR_FREQ,       gain: A.FLUOR_GAIN_60  },
      { freq: A.FLUOR_FREQ * 2,   gain: A.FLUOR_GAIN_120 },
      { freq: A.FLUOR_FREQ * 3,   gain: A.FLUOR_GAIN_180 },
    ];

    fluors.forEach(({ freq, gain: g }) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gn = ctx.createGain();
      gn.gain.value = g;
      osc.connect(gn);
      gn.connect(masterGain);
      osc.start();
    });
  }

  // ─── Step Clatter (transient) ─────────────────────────────
  // Noise burst → bandpass → gain envelope. Fires rhythmically,
  // rate = beltSpeed / stepLength. Jitter decreases with flow.

  function _fireClatter(when) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = A.CLATTER_FILTER_FREQ;
    bp.Q.value = A.CLATTER_FILTER_Q;

    const env = ctx.createGain();
    env.gain.setValueAtTime(A.CLATTER_GAIN, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + A.CLATTER_DURATION);

    src.connect(bp);
    bp.connect(env);
    env.connect(masterGain);

    src.start(when);
    src.stop(when + A.CLATTER_DURATION + 0.01);
  }

  // ─── Paw Step (transient) ─────────────────────────────────
  // Lighter, higher, shorter than clatter. Bo's feet on metal.

  function _firePawStep(when, flow) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = A.PAW_FILTER_FREQ;
    bp.Q.value = A.PAW_FILTER_Q;

    const env = ctx.createGain();
    // Slightly quieter paw steps at low flow (careful placement),
    // full volume at high flow (confident strides)
    const vol = A.PAW_GAIN * (0.7 + 0.3 * flow);
    env.gain.setValueAtTime(vol, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + A.PAW_DURATION);

    src.connect(bp);
    bp.connect(env);
    env.connect(masterGain);

    src.start(when);
    src.stop(when + A.PAW_DURATION + 0.01);
  }

  // ─── Per-frame update ─────────────────────────────────────
  // Call every frame: PussyphusAudio.update(dt, flow, beltSpeed)
  //   dt        — frame delta in seconds
  //   flow      — 0.0 to 1.0 (normalized; divide by K.FLOW_MAX if yours isn't 0-1)
  //   beltSpeed — current belt speed in m/s

  function update(dt, flow, beltSpeed) {
    if (!ctx || ctx.state === 'suspended') return;

    const now = ctx.currentTime;

    // ── Motor drone: ramp lowpass cutoff with flow ──
    const targetCutoff = A.MOTOR_LPF_MIN + (A.MOTOR_LPF_MAX - A.MOTOR_LPF_MIN) * flow;
    motorLPF.frequency.linearRampToValueAtTime(targetCutoff, now + 0.1);

    // ── Step clatter scheduling ──
    if (beltSpeed > 0.01) {
      const baseInterval = A.STEP_LENGTH / beltSpeed;

      while (nextClatterTime < now + A.SCHEDULE_AHEAD + baseInterval) {
        // Apply jitter: ±JITTER_MAX at zero flow, zero jitter at max flow
        const jitterRange = A.CLATTER_JITTER_MAX * (1 - flow);
        const jitter = (Math.random() * 2 - 1) * jitterRange;
        const actualTime = nextClatterTime + baseInterval * jitter;

        if (actualTime > now) {
          _fireClatter(actualTime);
        }
        nextClatterTime += baseInterval;
      }
    }
  }

  // ─── Paw step trigger ─────────────────────────────────────
  // Call from Bo's walk cycle when a paw lands.
  // Pass current flow (0-1) so timing jitter and volume respond.

  function triggerPawStep(flow) {
    if (!ctx || ctx.state === 'suspended') return;

    const now = ctx.currentTime;

    // Jitter: at low flow, the step lands slightly early/late
    const jitterRange = A.PAW_JITTER_MAX * (1 - (flow || 0));
    const jitter = (Math.random() * 2 - 1) * jitterRange * 0.02; // ±jitter in seconds
    const when = now + A.SCHEDULE_AHEAD + jitter;

    _firePawStep(Math.max(when, now + 0.001), flow || 0);
    lastPawStepTime = now;
  }

  // ─── Collision stub (Phase 2) ─────────────────────────────
  function triggerCollision() {
    // Phase 2: thump + rustle, purr cuts
    // For now, just a marker so the integration point exists
  }

  // ─── Volume / Mute ────────────────────────────────────────

  function setVolume(v) {
    if (!masterGain) return;
    const clamped = Math.max(0, Math.min(1, v));
    previousGain = clamped;
    if (!isMuted) {
      masterGain.gain.linearRampToValueAtTime(clamped, ctx.currentTime + 0.05);
    }
  }

  function mute() {
    if (!masterGain || isMuted) return;
    isMuted = true;
    masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
  }

  function unmute() {
    if (!masterGain || !isMuted) return;
    isMuted = false;
    masterGain.gain.linearRampToValueAtTime(previousGain, ctx.currentTime + 0.05);
  }

  function toggleMute() {
    isMuted ? unmute() : mute();
  }

  // ─── Public API ───────────────────────────────────────────

  return {
    init,
    update,
    triggerPawStep,
    triggerCollision,
    setVolume,
    mute,
    unmute,
    toggleMute,
    // Expose constants for external tuning / K object merge
    A,
  };

})();
