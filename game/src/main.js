// Solara Bay — boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the renderer paints
// what is there. The game moves between screens: title, brief, play, paused, mission done,
// busted, wasted and story done.
//
// ?seed=N fixes the city. ?shot=start|street|drive|chase (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, CAR, ECONOMY, SAVE_KEY, STEP, VIEW, WANTED, WEAPONS, WORLD } from './config.js';
import { makeRng, clamp, dist } from './random.js';
import { buildCity, hitsBuilding, isBlocked } from './world.js';
import { ACTION_ATTACK, ACTION_CONFIRM, ACTION_HORN, ACTION_INTERACT, ACTION_PAUSE, ACTION_SHOOT, createInput } from './input.js';
import { createAudio } from './audio.js';
import { KIND_PARKED, KIND_POLICE, KIND_TRAFFIC, createCar, nearestCar, removeCar, spawnParked, spawnPoliceCar, spawnTraffic, updatePlayerCar, updatePoliceCar, updateTraffic } from './vehicles.js';
import { addWanted, copsWanted, createCop, createPed, createWanted, policeCarsWanted, scarePeds, spawnPeds, updateCop, updatePed, updateWanted } from './people.js';
import { MISSIONS, createMissionState, currentObjective, missionReward, startMission, updateMission } from './missions.js';
import { createCombat, hurtPlayer, punch, shoot, updateCombat } from './combat.js';
import { createRenderer, SCREEN_BRIEF, SCREEN_BUSTED, SCREEN_MISSION_DONE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY_DONE, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave(G) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash,
      missionIndex: G.missionIndex,
      hasPistol: G.player.hasPistol,
      ammo: G.player.ammo,
      bestCash: G.bestCash,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Ignore: the best haul then lasts this visit only.
  }
}

/** Build a fresh game state for a seed. */
function createGame(seedValue) {
  const rng = makeRng(seedValue);
  const city = buildCity(rng);
  const save = readSave();
  const G = {
    rng,
    city,
    seed: seedValue,
    camera: { x: 0, y: 0 },
    time: 0,
    elapsed: 0,
    player: {
      x: city.locations.diner.x + 60, y: city.locations.diner.y + 40,
      angle: 0, health: 100, alive: true,
      hasPistol: save?.hasPistol ?? false,
      ammo: save?.ammo ?? 0,
    },
    inCar: false,
    playerCar: null,
    cars: [],
    peds: [],
    cops: [],
    policeCars: [],
    wanted: createWanted(),
    combat: createCombat(),
    mission: createMissionState(),
    missionIndex: save?.missionIndex ?? 0,
    cash: save?.cash ?? ECONOMY.startCash,
    bestCash: Math.max(readBest(), save?.bestCash ?? 0),
    hasSave: !!save,
    objective: null,
    nextMissionTitle: '',
    nextMissionGiver: '',
    toasts: [],
    tracers: [],
    prompt: '',
    briefTitle: '',
    briefLines: [],
    doneTitle: '',
    doneLines: [],
    lastFine: 0,
    events: [],
    storyDone: false,
  };
  G.cars = [...spawnTraffic(rng, city, 14), ...spawnParked(rng, city, 8)];
  G.peds = spawnPeds(rng, city, 26);
  refreshMissionHint(G);
  return G;
}

function refreshMissionHint(G) {
  if (G.missionIndex < MISSIONS.length) {
    G.nextMissionTitle = MISSIONS[G.missionIndex].title;
    G.nextMissionGiver = MISSIONS[G.missionIndex].giver;
  }
}

/** A toast line over the HUD, fading after a few seconds. */
function toast(G, text, color) {
  G.toasts.push({ text, ttl: 3.2, color: color || '#f4f1ea' });
  if (G.toasts.length > 4) G.toasts.shift();
}

