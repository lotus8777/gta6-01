// Combat for Solara Bay: fists and the pistol, on foot. Shots are hitscan in the
// player's facing direction; tracers are kept for the renderer to draw.

import { PLAYER, WANTED, WEAPONS } from './config.js';
import { angleDiff, clamp, dist } from './random.js';

export function createCombat() {
  return {
    punchCooldown: 0,
    shootCooldown: 0,
    lastShotWantedAt: -99,
    tracers: [],
  };
}

/** The nearest living person within `range` and inside the facing arc. */
function nearestInArc(list, x, y, angle, rangePx, arc) {
  let best = null;
  let bestD = rangePx;
  for (const p of list) {
    if (!p.alive) continue;
    const d = dist(x, y, p.x, p.y);
    if (d > bestD) continue;
    const a = Math.atan2(p.y - y, p.x - x);
    if (Math.abs(angleDiff(angle, a)) > arc) continue;
    best = p;
    bestD = d;
  }
  return best;
}

/** A punch in the facing direction. Pushes events for what happened. */
export function punch(combat, player, peds, cops, events) {
  if (combat.punchCooldown > 0) return;
  combat.punchCooldown = PLAYER.punchCooldown;
  events.push('punch');
  const all = [...peds, ...cops];
  const hit = nearestInArc(all, player.x, player.y, player.angle, PLAYER.punchRange + 14, PLAYER.punchArc);
  if (!hit) return;
  hit.health = (hit.health ?? 100) - PLAYER.punchDamage;
  hit.knocked = true;
  if (hit.health <= 0) {
    hit.alive = false;
    events.push(hit.kind === 'cop' ? 'killCop' : 'killPed');
  }
}

/**
 * A pistol shot in the facing direction. Hits the nearest person in a narrow cone out
 * to the pistol's range; the tracer is drawn for a blink. Firing where cops can hear
 * it raises the wanted level (once every few seconds, not once a bullet).
 */
export function shoot(combat, player, peds, cops, time, events) {
  if (combat.shootCooldown > 0) return;
  if (!player.hasPistol || player.ammo <= 0) {
    events.push('dryFire');
    return;
  }
  combat.shootCooldown = WEAPONS.pistol.cooldown;
  player.ammo -= 1;
  events.push('shoot');
  const rangePx = WEAPONS.pistol.range;
  const ex = player.x + Math.cos(player.angle) * rangePx;
  const ey = player.y + Math.sin(player.angle) * rangePx;
  const all = [...peds, ...cops];
  const hit = nearestInArc(all, player.x, player.y, player.angle, rangePx, 0.12);
  let tx = ex;
  let ty = ey;
  if (hit) {
    tx = hit.x;
    ty = hit.y;
    hit.health = (hit.health ?? 100) - WEAPONS.pistol.damage;
    if (hit.health <= 0) {
      hit.alive = false;
      events.push(hit.kind === 'cop' ? 'killCop' : 'killPed');
    }
  }
  combat.tracers.push({ x1: player.x, y1: player.y, x2: tx, y2: ty, ttl: 0.08 });
  if (time - combat.lastShotWantedAt > 3) {
    combat.lastShotWantedAt = time;
    events.push('shotHeard');
  }
}

/** One combat step: cooldowns tick down, tracers fade. */
export function updateCombat(combat, dt) {
  combat.punchCooldown = Math.max(0, combat.punchCooldown - dt);
  combat.shootCooldown = Math.max(0, combat.shootCooldown - dt);
  for (const t of combat.tracers) t.ttl -= dt;
  combat.tracers = combat.tracers.filter((t) => t.ttl > 0);
}

/** Damage the player; returns true when the player is wasted. */
export function hurtPlayer(player, amount) {
  player.health = clamp(player.health - amount, 0, PLAYER.health);
  return player.health <= 0;
}

export { WANTED };
