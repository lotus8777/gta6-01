// People for Solara Bay: pedestrians strolling the sidewalks, and the police — on-foot
// cops who chase and bust, driven by the wanted level. No drawing here.

import { PALETTE, PLAYER, WANTED, WORLD } from './config.js';
import { isBlocked, randomSidewalkPoint } from './world.js';
import { angleDiff, clamp, dist, pick, range } from './random.js';

export const KIND_PED = 'ped';
export const KIND_COP = 'cop';

/** A person on foot: position, facing, speed, colour, and what they are doing. */
export function createPed(rng, x, y) {
  return {
    kind: KIND_PED,
    x, y,
    angle: range(rng, 0, Math.PI * 2),
    speed: 34 + rng() * 26,
    color: pick(rng, PALETTE.pedShirt),
    alive: true,
    knocked: false,
    // Walking state: a sidewalk target to stroll toward.
    tx: x, ty: y,
    wait: 0,
    flee: 0,
  };
}

/** Spawn the city's pedestrians. */
export function spawnPeds(rng, city, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomSidewalkPoint(rng, city);
    peds.push(createPed(rng, p.x, p.y));
  }
  return peds;
}

/** A cop on foot, spawned at (x, y). */
export function createCop(x, y) {
  return {
    kind: KIND_COP,
    x, y,
    angle: 0,
    speed: 250,
    color: PALETTE.cop,
    alive: true,
    knocked: false,
    tx: x, ty: y,
    wait: 0,
    flee: 0,
    punchCooldown: 0,
  };
}

/** One pedestrian step: stroll to the target, wait, pick a new one; flee when scared. */
export function updatePed(ped, dt, rng, city) {
  if (!ped.alive) return;
  if (ped.flee > 0) {
    ped.flee -= dt;
    ped.x += Math.cos(ped.angle) * 260 * dt;
    ped.y += Math.sin(ped.angle) * 260 * dt;
    if (isBlocked(city, ped.x, ped.y, 10)) {
      ped.x -= Math.cos(ped.angle) * 260 * dt;
      ped.y -= Math.sin(ped.angle) * 260 * dt;
      ped.angle += Math.PI / 2;
    }
    return;
  }
  if (ped.wait > 0) {
    ped.wait -= dt;
    return;
  }
  const d = dist(ped.x, ped.y, ped.tx, ped.ty);
  if (d < 12) {
    if (rng() < 0.5) {
      ped.wait = 1 + rng() * 3;
    } else {
      const p = randomSidewalkPoint(rng, city);
      ped.tx = p.x;
      ped.ty = p.y;
    }
    return;
  }
  const want = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
  ped.angle += clamp(angleDiff(ped.angle, want), -3 * dt, 3 * dt);
  const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
  if (!isBlocked(city, nx, ny, 10)) {
    ped.x = nx;
    ped.y = ny;
  } else {
    ped.angle += Math.PI / 2;
  }
}

/** Scare nearby pedestrians (a gunshot, a car theft): they run away from (x, y). */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (!ped.alive) continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.flee = 2 + Math.random() * 2;
      ped.angle = Math.atan2(ped.y - y, ped.x - x);
    }
  }
}

/**
 * One cop step: chase the player. Returns 'bust' when the cop reaches the player,
 * 'punch' when the cop lands a hit, else ''.
 */
export function updateCop(cop, dt, player, events) {
  if (!player.alive) return '';
  cop.punchCooldown -= dt;
  const d = dist(cop.x, cop.y, player.x, player.y);
  if (d < WANTED.bustRadius) return 'bust';
  const want = Math.atan2(player.y - cop.y, player.x - cop.x);
  cop.angle += clamp(angleDiff(cop.angle, want), -4 * dt, 4 * dt);
  const speed = d > 200 ? 290 : 250;
  const nx = cop.x + Math.cos(cop.angle) * speed * dt;
  const ny = cop.y + Math.sin(cop.angle) * speed * dt;
  cop.x = clamp(nx, 16, WORLD.width - 16);
  cop.y = clamp(ny, 16, WORLD.height - 16);
  if (d < 34 && cop.punchCooldown <= 0) {
    cop.punchCooldown = 0.9;
    events.push('copHit');
    return 'punch';
  }
  return '';
}

/** The wanted level: stars, heat, and the decay clock. */
export function createWanted() {
  return { stars: 0, heat: 0, quietFor: 0 };
}

/** Raise the wanted level by `stars` (clamped to the max) and reset the decay clock. */
export function addWanted(wanted, stars) {
  wanted.stars = Math.min(WANTED.max, wanted.stars + stars);
  wanted.heat = 1;
  wanted.quietFor = 0;
}

/** One wanted step: heat cools while the player stays out of trouble, then stars fall. */
export function updateWanted(wanted, dt, inTrouble) {
  if (wanted.stars === 0) return;
  if (inTrouble) {
    wanted.quietFor = 0;
    return;
  }
  wanted.quietFor += dt;
  if (wanted.quietFor > WANTED.decaySeconds) {
    wanted.stars -= 1;
    wanted.quietFor = 0;
    if (wanted.stars === 0) wanted.heat = 0;
  }
}

/** How many police cars should be hunting at this wanted level. */
export function policeCarsWanted(stars) {
  return Math.min(3, stars * WANTED.huntersPerStar);
}

/** How many cops on foot should be chasing at this wanted level. */
export function copsWanted(stars) {
  return Math.min(4, stars);
}

export { PLAYER };