/** The player respawns after being busted or wasted. */
function respawn(G, place, fine) {
  const loc = G.city.locations[place];
  G.player.x = loc.x + 40;
  G.player.y = loc.y + 60;
  G.player.health = 100;
  G.player.alive = true;
  G.inCar = false;
  if (G.playerCar) {
    removeCar(G.cars, G.playerCar);
    G.playerCar = null;
  }
  G.wanted.stars = 0;
  G.wanted.heat = 0;
  G.cops = [];
  G.policeCars = [];
  G.lastFine = fine;
  G.cash = Math.max(0, G.cash - fine);
  writeSave(G);
}

/** Keep the police presence matched to the wanted level. */
function maintainPolice(G, dt) {
  const stars = G.wanted.stars;
  const wantCars = G.inCar || stars >= 2 ? policeCarsWanted(stars) : (stars >= 1 ? 1 : 0);
  while (G.policeCars.length < wantCars) {
    G.policeCars.push(spawnPoliceCar(G.rng, G.player.x, G.player.y));
  }
  while (G.policeCars.length > wantCars) G.policeCars.pop();
  const wantCops = G.inCar ? 0 : copsWanted(stars);
  while (G.cops.length < wantCops) {
    const a = G.rng() * Math.PI * 2;
    G.cops.push(createCop(
      clamp(G.player.x + Math.cos(a) * 420, 40, WORLD.width - 40),
      clamp(G.player.y + Math.sin(a) * 420, 40, WORLD.height - 40),
    ));
  }
  while (G.cops.length > wantCops) G.cops.pop();
  void dt;
}

/** The nearest shop or mission giver the player can use, with its prompt. */
function nearbyUse(G) {
  const p = G.player;
  if (G.inCar) return null;
  const locs = G.city.locations;
  const checks = [
    { key: 'gunshop', radius: 80, prompt: G.player.hasPistol ? null : `Buy pistol — $${WEAPONS.pistol.price}` },
    { key: 'spray', radius: 80, prompt: G.wanted.stars > 0 ? `Quick Coat — $${ECONOMY.sprayPrice} (lose the heat)` : null },
    { key: 'hospital', radius: 80, prompt: G.player.health < 100 ? `Patch up — $${ECONOMY.hospitalPrice}` : null },
  ];
  for (const c of checks) {
    if (!c.prompt) continue;
    const loc = locs[c.key];
    if (dist(p.x, p.y, loc.x, loc.y) < c.radius) return { kind: c.key, prompt: `Press E — ${c.prompt}` };
  }
  // Mission giver: Rosa at the diner, Marco at the hideout.
  if (G.missionIndex < MISSIONS.length && !G.mission.active) {
    const m = MISSIONS[G.missionIndex];
    const giverLoc = m.giver.startsWith('Rosa') ? locs.diner : locs.hideout;
    if (dist(p.x, p.y, giverLoc.x, giverLoc.y) < 90) {
      return { kind: 'mission', prompt: `Press E — Talk to ${m.giver.split(' — ')[0]} (${m.title})` };
    }
  }
  return null;
}

function useNearby(G, use) {
  const m = MISSIONS[G.missionIndex];
  if (use.kind === 'gunshop') {
    if (G.cash >= WEAPONS.pistol.price) {
      G.cash -= WEAPONS.pistol.price;
      G.player.hasPistol = true;
      G.player.ammo = WEAPONS.pistol.ammo;
      toast(G, 'Pistol bought — Space to shoot', '#f2c94c');
      audio.pickup();
      writeSave(G);
    } else {
      toast(G, `Need $${WEAPONS.pistol.price} for the pistol`, '#e5534b');
    }
  } else if (use.kind === 'spray') {
    if (G.cash >= ECONOMY.sprayPrice) {
      G.cash -= ECONOMY.sprayPrice;
      G.wanted.stars = 0;
      G.wanted.heat = 0;
      G.cops = [];
      G.policeCars = [];
      toast(G, 'Fresh coat — the heat is gone', '#58c184');
      audio.pickup();
      writeSave(G);
    } else {
      toast(G, `Need $${ECONOMY.sprayPrice} for a new coat`, '#e5534b');
    }
  } else if (use.kind === 'hospital') {
    if (G.cash >= ECONOMY.hospitalPrice) {
      G.cash -= ECONOMY.hospitalPrice;
      G.player.health = 100;
      toast(G, 'Patched up — good as new', '#58c184');
      audio.pickup();
      writeSave(G);
    } else {
      toast(G, `Need $${ECONOMY.hospitalPrice} to get patched up`, '#e5534b');
    }
  } else if (use.kind === 'mission') {
    G.briefTitle = `${m.title} — ${m.giver}`;
    G.briefLines = [m.brief, `Reward: $${m.reward}`];
    return SCREEN_BRIEF;
  }
  return null;
}

