// ════════════════════════════════════════
// CONSTANTS — single source of truth
// ════════════════════════════════════════

// Escalator geometry
export const STEP_SPACING = 0.55;      // Z distance between steps
export const INCLINE = 0.18;           // Y rise per step
export const STEP_POOL_SIZE = 28;
export const BELT_LENGTH = STEP_POOL_SIZE * STEP_SPACING;
export const ESC_WIDTH = 2.2;

// Belt speed
export const BELT_BASE_SPEED = 1.6;
export const BELT_FLOW_MULT = 0.12;    // speed += flow * this
export const BELT_TITLE_SPEED = 0.25;

// Cat movement
export const CAT_LATERAL_SPEED = 2.8;  // keyboard lateral per sec
export const CAT_LATERAL_SMOOTH = 8;   // lerp factor for X
export const CAT_STEP_SMOOTH = 6;      // lerp factor for step Y/Z
export const CAT_STEP_MIN = -2;
export const CAT_STEP_MAX = 1;
export const CAT_MAX_X_MARGIN = 0.1;   // distance from wall

// Cat spring chain — two regimes interpolated by flow
// Zero flow: stiff, deliberate (Bo is 19 and careful)
export const SPRING_HEAD_STIFF = 14;
export const SPRING_BODY_STIFF = 12;
export const SPRING_BUTT_STIFF = 9;
export const SPRING_TAIL_BASE_STIFF = 6;
export const SPRING_TAIL_DECAY_STIFF = 0.3;
// Max flow: loose, elastic (Bo is the kitten she was at 2)
export const SPRING_HEAD_LOOSE = 8;
export const SPRING_BODY_LOOSE = 6;
export const SPRING_BUTT_LOOSE = 4;
export const SPRING_TAIL_BASE_LOOSE = 3.5;
export const SPRING_TAIL_DECAY_LOOSE = 0.15;
// Legacy aliases — used as defaults / fallback
export const SPRING_HEAD = SPRING_HEAD_STIFF;
export const SPRING_BODY = SPRING_BODY_STIFF;
export const SPRING_BUTT = SPRING_BUTT_STIFF;
export const SPRING_TAIL_BASE = SPRING_TAIL_BASE_STIFF;
export const SPRING_TAIL_DECAY = SPRING_TAIL_DECAY_STIFF;
export const GROUND_TRACK_SPEED = 35;

// Cat body proportions — seal point Cornish Rex (Bo)
// radii define silhouette: nose → butt (10 control points)
export const BODY_SPINE_PTS = 10;
// Cornish Rex silhouette: narrow shoulders → deep chest → dramatic waist tuck → rounded rump
export const BODY_RADII = [0.003, 0.020, 0.034, 0.040, 0.015, 0.013, 0.030, 0.042, 0.038, 0.016];
export const TAIL_SEGMENTS = 12;
export const TUBE_CROSS_SEGS = 6;      // hexagonal cross-section

// Cat walk cycle — procedural quadruped gait
// Leg geometry
export const LEG_UPPER_LEN = 0.045;    // shoulder/hip to knee/elbow
export const LEG_LOWER_LEN = 0.045;    // knee/elbow to paw
export const LEG_RADIUS_TOP = 0.009;   // thigh/upper arm width
export const LEG_RADIUS_BOT = 0.006;   // shin/forearm width (tapers)
export const PAW_RADIUS = 0.009;       // oval paw
// Stride parameters (interpolated by flow)
export const STRIDE_LEN_STIFF = 0.035; // short careful strides at zero flow
export const STRIDE_LEN_LOOSE = 0.06;  // long fluid strides at max flow
export const STEP_HEIGHT_STIFF = 0.018;// low careful lift at zero flow
export const STEP_HEIGHT_LOOSE = 0.032;// bouncy high lift at max flow
export const STEP_SPEED = 12;          // how fast the paw swings to its target
// Stance offsets from body anchors
export const FRONT_STANCE_X = 0.026;   // lateral offset from spine
export const BACK_STANCE_X = 0.028;
export const FRONT_STANCE_Z = 0.015;   // forward offset from head
export const BACK_STANCE_Z = 0.005;    // back from butt

// Tail state machine — emotional telemetry
export const TAIL_MOVING_THRESHOLD = 0.08;
export const TAIL_STATE_BLEND_S = 0.15;
export const TAIL_IDLE_SWISH_FREQ = 1.2;
export const TAIL_IDLE_SWISH_AMP = 0.012;
export const TAIL_IDLE_TIP_CURL = 0.018;    // Y rise at tip
export const TAIL_IDLE_BASE_DROP = 0.005;
export const TAIL_MOVING_SWISH_FREQ = 2.6;
export const TAIL_MOVING_SWISH_AMP = 0.018;
export const TAIL_MOVING_PERK_GAIN = 0.014; // Y rise at base
export const TAIL_IMPACT_IMPULSE = 0.05;    // X displacement magnitude
export const TAIL_IMPACT_DECAY_S = 0.8;
// Flow-dependent tail posture
// Low flow: tail lowered, still. High flow: raised with S-curve.
export const TAIL_FLOW_RAISE = 0.025;       // max Y lift at full flow
export const TAIL_FLOW_SCURVE_AMP = 0.015;  // lateral S-curve amplitude at full flow
export const TAIL_FLOW_SWISH_BOOST = 1.8;   // swish amplitude multiplier at full flow

// Flow state
export const FLOW_DECAY_RATE = 0.18;
export const FLOW_MAX = 15;
export const FLOW_DODGE_GAIN = 0.22;   // per NPC dodged
export const FLOW_HIT_LOSS = 1.0;

