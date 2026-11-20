// Cars for Solara Bay: traffic that drives the road grid, parked cars to steal, the
// player's car with arcade physics, and police cars that chase. No drawing here —
// render.js draws what these objects hold.

import { CAR, PALETTE, WANTED, WORLD } from './config.js';
import { ROADS_H, ROADS_V, ROAD_W, hitsBuilding, isBlocked, nearestRoadPoint, randomRoadPoint, route } from './world.js';
import { angleDiff, clamp, dist, int, pick } from './random.js';

export const KIND_TRAFFIC = 'traffic';
export const KIND_POLICE = 'police';
export const KIND_PARKED = 'parked';

let nextId = 1;

/** A car: position, heading, speed along the heading, colour and kind. */
export function createCar(x, y, angle, color, kind) {
  return {
    id: nextId,
    x, y, angle,
    speed: 0,
    vx: 0, vy: 0,
    color,
    kind,
    // Traffic AI state: which road axis it follows and which way.
    axis: 'v',
    dir: 1,
    lane: 14,
    turnCooldown: 0,
    health: 100,
    smoking: false,
    driver: kind === KIND_TRAFFIC,
    fleeTimer: 0,
  };
}

/** Spawn the city's traffic on the roads. */
export function spawnTraffic(rng, city, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(rng);
    const car = createCar(p.x, p.y, 0, pick(rng, PALETTE.trafficCar), KIND_TRAFFIC);
    car.axis = Math.abs(p.x - nearestRoadPoint(p.x, p.y).x) < 1 ? 'v' : 'h';
    car.dir = rng() < 0.5 ? 1 : -1;
    car.lane = 14;
    car.angle = car.axis === 'v' ? (car.dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (car.dir === 1 ? 0 : Math.PI);
    car.speed = 140 + rng() * 80;
    cars.push(car);
  }
  return cars;
}

/** Spawn parked cars along the road edges, free for the taking (no driver, no witness). */
export function spawnParked(rng, city, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(rng);
    const onV = Math.abs(p.x - nearestRoadPoint(p.x, p.y).x) < 1;
    const off = (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 20);
    const car = createCar(
      onV ? p.x + off : p.x,
      onV ? p.y : p.y + off,
      onV ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI),
      pick(rng, PALETTE.trafficCar),
      KIND_PARKED,
    );
    car.driver = false;
    cars.push(car);
  }
  return cars;
}

/** A fresh police car, at a road point near (x, y). */
export function spawnPoliceCar(rng, x, y) {
  const p = nearestRoadPoint(x + (rng() < 0.5 ? -300 : 300), y + (rng() < 0.5 ? -300 : 300));
  const car = createCar(p.x, p.y, 0, PALETTE.copCar, KIND_POLICE);
  car.axis = 'chase';
  car.speed = 200;
  return car;
}

/** Is (x, y) at an intersection (near both a vertical and a horizontal road)? */
function atIntersection(x, y) {
  let onV = false;
  let onH = false;
  for (const vx of ROADS_V) if (Math.abs(x - vx) <= ROAD_W / 2) onV = true;
  for (const hy of ROADS_H) if (Math.abs(y - hy) <= ROAD_W / 2) onH = true;
  return onV && onH;
}

/** The car ahead of `car` on the same lane, if one is close. */
function carAhead(car, cars) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let best = null;
  let bestD = 110;
  for (const other of cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(dx * -fy + dy * fx);
    if (along > 0 && along < bestD && side < 30) {
      best = other;
      bestD = along;
    }
  }
  return best;
}