/** Drain the event queue: sounds, toasts and wanted changes. */
function handleEvents(G, screenRef) {
  for (const event of G.events) {
    if (event === 'punch') audio.punch();
    else if (event === 'shoot') audio.shoot();
    else if (event === 'dryFire') toast(G, 'No ammo — buy more at Harbor Arms', '#e5534b');
    else if (event === 'shotHeard') addWanted(G.wanted, WANTED.shoot);
    else if (event === 'hitPed') {
      addWanted(G.wanted, WANTED.hitPed);
      toast(G, 'You ran someone over!', '#e5534b');
    } else if (event === 'killPed') addWanted(G.wanted, WANTED.killPed);
    else if (event === 'killCop') addWanted(G.wanted, WANTED.killCop);
    else if (event === 'copHit') {
      if (hurtPlayer(G.player, 8)) {
        screenRef.screen = SCREEN_WASTED;
        respawn(G, 'hospital', ECONOMY.wastedFine);
        audio.busted();
      }
    } else if (event === 'crash') audio.punch();
    else if (event === 'grabCash') {
      addWanted(G.wanted, WANTED.max);
      toast(G, 'The alarm is screaming — RUN!', '#e5534b');
    } else if (event === 'missionStep') audio.pickup();
    else if (event === 'missionDone') {
      const reward = missionReward(G.mission.index);
      G.cash += reward;
      G.bestCash = Math.max(G.bestCash, G.cash);
      saveBest(G.bestCash);
      G.missionIndex = G.mission.index + 1;
      refreshMissionHint(G);
      G.doneTitle = `${MISSIONS[G.mission.index].title} — done`;
      G.doneLines = [`Rosa wires you $${reward}.`, G.missionIndex < MISSIONS.length
        ? `Next up: ${MISSIONS[G.missionIndex].title}.`
        : 'That was the last job.'];
      audio.missionDone();
      writeSave(G);
      screenRef.screen = SCREEN_MISSION_DONE;
    } else if (event === 'missionFailed') {
      toast(G, 'Job failed — talk to your contact and try again', '#e5534b');
    }
  }
  G.events.length = 0;
}

