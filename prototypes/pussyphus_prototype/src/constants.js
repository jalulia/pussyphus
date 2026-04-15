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

// Cat spring chain
export const SPRING_HEAD = 12;
export const SPRING_BODY = 10;
export const SPRING_BUTT = 7;
export const SPRING_TAIL_BASE = 5;
export const SPRING_TAIL_DECAY = 0.25;
export const GROUND_TRACK_SPEED = 35;

// Cat body proportions — seal point Cornish Rex (Bo)
// radii define silhouette: nose → butt (10 control points)
export const BODY_SPINE_PTS = 10;
export const BODY_RADII = [0.003, 0.022, 0.050, 0.042, 0.020, 0.032, 0.040, 0.038, 0.032, 0.018];
export const TAIL_SEGMENTS = 12;
export const TUBE_CROSS_SEGS = 6;      // hexagonal cross-section

// Flow state
export const FLOW_DECAY_RATE = 0.18;
export const FLOW_MAX = 15;
export const FLOW_DODGE_GAIN = 0.22;   // per NPC dodged
export const FLOW_HIT_LOSS = 1.0;

// NPC
export const NPC_SPAWN_RATE = 1.6;     // spawns per sec (probability)
export const NPC_HIT_RADIUS_X = 0.22;
export const NPC_HIT_RADIUS_Z = 0.25;

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

// ── Audio — escalator drone ──
export const DRONE_FREQ_A = 55;
export const DRONE_FREQ_B = 58;
export const DRONE_GAIN = 0.08;
export const DRONE_FLOW_FREQ_SHIFT = 5;

// ── Audio — master ──
export const AUDIO_MASTER_GAIN = 0.7;