// NPC
export const NPC_SPAWN_RATE = 1.6;     // spawns per sec (probability)
export const NPC_HIT_RADIUS_X = 0.22;
export const NPC_HIT_RADIUS_Z = 0.25;
// NPC tube geometry — spine points and type-specific radii
export const NPC_SPINE_PTS = 8;        // feet → head
export const NPC_TUBE_CROSS_SEGS = 5;  // pentagonal cross-section (cheaper than cat's hex)
// Type radii: feet → head (8 points). Wider = more imposing silhouette.
export const NPC_RADII_SHOPPER  = [0.08, 0.09, 0.14, 0.20, 0.22, 0.18, 0.14, 0.10];
export const NPC_RADII_PHONE    = [0.06, 0.07, 0.10, 0.12, 0.13, 0.11, 0.10, 0.09];
export const NPC_RADII_SALESREP = [0.07, 0.08, 0.11, 0.14, 0.16, 0.13, 0.11, 0.10];
// NPC springs — always stiffer than Bo at any flow level (NPCs are rigid)
export const NPC_SPRING_SWAY = 2;      // lateral sway spring (vs Bo's 4-14)
// Phone zombie drift
export const NPC_PHONE_DRIFT_SPEED = 0.3;
export const NPC_PHONE_DRIFT_FREQ = 0.4;
// Sales rep approach
export const NPC_SALES_APPROACH_SPEED = 0.5;

// Render
export const RENDER_W = 480;
export const RENDER_H = 560;
export const DITHER_SCALE = 0.45;      // render target is this fraction of output

// Environment
export const ENV_CHUNK_COUNT = 18;
export const ENV_CHUNK_SPACING = 1.5;

// Mood names indexed by floor(flow)
export const MOODS = [
  'INDIFFERENT','INDIFFERENT','CURIOUS','ALERT','FOCUSED','COMPOSED',
  'WEAVING','GLIDING','FLOWING','ASCENDING','UNBOTHERED','TRANSCENDENT',
  'OMNISCIENT','BEYOND','RETAIL-BLESSED','RETAIL-BLESSED'
];

export const FLOW_WORDS = [
  'STABLE','STABLE','RISING','RISING','ELEVATED','SURGING',
  'SURGING','PEAK','PEAK','CRITICAL','OVERFLOW','OVERFLOW',
  '???','???','???','???'
];

export const DENSITY_WORDS = ['empty','low','moderate','busy','congested','sardine'];

// ── Audio — crowd filter ──
export const CROWD_FILTER_MAX = 8000;
export const CROWD_FILTER_MIN = 800;
export const CROWD_FILTER_SMOOTH = 2;
export const CROWD_FILTER_Q_MIN = 0.5;
export const CROWD_FILTER_Q_MAX = 1.2;
export const CROWD_PROX_RADIUS = 1.5;

// ── Audio — flow modulation ──
export const FLOW_REVERB_MIN = 0.05;
export const FLOW_REVERB_MAX = 0.35;
export const FLOW_OCCLUSION_ATTEN = 0.7;

// ── Audio — music ──
export const MUSIC_BPM = 92;
export const MUSIC_MASTER_GAIN = 0.4;
export const MUSIC_CHORD_MIN_BEATS = 2;
export const MUSIC_CHORD_MAX_BEATS = 4;
export const MUSIC_HUMANIZE_MS = 30;

// ── Audio — foley ──
export const FOLEY_MASTER_GAIN = 0.15;
export const FOLEY_PROX_RANGE = 1.2;
export const FOLEY_PAN_SCALE = 0.8;

// ── Audio — foley: step clatter ──
export const CLATTER_DURATION = 0.020;        // seconds (20ms noise burst)
export const CLATTER_FILTER_FREQ = 3000;      // Hz — bandpass center
export const CLATTER_FILTER_Q = 2.5;
export const CLATTER_GAIN = 0.12;
export const CLATTER_JITTER_MAX = 0.15;       // ±15% timing jitter at zero flow
export const CLATTER_STEP_LENGTH = 0.4;       // meters — escalator step depth
export const CLATTER_SCHEDULE_AHEAD = 0.05;   // seconds — look-ahead window

// ── Audio — foley: paw steps (Bo) ──
export const PAW_DURATION = 0.008;            // seconds (8ms — lighter than clatter)
export const PAW_FILTER_FREQ = 1500;          // Hz — bandpass center
export const PAW_FILTER_Q = 3.0;
export const PAW_GAIN = 0.10;
export const PAW_JITTER_MAX = 0.12;           // timing irregularity at zero flow
export const PAW_SCHEDULE_AHEAD = 0.05;       // seconds

// ── Audio — foley: fluorescent hum ──
export const FLUOR_FREQ = 60;                 // Hz — mains fundamental
export const FLUOR_GAIN_60 = 0.015;
export const FLUOR_GAIN_120 = 0.008;
export const FLUOR_GAIN_180 = 0.004;

// ── Audio — escalator drone ──
export const DRONE_FREQ_A = 55;
export const DRONE_FREQ_B = 58;
export const DRONE_GAIN = 0.08;
export const DRONE_FLOW_FREQ_SHIFT = 5;

// ── Audio — master ──
export const AUDIO_MASTER_GAIN = 0.7;

// ── Audio — Shepard-Risset glissando ──
// Six sines stacked across 6 octaves from A1, each with a Gaussian amplitude
// envelope centered in its band. 12 s per octave is slow enough to read as
// "eternal rise" without feeling like a ramp. Off by default; MallFM LEVEL
// slider bleeds it in.
export const SHEPARD_VOICES = 6;
export const SHEPARD_BASE_FREQ = 55;    // A1
export const SHEPARD_OCTAVES = 6;       // spans A1..A7
export const SHEPARD_SIGMA = 0.25;      // Gaussian envelope width (0..1)
export const SHEPARD_PERIOD_S = 12;     // seconds per octave rise