/** One fixed simulation step while playing. */
function stepGame(G, dt, input, screenRef) {
  const p = G.player;
  const actions = input.takeActions();
  const interact = !!(actions & ACTION_INTERACT);

  // Mute toggle works on every screen.
  if (input.takeMute()) audio.setMuted(!audio.isMuted());

  // On foot.
  if (!G.inCar) {
    const mx = input.moveX();
    const my = input.moveY();
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my) || 1;
      const speed = input.running() ? 320 : 210;
      p.angle = Math.atan2(my / len, mx / len);
      const nx = p.x + (mx / len) * speed * dt;
      const ny = p.y + (my / len) * speed * dt;
      if (!isBlocked(G.city, nx, p.y, 14)) p.x = nx;
      if (!isBlocked(G.city, p.x, ny, 14)) p.y = ny;
    }
    if (actions & ACTION_ATTACK) punch(G.combat, p, G.peds, G.cops, G.events);
    if (actions & ACTION_SHOOT) shoot(G.combat, p, G.peds, G.cops, G.time, G.events);

    // Enter a car, or use something nearby. A mission's own E step wins over a car:
    // the mission update below gets this same press and completes the step.
    if (interact) {
      const missionStep = G.mission.active ? MISSIONS[G.mission.index].steps[G.mission.step] : null;
      const missionInteractHere = missionStep && missionStep.type === 'interact'
        && dist(p.x, p.y, G.city.locations[missionStep.loc].x, G.city.locations[missionStep.loc].y) < missionStep.radius;
      const car = missionInteractHere ? null : nearestCar(G.cars, p.x, p.y, 70);
      if (car && car.kind !== KIND_POLICE) {
        if (car.kind === KIND_TRAFFIC && car.driver) {
          // The driver bails and runs; someone always sees a carjacking.
          const driver = createPed(G.rng, car.x, car.y);
          driver.flee = 3;
          driver.angle = Math.atan2(driver.y - p.y, driver.x - p.x);
          G.peds.push(driver);
          car.driver = false;
          addWanted(G.wanted, WANTED.stealCar);
          toast(G, 'Carjacked! The cops were told.', '#e5534b');
          scarePeds(G.peds, p.x, p.y, 260);
        }
        removeCar(G.cars, car);
        G.playerCar = car;
        G.inCar = true;
        audio.engine(0.2);
      } else {
        const use = nearbyUse(G);
        if (use) {
          const next = useNearby(G, use);
          if (next) screenRef.screen = next;
        }
      }
    }
  } else {
    // Driving: W/Up is throttle, S/Down is brake, A/D steer, Space is the handbrake.
    const car = G.playerCar;
    updatePlayerCar(car, dt, {
      throttle: input.moveY() < 0 ? 1 : 0,
      brake: input.moveY() > 0 ? 1 : 0,
      steer: input.moveX(),
      handbrake: !!(actions & ACTION_SHOOT),
    }, G.city, G.cars, G.peds, G.events);
    // The player rides where the car is, so missions and the camera track the car.
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (actions & ACTION_HORN) audio.horn();
    if (interact) {
      // Step out beside the car.
      const side = { x: car.x + Math.cos(car.angle + Math.PI / 2) * 44, y: car.y + Math.sin(car.angle + Math.PI / 2) * 44 };
      const other = { x: car.x - Math.cos(car.angle + Math.PI / 2) * 44, y: car.y - Math.sin(car.angle + Math.PI / 2) * 44 };
      const spot = !isBlocked(G.city, side.x, side.y, 14) ? side : other;
      p.x = spot.x;
      p.y = spot.y;
      p.angle = car.angle;
      car.kind = KIND_PARKED;
      car.driver = false;
      car.speed = 0;
      G.cars.push(car);
      G.playerCar = null;
      G.inCar = false;
      audio.engine(0);
    }
    if (car.health <= 0) {
      toast(G, 'Your car is wrecked — get out and find another', '#e5534b');
      G.playerCar = null;
      G.inCar = false;
      p.x = car.x + 40;
      p.y = car.y;
      car.kind = KIND_PARKED;
      G.cars.push(car);
    }
  }

  // The world lives around the player.
  for (const car of G.cars) updateTraffic(car, dt, G.rng, G.cars);
  for (const ped of G.peds) updatePed(ped, dt, G.rng, G.city);
  G.peds = G.peds.filter((ped) => ped.alive || ped.knocked);
  updateCombat(G.combat, dt);
  G.tracers = G.combat.tracers;

  // Police.
  maintainPolice(G, dt);
  for (const cop of G.cops) {
    const result = updateCop(cop, dt, p, G.events);
    if (result === 'bust') {
      screenRef.screen = SCREEN_BUSTED;
      respawn(G, 'policeHQ', ECONOMY.bustedFine);
      audio.busted();
      return;
    }
  }
  for (const cruiser of G.policeCars) {
    const close = updatePoliceCar(cruiser, dt, G.inCar ? G.playerCar : p, G.city);
    if (close && G.inCar && Math.abs(G.playerCar.speed) > 60) {
      G.playerCar.health -= 12 * dt;
      if (Math.random() < dt * 2) G.events.push('crash');
    }
  }

  // Wanted heat cools when the player is out of trouble.
  const inTrouble = G.cops.length > 0 || G.policeCars.length > 0;
  updateWanted(G.wanted, dt, inTrouble);

  // Missions.
  if (G.mission.active) {
    updateMission(G.mission, dt, p, interact, G.city, G.events);
    const m = MISSIONS[G.mission.index];
    if (m.wantedOnStart && G.mission.step === 0 && !G.mission.wantedSet) {
      G.mission.wantedSet = true;
      addWanted(G.wanted, m.wantedOnStart);
    }
  }
  G.objective = currentObjective(G.mission, G.city);

  // Interaction prompt.
  if (!G.inCar) {
    const car = nearestCar(G.cars, p.x, p.y, 70);
    if (car && car.kind !== KIND_POLICE) G.prompt = `Press E — ${car.kind === KIND_TRAFFIC ? 'Jack the car' : 'Get in'}`;
    else {
      const use = nearbyUse(G);
      G.prompt = use ? use.prompt : '';
    }
  } else {
    G.prompt = 'Press E — get out';
  }

  // Toasts and camera.
  for (const t of G.toasts) t.ttl -= dt;
  G.toasts = G.toasts.filter((t) => t.ttl > 0);
  G.camera.x = clamp(p.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
  G.camera.y = clamp(p.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
  G.time += dt;
  G.elapsed += dt;

  audio.engine(G.inCar ? Math.abs(G.playerCar.speed) / 520 : 0);
  audio.siren(dt, G.policeCars.length > 0);
  audio.music(dt);
}

function runShot(name) {
  const G = createGame(seed);
  const scene = stageShot(name, G, stepGame);
  const renderer = createRenderer(canvas);
  let painted = 0;
  function paint() {
    renderer.draw(G, scene.screen, scene.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const G = createGame(seed);
  const renderer = createRenderer(canvas);
  const input = createInput(canvas);
  const screenRef = { screen: SCREEN_TITLE };
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startMissionFromBrief() {
    const m = MISSIONS[G.missionIndex];
    startMission(G.mission, G.missionIndex);
    G.mission.wantedSet = false;
    toast(G, `${m.title} — ${m.brief.split('.')[0]}.`, '#f2c94c');
    screenRef.screen = SCREEN_PLAY;
    announce(`Mission started: ${m.title}.`);
  }

  function handleActions() {
    const actions = input.takeActions(ACTION_PAUSE | ACTION_CONFIRM);
    if (actions & ACTION_PAUSE) {
      if (screenRef.screen === SCREEN_PLAY) {
        screenRef.screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screenRef.screen === SCREEN_PAUSED) {
        screenRef.screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (!(actions & ACTION_CONFIRM)) return;
    if (screenRef.screen === SCREEN_TITLE) {
      screenRef.screen = SCREEN_PLAY;
      audio.ensure();
      announce('Playing. Drive to Rosa or Marco to start your first job.');
    } else if (screenRef.screen === SCREEN_BRIEF) {
      startMissionFromBrief();
    } else if (screenRef.screen === SCREEN_MISSION_DONE) {
      if (G.missionIndex >= MISSIONS.length) screenRef.screen = SCREEN_STORY_DONE;
      else screenRef.screen = SCREEN_PLAY;
    } else if (screenRef.screen === SCREEN_BUSTED || screenRef.screen === SCREEN_WASTED) {
      screenRef.screen = SCREEN_PLAY;
    } else if (screenRef.screen === SCREEN_STORY_DONE) {
      screenRef.screen = SCREEN_PLAY;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screenRef.screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        stepGame(G, STEP, input, screenRef);
        handleEvents(G, screenRef);
        accumulator -= STEP;
        if (screenRef.screen !== SCREEN_PLAY) break;
      }
    } else {
      accumulator = 0;
      if (screenRef.screen === SCREEN_TITLE) {
        // Slow pan over downtown behind the title.
        G.time += 1 / 60;
        G.camera.x = clamp(900 + Math.sin(G.time * 0.05) * 500, 0, WORLD.width - VIEW.width);
        G.camera.y = clamp(700 + Math.cos(G.time * 0.04) * 300, 0, WORLD.height - VIEW.height);
      }
    }
    renderer.draw(G, screenRef.screen, G.time);
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screenRef.screen === SCREEN_PLAY) {
      screenRef.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solara Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
