// Solara Bay — every tuning number and colour in one place.
// The world is a fixed 3200x2400 city; the renderer draws a 1280x720 camera view of it,
// scaled to the window, so no rule below depends on the screen size.

export const WORLD = { width: 3200, height: 2400 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The camera's logical view size. */
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  radius: 14,
  walkSpeed: 210,
  runSpeed: 320,
  health: 100,
  punchDamage: 12,
  punchRange: 34,
  punchArc: 1.1,
  punchCooldown: 0.35,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 420,
  brake: 700,
  reverseAccel: 220,
  maxSpeed: 520,
  maxReverse: 160,
  turnRate: 2.6,
  grip: 3.2,
  drag: 0.55,
};

/** Traffic and pedestrian counts. */
export const TRAFFIC = { cars: 14, peds: 26, policeCars: 3 };

export const WANTED = {
  decaySeconds: 26,
  stealCar: 1,
  hitPed: 2,
  shoot: 1,
  killPed: 2,
  killCop: 3,
  max: 5,
  /** Police cars on the hunt per star. */
  huntersPerStar: 1,
  /** How close a cop on foot must get to bust the player. */
  bustRadius: 26,
};

export const WEAPONS = {
  pistol: { damage: 34, range: 420, cooldown: 0.32, price: 500, ammo: 24 },
};

export const ECONOMY = {
  startCash: 150,
  sprayPrice: 200,
  hospitalPrice: 100,
  bustedFine: 150,
  wastedFine: 200,
};

/** Mission rewards, in dollars. */
export const MISSION_REWARDS = [200, 350, 450, 500, 1200];

export const PALETTE = {
  // Sun-soaked coastal city: warm asphalt, sand, teal sea, terracotta roofs.
  sea: '#2fa8b5',
  sand: '#e8d5a3',
  grass: '#7fb069',
  parkGrass: '#6da35c',
  road: '#3d3a38',
  roadEdge: '#2c2a29',
  roadLine: '#f5d76e',
  sidewalk: '#b8b0a4',
  block: '#cbb89e',
  buildingRoof: ['#c96f4a', '#b85c5c', '#d9a05b', '#8a6f9e', '#5b8a7a', '#a34d4d'],
  buildingEdge: '#7a5c48',
  player: '#2f6df6',
  playerOutline: '#123a8f',
  cop: '#1e3a8a',
  copCar: '#1e3a8a',
  trafficCar: ['#d94f3d', '#e8a13c', '#4fae62', '#7a6fd0', '#e5e5e5', '#3d8bfd', '#c94f7c'],
  pedShirt: ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'],
  minimapBg: 'rgba(12, 18, 28, 0.78)',
  hudPanel: 'rgba(12, 18, 28, 0.72)',
  text: '#f4f1ea',
  muted: '#b9b3a6',
  gold: '#f2c94c',
  red: '#e5534b',
  green: '#58c184',
  star: '#ffd94a',
  marker: '#ff5d8f',
  markerRing: '#ffffff',
};

/** The font stack for canvas text (system fonts only — no network fonts). */
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'solara-bay.save.v1';
export const BEST_KEY = 'solara-bay.best';
