// The story of Solara Bay: five missions from Rosa's Diner to the big score. Each
// mission is a list of steps — go somewhere, press E, collect, survive — and the state
// machine below walks them. No drawing here; main.js reads the objective for the HUD.

import { MISSION_REWARDS } from './config.js';
import { dist } from './random.js';

/**
 * A step is one of:
 *  goto     { loc, radius }            reach the place
 *  interact { loc, radius, prompt }    press E at the place
 *  collect  { locs, radius }           visit every place
 *  survive  { seconds }                stay alive until the clock runs out
 */
export const MISSIONS = [
  {
    id: 'fare',
    title: 'First Fare',
    giver: "Rosa — Rosa's Diner",
    brief: 'Rosa needs a package run to the Hideout, no questions asked. Pick it up at the diner, drive it across town, and keep it clean.',
    reward: MISSION_REWARDS[0],
    steps: [
      { type: 'interact', loc: 'diner', radius: 70, prompt: 'Pick up the package' },
      { type: 'goto', loc: 'hideout', radius: 80 },
    ],
  },
  {
    id: 'getaway',
    title: 'Getaway Driver',
    giver: 'Marco — The Hideout',
    brief: "Marco lifted a watch from the wrong pocket and the cops are already rolling. Get him to the Docks — and don't stop for anyone.",
    reward: MISSION_REWARDS[1],
    steps: [
      { type: 'interact', loc: 'hideout', radius: 80, prompt: 'Pick up Marco' },
      { type: 'goto', loc: 'port', radius: 90 },
    ],
    wantedOnStart: 2,
  },
  {
    id: 'collection',
    title: 'The Collection',
    giver: "Rosa — Rosa's Diner",
    brief: 'Three drops are waiting around the city — the Park, the Bank and the Docks. Collect them all before the clock runs out.',
    reward: MISSION_REWARDS[2],
    steps: [
      { type: 'collect', locs: ['park', 'bank', 'port'], radius: 70 },
    ],
    timeLimit: 150,
  },
  {
    id: 'heat',
    title: 'Heat Wave',
    giver: 'Marco — The Hideout',
    brief: 'The whole force is looking for you. Three stars and counting — lose them. Break line of sight, lay low, and wait for the heat to die.',
    reward: MISSION_REWARDS[3],
    steps: [
      { type: 'survive', seconds: 60 },
    ],
    wantedOnStart: 3,
    timeLimit: 120,
  },
  {
    id: 'score',
    title: 'The Big Score',
    giver: "Rosa — Rosa's Diner",
    brief: "One last job: the Bank's vault is full and its guard is asleep. Grab the cash, then get to the Hideout — the whole city will be on you.",
    reward: MISSION_REWARDS[4],
    steps: [
      { type: 'interact', loc: 'bank', radius: 80, prompt: 'Grab the cash' },
      { type: 'goto', loc: 'hideout', radius: 90 },
    ],
    wantedAfterGrab: 3,
  },
];

export function createMissionState() {
  return {
    index: 0,
    active: false,
    step: 0,
    collected: [],
    timer: 0,
    timeLeft: 0,
    done: false,
    failed: false,
    failedReason: '',
  };
}

/** Start the next mission (or the first). Returns its definition. */
export function startMission(state, index) {
  const m = MISSIONS[index];
  state.index = index;
  state.active = true;
  state.step = 0;
  state.collected = [];
  state.timer = 0;
  state.timeLeft = m.timeLimit || 0;
  state.done = false;
  state.failed = false;
  state.failedReason = '';
  return m;
}

/** The current objective's position and label, for the HUD arrow and the minimap. */
export function currentObjective(state, city) {
  if (!state.active) return null;
  const m = MISSIONS[state.index];
  const step = m.steps[state.step];
  if (!step) return null;
  if (step.type === 'collect') {
    const next = step.locs.find((key) => !state.collected.includes(key));
    if (!next) return null;
    const loc = city.locations[next];
    return { x: loc.x, y: loc.y, label: `Collect: ${loc.label} (${state.collected.length}/${step.locs.length})` };
  }
  if (step.type === 'survive') {
    const left = Math.max(0, Math.ceil(step.seconds - state.timer));
    return { x: null, y: null, label: `Lose the cops — ${left}s left` };
  }
  const loc = city.locations[step.loc];
  const verb = step.type === 'interact' ? step.prompt : 'Go to';
  return { x: loc.x, y: loc.y, label: `${verb}: ${loc.label}` };
}

/**
 * One mission step. `pos` is the player's position, `interactPressed` true on the frame
 * E is pressed. Pushes events ('missionStep', 'missionDone', 'missionFailed') for main.js.
 * Returns the mission definition while active, else null.
 */
export function updateMission(state, dt, pos, interactPressed, city, events) {
  if (!state.active || state.done || state.failed) return null;
  const m = MISSIONS[state.index];

  if (m.timeLimit) {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.failed = true;
      state.active = false;
      state.failedReason = 'Out of time.';
      events.push('missionFailed');
      return null;
    }
  }

  const step = m.steps[state.step];
  if (!step) return m;

  if (step.type === 'survive') {
    state.timer += dt;
    if (state.timer >= step.seconds) {
      advance(state, m, events);
    }
    return m;
  }

  if (step.type === 'collect') {
    for (const key of step.locs) {
      if (state.collected.includes(key)) continue;
      const loc = city.locations[key];
      if (dist(pos.x, pos.y, loc.x, loc.y) < step.radius) {
        state.collected.push(key);
        events.push('missionStep');
      }
    }
    if (state.collected.length === step.locs.length) advance(state, m, events);
    return m;
  }

  const loc = city.locations[step.loc];
  const d = dist(pos.x, pos.y, loc.x, loc.y);
  if (step.type === 'goto') {
    if (d < step.radius) advance(state, m, events);
  } else if (step.type === 'interact') {
    if (d < step.radius && interactPressed) {
      if (m.wantedAfterGrab) events.push('grabCash');
      advance(state, m, events);
    }
  }
  return m;
}

/** Move to the next step, or finish the mission. */
function advance(state, m, events) {
  state.step += 1;
  if (state.step >= m.steps.length) {
    state.done = true;
    state.active = false;
    events.push('missionDone');
  } else {
    events.push('missionStep');
  }
}

/** The cash reward for the mission at `index`. */
export function missionReward(index) {
  return MISSION_REWARDS[index] || 0;
}