/** One traffic step: follow the road, turn at intersections, brake for the car ahead. */
export function updateTraffic(car, dt, rng, cars) {
  if (car.kind === KIND_PARKED) return;
  car.turnCooldown -= dt;
  const targetSpeed = carAhead(car, cars) ? 0 : 150 + ((car.id * 37) % 70);
  car.speed += clamp(targetSpeed - car.speed, -500 * dt, 240 * dt);

  if (atIntersection(car.x, car.y) && car.turnCooldown <= 0 && rng() < 0.004) {
    // Turn onto the crossing road.
    if (car.axis === 'v') {
      car.axis = 'h';
      car.dir = rng() < 0.5 ? 1 : -1;
      car.angle = car.dir === 1 ? 0 : Math.PI;
    } else {
      car.axis = 'v';
      car.dir = rng() < 0.5 ? 1 : -1;
      car.angle = car.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.turnCooldown = 4;
  }

  // Keep to the right-hand lane of the road it follows.
  const lane = car.axis === 'v'
    ? (car.dir === 1 ? -14 : 14)
    : (car.dir === 1 ? 14 : -14);
  const centre = car.axis === 'v'
    ? nearestRoadPoint(car.x, car.y).x + lane
    : nearestRoadPoint(car.x, car.y).y + lane;
  if (car.axis === 'v') {
    car.x += clamp(centre - car.x, -60 * dt, 60 * dt);
    car.y += car.dir * car.speed * dt;
  } else {
    car.y += clamp(centre - car.y, -60 * dt, 60 * dt);
    car.x += car.dir * car.speed * dt;
  }

  // End of the road: turn around and head back into the city. The position is clamped
  // and the direction set (not just flipped), so a car at the edge cannot jitter in
  // place, flipping every step while the cars behind it queue up.
  if (car.axis === 'v') {
    if (car.y > WORLD.height - 100) {
      car.y = WORLD.height - 100;
      car.dir = -1;
      car.angle = -Math.PI / 2;
      car.turnCooldown = 3;
    } else if (car.y < 100) {
      car.y = 100;
      car.dir = 1;
      car.angle = Math.PI / 2;
      car.turnCooldown = 3;
    }
  } else if (car.x > WORLD.width - 300) {
    car.x = WORLD.width - 300;
    car.dir = -1;
    car.angle = Math.PI;
    car.turnCooldown = 3;
  } else if (car.x < 100) {
    car.x = 100;
    car.dir = 1;
    car.angle = 0;
    car.turnCooldown = 3;
  }
}

/**
 * One police step: chase the target along the roads, like a real pursuit — routed
 * through the intersections, slowing for turns, so the cruiser stays on the street
 * instead of cutting across blocks. Returns true when the cruiser is close enough
 * to its target to act (a cop gets out, or the ram lands).
 */
export function updatePoliceCar(car, dt, target, city) {
  // Re-route when the trail runs out or the target has moved a long way.
  if (!car.waypoints || car.waypoints.length === 0 || (car.retarget -= dt) <= 0) {
    car.waypoints = route(car.x, car.y, target.x, target.y);
    car.retarget = 2;
  }
  while (car.waypoints.length > 0 && dist(car.x, car.y, car.waypoints[0].x, car.waypoints[0].y) < 120) {
    car.waypoints.shift();
  }
  const d = dist(car.x, car.y, target.x, target.y);
  // Close in: drop the route and ram straight at the target.
  const aim = d < 130 || car.waypoints.length === 0
    ? { x: target.x, y: target.y }
    : car.waypoints[0];
  const want = Math.atan2(aim.y - car.y, aim.x - car.x);
  const diff = angleDiff(car.angle, want);
  const turn = clamp(diff * 2.2, -2.4 * dt, 2.4 * dt);
  car.angle += turn;
  // Slow for sharp turns so the cruiser makes the corner instead of sliding wide.
  const targetSpeed = Math.abs(diff) < 0.4 ? 460 : (Math.abs(diff) < 1.0 ? 300 : 170);
  car.speed += clamp(targetSpeed - car.speed, -700 * dt, 500 * dt);
  const px = car.x;
  const py = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // A cruiser does not drive through a building: stop at the wall and turn away.
  if (city && hitsBuilding(city, car.x, car.y, 18)) {
    car.x = px;
    car.y = py;
    car.speed *= 0.4;
    car.angle += 0.6;
  }
  // Police do not drive into the sea or through buildings: slide along them.
  if (car.x < 30) car.x = 30;
  if (car.y < 30) car.y = 30;
  if (car.x > WORLD.width - 30) car.x = WORLD.width - 30;
  if (car.y > WORLD.height - 30) car.y = WORLD.height - 30;
  return d < 60;
}

/**
 * The player's car: arcade physics with drift. `input` is { throttle, brake, steer,
 * handbrake } with throttle/brake 0/1 and steer -1..1. Pushes `events` for what happened.
 */
export function updatePlayerCar(car, dt, input, city, cars, peds, events) {
  const forward = input.throttle ? 1 : 0;
  const back = input.brake ? 1 : 0;
  if (forward) car.speed += CAR.accel * dt;
  if (back) {
    if (car.speed > 20) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  }
  car.speed -= car.speed * CAR.drag * dt;
  if (input.handbrake) car.speed -= car.speed * 2.2 * dt;
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);

  const steer = input.steer * (car.speed >= 0 ? 1 : -1);
  const turnRate = CAR.turnRate * clamp(Math.abs(car.speed) / 160, 0, 1) * (input.handbrake ? 1.5 : 1);
  car.angle += steer * turnRate * dt;

  // Velocity follows the heading, with drift: the car slides a little sideways.
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  const wantVx = hx * car.speed;
  const wantVy = hy * car.speed;
  car.vx += (wantVx - car.vx) * Math.min(1, CAR.grip * dt);
  car.vy += (wantVy - car.vy) * Math.min(1, CAR.grip * dt);
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Buildings: push out and scrape speed off.
  const hit = hitsBuilding(city, car.x, car.y, 22);
  if (hit) {
    const cx = clamp(car.x, hit.x, hit.x + hit.w);
    const cy = clamp(car.y, hit.y, hit.y + hit.h);
    const dx = car.x - cx;
    const dy = car.y - cy;
    const dd = Math.hypot(dx, dy) || 1;
    const push = 22 - dd + 1;
    car.x += (dx / dd) * push;
    car.y += (dy / dd) * push;
    if (Math.abs(car.speed) > 240) {
      car.health -= 6;
      events.push('crash');
    }
    car.speed *= 0.55;
    car.vx *= 0.5;
    car.vy *= 0.5;
  }
  if (car.x < 24) { car.x = 24; car.speed *= 0.6; }
  if (car.y < 24) { car.y = 24; car.speed *= 0.6; }
  if (car.x > WORLD.width - 24) { car.x = WORLD.width - 24; car.speed *= 0.6; }
  if (car.y > WORLD.height - 24) { car.y = WORLD.height - 24; car.speed *= 0.6; }

  // Other cars: bounce off each other.
  for (const other of cars) {
    if (other === car || other.kind === KIND_PARKED) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 46 && d > 0.01) {
      const nx = (car.x - other.x) / d;
      const ny = (car.y - other.y) / d;
      car.x += nx * (46 - d) * 0.5;
      car.y += ny * (46 - d) * 0.5;
      car.speed *= 0.8;
      if (Math.abs(car.speed) > 200) events.push('crash');
    }
  }

  // Pedestrians: running one over is a crime — and it is felt.
  for (const ped of peds) {
    if (!ped.alive) continue;
    if (dist(car.x, car.y, ped.x, ped.y) < 30 && Math.abs(car.speed) > 60) {
      ped.alive = false;
      ped.knocked = true;
      events.push('hitPed');
      car.speed *= 0.7;
    }
  }

  if (car.health <= 0) {
    car.smoking = true;
    car.speed = 0;
  }
  if (car.health < 40) car.smoking = true;
}

/** The nearest car to (x, y) within range, for stealing and entering. */
export function nearestCar(cars, x, y, rangePx) {
  let best = null;
  let bestD = rangePx;
  for (const car of cars) {
    const d = dist(car.x, car.y, x, y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

/** Remove a car from the list (stolen traffic cars keep driving as the player's). */
export function removeCar(cars, car) {
  const i = cars.indexOf(car);
  if (i >= 0) cars.splice(i, 1);
}

export { WANTED };
