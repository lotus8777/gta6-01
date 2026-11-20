// Solara Bay's city: a road grid, the blocks between the roads, the buildings on them,
// a park, a beach and the sea, and the named places the story happens at. Pure data and
// geometry — no drawing and no browser in it — so the same seed always builds the same city.

import { WORLD, PALETTE } from './config.js';
import { dist, int, pick, range } from './random.js';

/** Road centrelines. Vertical avenues run north-south, horizontal streets east-west. */
export const ROADS_V = [220, 720, 1220, 1720, 2220, 2720];
export const ROADS_H = [220, 660, 1100, 1540, 1980];
export const ROAD_W = 110;

export const DISTRICTS = ['Old Town', 'Downtown', 'Marina', 'Northside', 'The Docks', 'Palm Heights'];

/**
 * Build the city from a seeded rng. Returns the buildings, trees, park, beach, sea and
 * the named locations (each with x, y and a label).
 */
export function buildCity(rng) {
  const buildings = [];
  const trees = [];
  const locations = {};

  const parkCol = 2;
  const parkRow = 1;

  // Named places: one per mission beat, spread across the map so missions make you drive.
  // They are fixed before the buildings go in, so no building ever covers one.
  locations.diner = { x: 470, y: 440, label: "Rosa's Diner" };
  locations.bank = { x: 1470, y: 880, label: 'Solara Bank' };
  locations.gunshop = { x: 970, y: 1760, label: 'Harbor Arms' };
  locations.spray = { x: 1970, y: 440, label: 'Quick Coat Spray' };
  locations.hospital = { x: 2470, y: 1320, label: 'St. Solara Hospital' };
  locations.policeHQ = { x: 1470, y: 440, label: 'Police HQ' };
  locations.hideout = { x: 310, y: 1760, label: 'The Hideout' };
  locations.port = { x: 2830, y: 2100, label: 'The Docks' };

  // A building must not cover a named place (or the ground around it, where the
  // player stands to use it).
  function coversPlace(x, y, w, h) {
    for (const loc of Object.values(locations)) {
      if (x < loc.x + 55 && x + w > loc.x - 55 && y < loc.y + 55 && y + h > loc.y - 55) return true;
    }
    return false;
  }

  for (let col = 0; col < ROADS_V.length - 1; col += 1) {
    for (let row = 0; row < ROADS_H.length - 1; row += 1) {
      const x0 = ROADS_V[col] + ROAD_W / 2 + 14;
      const x1 = ROADS_V[col + 1] - ROAD_W / 2 - 14;
      const y0 = ROADS_H[row] + ROAD_W / 2 + 14;
      const y1 = ROADS_H[row + 1] - ROAD_W / 2 - 14;
      const district = DISTRICTS[(col + row * 2) % DISTRICTS.length];

      // One block is the city park: grass, paths and trees, no buildings.
      if (col === parkCol && row === parkRow) {
        for (let i = 0; i < 26; i += 1) {
          trees.push({ x: range(rng, x0 + 20, x1 - 20), y: range(rng, y0 + 20, y1 - 20), r: range(rng, 10, 18) });
        }
        locations.park = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, label: 'Solara Park' };
        continue;
      }

      // The east edge is beach, not blocks: the last column stays open sand.
      if (col === ROADS_V.length - 2) continue;

      const count = int(rng, 3, 5);
      for (let i = 0; i < count; i += 1) {
        const w = range(rng, 90, 170);
        const h = range(rng, 80, 150);
        // Try a few spots: a building that would cover a named place is moved, not lost.
        let placed = false;
        for (let attempt = 0; attempt < 4 && !placed; attempt += 1) {
          const x = range(rng, x0, Math.max(x0, x1 - w));
          const y = range(rng, y0, Math.max(y0, y1 - h));
          if (coversPlace(x, y, w, h)) continue;
          placed = true;
          buildings.push({
            x, y, w, h,
            color: pick(rng, PALETTE.buildingRoof),
            height: int(rng, 1, 3),
            district,
          });
        }
      }
      for (let i = 0; i < 3; i += 1) {
        trees.push({ x: range(rng, x0 + 10, x1 - 10), y: range(rng, y0 + 10, y1 - 10), r: range(rng, 8, 13) });
      }
    }
  }

  // The beach and the sea run down the east edge of the map.
  const beach = { x: 2900, y: 0, w: WORLD.width - 2900, h: WORLD.height };
  const sea = { x: 3080, y: 0, w: WORLD.width - 3080, h: WORLD.height };

  return { buildings, trees, beach, sea, locations };
}

