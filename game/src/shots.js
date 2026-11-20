// The screenshot scenes behind ?shot=start|street|drive|chase. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by an autopilot
// that drives the road grid toward its objective, so the frame is what a short game
// really looks like and the same seed always gives the same frame.
import { STEP, VIEW, WORLD } from './config.js';
import { nearestRoadPoint, route } from './world.js';
import { addWanted } from './people.js';
import { createCar } from './vehicles.js';
import { startMission } from './missions.js';
import { angleDiff, clamp, dist } from './random.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const STREET_SECONDS = 9;
const DRIVE_SECONDS = 3;
const CHASE_SECONDS = 4;

/** A fake input object for the autopilot: the same shape the real input has. */
function fakeInput(steer, throttle, brake) {
  return {
    moveX: () => steer,
    moveY: () => (throttle ? -1 : (brake ? 1 : 0)),
    running: () => false,
    takeActions: () => 0,
    takeMute: () => false,
  };
}

/** Steer the player's car along `waypoints`; returns the fake input for one step.
 * The throttle is matched to the corner: a car at full speed needs a 200px turning
 * circle, wider than the road, so it slows for turns and stays on the street. */
function autopilot(G, waypoints) {
  const car = G.playerCar;
  if (!car) return fakeInput(0, false);
  // Shift to the next leg early (120px out): the car starts its turn before the
  // intersection centre, so its arc lands on the next street instead of swinging
  // wide past the corner and onto the grass.
  while (waypoints.length > 0 && dist(car.x, car.y, waypoints[0].x, waypoints[0].y) < 120) {
    waypoints.shift();
  }
  if (waypoints.length === 0) return fakeInput(0, false);
  const target = waypoints[0];
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = angleDiff(car.angle, want);
  const steer = clamp(diff * 2.2, -1, 1);
  const last = waypoints.length === 1;
  const dWp = dist(car.x, car.y, target.x, target.y);
  let targetSpeed = last && dWp < 140
    ? 0
    : (Math.abs(diff) < 0.4 ? 520 : (Math.abs(diff) < 1.0 ? 280 : 130));
  // Slow down for the corner itself: the waypoint changes 90 degrees when the car
  // reaches it, and a car arriving at 500 px/s cannot turn inside a 110px road.
  if (dWp < 220) targetSpeed = Math.min(targetSpeed, 200);
  if (dWp < 120) targetSpeed = Math.min(targetSpeed, 130);
  const speed = Math.abs(car.speed);
  const throttle = speed < targetSpeed;
  const brake = speed > targetSpeed + 60;
  return fakeInput(steer, throttle, brake);
}

/** Put the player in a car at (x, y), facing `angle`, with the road ahead clear of
 * traffic for the shot: a staged run should show driving, not a pile-up at the start. */
function giveCar(G, x, y, angle, color) {
  const car = createCar(x, y, angle, color, 'traffic');
  car.driver = false;
  G.playerCar = car;
  G.inCar = true;
  G.player.x = x;
  G.player.y = y;
  G.player.angle = angle;
  G.cars = G.cars.filter((c) => dist(c.x, c.y, x, y) > 260);
}

/**
 * Set `G` to the named scene (start, street, drive or chase; any other name is start)
 * and return the screen to draw over it and the clock time to draw with.
 */
export function stageShot(name, G, stepGame) {
  const screenRef = { screen: SCREEN_PLAY };
  const step = (input) => stepGame(G, STEP, input, screenRef);

  if (name === 'street') {
    // On foot downtown, traffic and pedestrians moving around the player.
    G.player.x = 1290;
    G.player.y = 730;
    G.player.angle = -Math.PI / 2;
    startMission(G.mission, 0);
    for (let i = 0; i < STREET_SECONDS / STEP; i += 1) step(fakeInput(0, false));
    return { screen: SCREEN_PLAY, time: G.time };
  }

  if (name === 'drive') {
    // Driving across town on the first job, one star, the Hideout ahead.
    startMission(G.mission, 0);
    G.mission.step = 1; // the package is picked up; the run is on
    addWanted(G.wanted, 1);
    // The route is computed from the car's start, not the player's spawn: the car
    // is placed on the route, and it starts facing the first leg of it, so there
    // is no U-turn at the start.
    const waypoints = route(720, 1100, G.city.locations.hideout.x, G.city.locations.hideout.y);
    giveCar(G, 720, 1100, Math.atan2(waypoints[0].y - 1100, waypoints[0].x - 720), '#d94f3d');
    for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) step(autopilot(G, waypoints));
    return { screen: SCREEN_PLAY, time: G.time };
  }

  if (name === 'chase') {
    // The big score's getaway: three stars, cruisers on the bumper, Hideout ahead.
    startMission(G.mission, 4);
    G.mission.step = 1; // the cash is grabbed; the escape is on
    addWanted(G.wanted, 3);
    const waypoints = route(1720, 1100, G.city.locations.hideout.x, G.city.locations.hideout.y);
    giveCar(G, 1720, 1100, Math.atan2(waypoints[0].y - 1100, waypoints[0].x - 1720), '#e8a13c');
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) step(autopilot(G, waypoints));
    return { screen: SCREEN_PLAY, time: G.time };
  }

  // Start: the title over a living downtown, traffic rolling behind it.
  for (let i = 0; i < START_SECONDS / STEP; i += 1) step(fakeInput(0, false));
  G.camera.x = clamp(1220 - VIEW.width / 2, 0, WORLD.width - VIEW.width);
  G.camera.y = clamp(880 - VIEW.height / 2, 0, WORLD.height - VIEW.height);
  return { screen: SCREEN_TITLE, time: G.time };
}

export { nearestRoadPoint };