/** True when the point is on a road (within half the road width of a centreline). */
export function onRoad(x, y) {
  for (const vx of ROADS_V) if (Math.abs(x - vx) <= ROAD_W / 2) return true;
  for (const hy of ROADS_H) if (Math.abs(y - hy) <= ROAD_W / 2) return true;
  return false;
}

/** True when the point is in the sea (not drivable, not walkable). */
export function inSea(city, x, y) {
  return x >= city.sea.x && x <= city.sea.x + city.sea.w && y >= 0 && y <= WORLD.height;
}

/** True when the point (with radius r) overlaps a building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/** True when the point (with radius r) is blocked for walking or driving. */
export function isBlocked(city, x, y, r) {
  if (x < r || y < r || x > WORLD.width - r || y > WORLD.height - r) return true;
  if (inSea(city, x, y)) return true;
  return hitsBuilding(city, x, y, r) !== null;
}

/** The nearest point on a road centreline to (x, y). */
export function nearestRoadPoint(x, y) {
  let bestV = ROADS_V[0];
  for (const vx of ROADS_V) if (Math.abs(x - vx) < Math.abs(x - bestV)) bestV = vx;
  let bestH = ROADS_H[0];
  for (const hy of ROADS_H) if (Math.abs(y - hy) < Math.abs(y - bestH)) bestH = hy;
  if (Math.abs(x - bestV) < Math.abs(y - bestH)) return { x: bestV, y };
  return { x, y: bestH };
}

/** A random point on a road, for spawning traffic. */
export function randomRoadPoint(rng) {
  if (rng() < 0.5) {
    return { x: pick(rng, ROADS_V), y: range(rng, 60, WORLD.height - 60) };
  }
  return { x: range(rng, 60, WORLD.width - 260), y: pick(rng, ROADS_H) };
}

/** A random point on a sidewalk (just off a road), for spawning pedestrians. The point
 * is retried until it is not inside a building: sidewalks run beside blocks, and a
 * building can stand where the first try lands. */
export function randomSidewalkPoint(rng, city) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const p = randomRoadPoint(rng);
    const off = (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 16 + rng() * 30);
    const point = rng() < 0.5 ? { x: p.x + off, y: p.y } : { x: p.x, y: p.y + off };
    if (!city || !isBlocked(city, point.x, point.y, 12)) return point;
  }
  // Fallback: the middle of the park, always open.
  const park = city?.locations?.park;
  return park ? { x: park.x, y: park.y } : { x: 1220, y: 660 };
}

/** Intersections of the road grid, as nodes of a tiny route graph. */
export function intersections() {
  const nodes = [];
  for (const vx of ROADS_V) {
    for (const hy of ROADS_H) {
      nodes.push({ x: vx, y: hy });
    }
  }
  return nodes;
}

function nearestNode(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const n of intersections()) {
    const d = dist(x, y, n.x, n.y);
    if (d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/**
 * A route along the roads from (fx, fy) to (tx, ty): breadth-first over the
 * intersections, then the target itself. Driving it looks like driving the city.
 */
export function route(fx, fy, tx, ty) {
  const nodes = intersections();
  const start = nearestNode(fx, fy);
  const goal = nearestNode(tx, ty);
  const key = (n) => `${n.x},${n.y}`;
  const prev = new Map();
  const seen = new Set([key(start)]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const n of nodes) {
      if (seen.has(key(n))) continue;
      // Neighbours share a road: same avenue or same street, adjacent in the grid.
      const sameV = n.x === cur.x && Math.abs(n.y - cur.y) <= 460;
      const sameH = n.y === cur.y && Math.abs(n.x - cur.x) <= 560;
      if (!sameV && !sameH) continue;
      seen.add(key(n));
      prev.set(key(n), cur);
      queue.push(n);
    }
  }
  const path = [];
  let cur = goal;
  while (cur && key(cur) !== key(start)) {
    path.unshift(cur);
    cur = prev.get(key(cur));
  }
  path.push({ x: tx, y: ty });
  return path;
}
