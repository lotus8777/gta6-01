// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// logical view is scaled to fit the window and centred; the margin is the backdrop colour.
// Canvas rectangles, circles and text — no images, no fonts from the network.

import { CAR, FONT, PALETTE, VIEW, WORLD } from './config.js';
import { ROADS_H, ROADS_V, ROAD_W } from './world.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BRIEF = 'brief';
export const SCREEN_MISSION_DONE = 'missionDone';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_STORY_DONE = 'storyDone';

const MINIMAP = { x: VIEW.width - 240, y: 16, w: 224, h: 168 };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(244, 241, 234, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ---- world ----

  function drawGround(city, cam) {
    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Sea and beach along the east edge.
    const seaX = city.sea.x - cam.x;
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(seaX, 0, VIEW.width - seaX + 40, VIEW.height);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(city.beach.x - cam.x, 0, city.sea.x - city.beach.x, VIEW.height);
    // Wave lines on the water.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      const wy = (i * 173 + 60) % VIEW.height;
      ctx.beginPath();
      ctx.moveTo(seaX + 14, wy);
      ctx.quadraticCurveTo(seaX + 40, wy - 8, seaX + 66, wy);
      ctx.stroke();
    }
    // Park.
    const park = city.locations.park;
    if (park) {
      ctx.fillStyle = PALETTE.parkGrass;
      ctx.fillRect(park.x - 190 - cam.x, park.y - 130 - cam.y, 380, 260);
    }
  }

  function drawRoads(cam) {
    ctx.fillStyle = PALETTE.sidewalk;
    for (const vx of ROADS_V) {
      ctx.fillRect(vx - ROAD_W / 2 - 8 - cam.x, 0, ROAD_W + 16, VIEW.height);
    }
    for (const hy of ROADS_H) {
      ctx.fillRect(0, hy - ROAD_W / 2 - 8 - cam.y, VIEW.width, ROAD_W + 16);
    }
    ctx.fillStyle = PALETTE.road;
    for (const vx of ROADS_V) {
      ctx.fillRect(vx - ROAD_W / 2 - cam.x, 0, ROAD_W, VIEW.height);
    }
    for (const hy of ROADS_H) {
      ctx.fillRect(0, hy - ROAD_W / 2 - cam.y, VIEW.width, ROAD_W);
    }
    // Centre dashes.
    ctx.fillStyle = PALETTE.roadLine;
    for (const vx of ROADS_V) {
      for (let y = Math.floor(cam.y / 44) * 44; y < cam.y + VIEW.height; y += 44) {
        ctx.fillRect(vx - 2 - cam.x, y - cam.y, 4, 22);
      }
    }
    for (const hy of ROADS_H) {
      for (let x = Math.floor(cam.x / 44) * 44; x < cam.x + VIEW.width; x += 44) {
        ctx.fillRect(x - cam.x, hy - 2 - cam.y, 22, 4);
      }
    }
  }

  function drawBuildings(city, cam) {
    for (const b of city.buildings) {
      const x = b.x - cam.x;
      const y = b.y - cam.y;
      const sh = b.height * 7;
      // Shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + sh, y + sh, b.w, b.h);
      // Roof.
      ctx.fillStyle = b.color;
      ctx.fillRect(x, y, b.w, b.h);
      ctx.strokeStyle = PALETTE.buildingEdge;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1, y + 1, b.w - 2, b.h - 2);
      // Roof detail: a lighter inner slab.
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 10, y + 10, b.w - 20, b.h - 20);
      if (b.height >= 3) {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(x + b.w / 2 - 12, y + b.h / 2 - 12, 24, 24);
      }
    }
    // Trees.
    for (const t of city.trees) {
      const x = t.x - cam.x;
      const y = t.y - cam.y;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(x + 4, y + 5, t.r, t.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4e8f3e';
      ctx.beginPath();
      ctx.arc(x, y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6db35a';
      ctx.beginPath();
      ctx.arc(x - 3, y - 3, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCarShape(x, y, angle, color, isPolice, time, smoking) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(-CAR.length / 2 + 4, -CAR.width / 2 + 5, CAR.length, CAR.width, 8);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-CAR.length / 2 + 6, -CAR.width / 2 - 3, 12, 6);
    ctx.fillRect(-CAR.length / 2 + 6, CAR.width / 2 - 3, 12, 6);
    ctx.fillRect(CAR.length / 2 - 18, -CAR.width / 2 - 3, 12, 6);
    ctx.fillRect(CAR.length / 2 - 18, CAR.width / 2 - 3, 12, 6);
    // Body.
    ctx.fillStyle = color;
    roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
    ctx.fill();
    // Windshield and rear window.
    ctx.fillStyle = '#20262e';
    ctx.fillRect(CAR.length / 2 - 16, -CAR.width / 2 + 4, 8, CAR.width - 8);
    ctx.fillRect(-CAR.length / 2 + 8, -CAR.width / 2 + 4, 6, CAR.width - 8);
    // Roof.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(-6, -CAR.width / 2 + 5, 16, CAR.width - 10, 4);
    ctx.fill();
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(CAR.length / 2 - 2, -CAR.width / 2 + 4, 3, 5);
    ctx.fillRect(CAR.length / 2 - 2, CAR.width / 2 - 9, 3, 5);
    // Police light bar, flashing.
    if (isPolice) {
      const phase = Math.floor(time * 4) % 2 === 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#3b82ff';
      ctx.fillRect(-4, -CAR.width / 2 + 3, 8, 7);
      ctx.fillStyle = phase ? '#3b82ff' : '#ff3b30';
      ctx.fillRect(-4, CAR.width / 2 - 10, 8, 7);
    }
    // Smoke when wrecked.
    if (smoking) {
      ctx.fillStyle = 'rgba(120,120,120,0.55)';
      ctx.beginPath();
      ctx.arc(-CAR.length / 2 + 6, 0, 8 + Math.sin(time * 5) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, color, isCop, isPlayer) {
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 3, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isPlayer ? '#ffffff' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = isPlayer ? 3 : 1.5;
    ctx.stroke();
    // Head.
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    // Facing tick.
    ctx.strokeStyle = isPlayer ? '#ffffff' : 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * 8, y + Math.sin(angle) * 8);
    ctx.lineTo(x + Math.cos(angle) * 17, y + Math.sin(angle) * 17);
    ctx.stroke();
    if (isCop) {
      ctx.fillStyle = '#0f2040';
      ctx.beginPath();
      ctx.arc(x, y - 2, 6.5, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawMarker(x, y, time) {
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = PALETTE.marker;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(13, 0);
    ctx.lineTo(0, 18);
    ctx.lineTo(-13, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PALETTE.markerRing;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
    // Ground ring.
    ctx.strokeStyle = 'rgba(255,93,143,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y + 16, 22 + Math.sin(time * 4) * 4, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---- HUD ----

  function drawStars(stars) {
    const x0 = VIEW.width / 2 - (5 * 30) / 2;
    for (let i = 0; i < 5; i += 1) {
      ctx.font = '28px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = i < stars ? PALETTE.star : 'rgba(244,241,234,0.3)';
      ctx.fillText('★', x0 + i * 30 + 15, 40);
    }
  }

  function drawMinimap(state, city) {
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    panel(MINIMAP.x - 8, MINIMAP.y - 8, MINIMAP.w + 16, MINIMAP.h + 16);
    ctx.save();
    ctx.beginPath();
    ctx.rect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    ctx.clip();
    ctx.fillStyle = '#3f7a4e';
    ctx.fillRect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(MINIMAP.x + city.sea.x * sx, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    ctx.strokeStyle = '#8a8378';
    ctx.lineWidth = 3;
    for (const vx of ROADS_V) {
      ctx.beginPath();
      ctx.moveTo(MINIMAP.x + vx * sx, MINIMAP.y);
      ctx.lineTo(MINIMAP.x + vx * sx, MINIMAP.y + MINIMAP.h);
      ctx.stroke();
    }
    for (const hy of ROADS_H) {
      ctx.beginPath();
      ctx.moveTo(MINIMAP.x, MINIMAP.y + hy * sy);
      ctx.lineTo(MINIMAP.x + MINIMAP.w, MINIMAP.y + hy * sy);
      ctx.stroke();
    }
    // Mission marker.
    const obj = state.objective;
    if (obj && obj.x !== null) {
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.arc(MINIMAP.x + obj.x * sx, MINIMAP.y + obj.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Police dots.
    ctx.fillStyle = '#3b82ff';
    for (const cop of state.cops) {
      ctx.beginPath();
      ctx.arc(MINIMAP.x + cop.x * sx, MINIMAP.y + cop.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of state.policeCars) {
      ctx.beginPath();
      ctx.arc(MINIMAP.x + car.x * sx, MINIMAP.y + car.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const px = MINIMAP.x + state.player.x * sx;
    const py = MINIMAP.y + state.player.y * sy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    text('SOLARA BAY', MINIMAP.x + MINIMAP.w / 2, MINIMAP.y + MINIMAP.h + 26, 13, PALETTE.muted, 'center');
  }

  function drawHud(state, time) {
    // Cash and health, top left.
    panel(16, 14, 210, 64);
    text(`$${state.cash}`, 30, 42, 26, PALETTE.gold, 'left', '700 ');
    text(state.player.hasPistol ? `Pistol  ${state.player.ammo} rds` : 'No gun — visit Harbor Arms', 30, 64, 13, PALETTE.muted);
    // Health bar.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(16, 86, 210, 14, 7);
    ctx.fill();
    ctx.fillStyle = state.player.health > 30 ? PALETTE.green : PALETTE.red;
    roundRect(16, 86, Math.max(14, 210 * (state.player.health / 100)), 14, 7);
    ctx.fill();
    text('HEALTH', 30, 80, 11, PALETTE.text);

    drawStars(state.wanted.stars);
    drawMinimap(state, state.city);

    // Mission objective, under the stars.
    if (state.objective) {
      text(state.objective.label, VIEW.width / 2, 66, 16, PALETTE.text, 'center', '600 ');
      if (state.objective.x !== null) {
        const d = Math.hypot(state.objective.x - state.player.x, state.objective.y - state.player.y);
        text(`${Math.round(d)}m`, VIEW.width / 2, 88, 14, PALETTE.muted, 'center');
      }
    } else if (state.missionIndex < 5) {
      text(`Next mission: ${state.nextMissionTitle} — drive to ${state.nextMissionGiver}`, VIEW.width / 2, 66, 15, PALETTE.muted, 'center');
    } else {
      text('Story complete — Solara Bay is yours.', VIEW.width / 2, 66, 15, PALETTE.gold, 'center');
    }

    // Speed, bottom right, while driving.
    if (state.inCar) {
      const mph = Math.round(Math.abs(state.playerCar.speed) * 0.14);
      panel(VIEW.width - 150, VIEW.height - 64, 134, 48);
      text(`${mph}`, VIEW.width - 84, VIEW.height - 28, 30, PALETTE.text, 'center', '700 ');
      text('mph', VIEW.width - 40, VIEW.height - 28, 13, PALETTE.muted, 'center');
    }

    // Interaction prompt, bottom centre.
    if (state.prompt) {
      panel(VIEW.width / 2 - 150, VIEW.height - 52, 300, 34);
      text(state.prompt, VIEW.width / 2, VIEW.height - 29, 15, PALETTE.text, 'center', '600 ');
    }

    // Toasts, centre.
    let ty = 120;
    for (const toast of state.toasts) {
      ctx.globalAlpha = clamp(toast.ttl, 0, 1);
      text(toast.text, VIEW.width / 2, ty, 20, toast.color || PALETTE.text, 'center', '700 ');
      ctx.globalAlpha = 1;
      ty += 28;
    }

    // Controls hint, bottom left, while the game is young.
    if (state.elapsed < 14) {
      text('WASD move / drive   E enter car · use   F punch   Space shoot   Shift run   H horn   P pause', 16, VIEW.height - 16, 13, 'rgba(244,241,234,0.75)');
    }
  }

  /** An off-screen objective arrow at the screen edge. */
  function drawObjectiveArrow(state, cam) {
    const obj = state.objective;
    if (!obj || obj.x === null) return;
    const sx = obj.x - cam.x;
    const sy = obj.y - cam.y;
    if (sx > 60 && sx < VIEW.width - 60 && sy > 60 && sy < VIEW.height - 60) return;
    const cx = clamp(sx, 70, VIEW.width - 70);
    const cy = clamp(sy, 110, VIEW.height - 70);
    const angle = Math.atan2(sy - (VIEW.height / 2), sx - (VIEW.width / 2));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = PALETTE.marker;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- screens ----

  function drawTitle(state, time) {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text('SOLARA BAY', VIEW.width / 2, 190, 84, '#ffd94a', 'center', '800 ');
    text('an open-city story', VIEW.width / 2, 232, 26, PALETTE.text, 'center');
    panel(VIEW.width / 2 - 330, 270, 660, 210);
    text('Danny Vega owes Rosa a favour, and Rosa collects.', VIEW.width / 2, 306, 17, PALETTE.text, 'center');
    text('Five jobs. One city. Steal cars, lose the cops,', VIEW.width / 2, 332, 17, PALETTE.text, 'center');
    text('and take the big score — if Solara Bay lets you.', VIEW.width / 2, 358, 17, PALETTE.text, 'center');
    text('WASD move & drive · E enter car / use · F punch · Space shoot · Shift run · H horn · P pause', VIEW.width / 2, 402, 14, PALETTE.muted, 'center');
    text('M mute · progress saves automatically', VIEW.width / 2, 428, 14, PALETTE.muted, 'center');
    const blink = Math.floor(time * 1.6) % 2 === 0;
    if (blink) text(state.hasSave ? 'Press ENTER to continue your story' : 'Press ENTER to start', VIEW.width / 2, 540, 24, '#ffffff', 'center', '700 ');
    if (state.bestCash > 0) text(`Best haul: $${state.bestCash}`, VIEW.width / 2, 580, 15, PALETTE.gold, 'center');
  }

  function drawCenterPanel(title, lines, prompt, color) {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(VIEW.width / 2 - 360, 190, 720, 130 + lines.length * 30);
    text(title, VIEW.width / 2, 240, 34, color || PALETTE.text, 'center', '800 ');
    lines.forEach((line, i) => {
      text(line, VIEW.width / 2, 282 + i * 30, 17, PALETTE.text, 'center');
    });
    text(prompt, VIEW.width / 2, 282 + lines.length * 30 + 26, 18, '#ffffff', 'center', '700 ');
  }

  // ---- main draw ----

  function drawWorld(state, time) {
    const cam = state.camera;
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    // Clip to the logical view.
    ctx.beginPath();
    ctx.rect(0, 0, VIEW.width, VIEW.height);
    ctx.clip();
    drawGround(state.city, cam);
    drawRoads(cam);
    drawBuildings(state.city, cam);
    // Mission marker.
    if (state.objective && state.objective.x !== null) {
      drawMarker(state.objective.x - cam.x, state.objective.y - cam.y, time);
    }
    // Cars.
    for (const car of state.cars) {
      drawCarShape(car.x - cam.x, car.y - cam.y, car.angle, car.color, car.kind === 'police', time, car.smoking);
    }
    for (const car of state.policeCars) {
      drawCarShape(car.x - cam.x, car.y - cam.y, car.angle, car.color, true, time, car.smoking);
    }
    if (state.inCar && state.playerCar) {
      drawCarShape(state.playerCar.x - cam.x, state.playerCar.y - cam.y, state.playerCar.angle, state.playerCar.color, false, time, state.playerCar.smoking);
    }
    // People.
    for (const ped of state.peds) {
      if (ped.alive) drawPerson(ped.x - cam.x, ped.y - cam.y, ped.angle, ped.color, false, false);
    }
    for (const cop of state.cops) {
      if (cop.alive) drawPerson(cop.x - cam.x, cop.y - cam.y, cop.angle, cop.color, true, false);
    }
    // Player on foot.
    if (!state.inCar && state.player.alive) {
      drawPerson(state.player.x - cam.x, state.player.y - cam.y, state.player.angle, PALETTE.player, false, true);
    }
    // Bullet tracers.
    for (const t of state.tracers) {
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x1 - cam.x, t.y1 - cam.y);
      ctx.lineTo(t.x2 - cam.x, t.y2 - cam.y);
      ctx.stroke();
    }
    drawObjectiveArrow(state, cam);
    ctx.restore();
  }

  return {
    resize,
    draw(state, screen, time) {
      ctx.fillStyle = '#0b0e14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(view.x, view.y);
      ctx.scale(view.scale, view.scale);
      ctx.beginPath();
      ctx.rect(0, 0, VIEW.width, VIEW.height);
      ctx.clip();

      if (screen === SCREEN_TITLE) {
        drawWorld(state, time);
        drawTitle(state, time);
      } else if (screen === SCREEN_PLAY) {
        drawWorld(state, time);
        drawHud(state, time);
      } else if (screen === SCREEN_PAUSED) {
        drawWorld(state, time);
        drawHud(state, time);
        drawCenterPanel('Paused', ['Take a breath. Solara Bay waits.'], 'Press P to keep playing');
      } else if (screen === SCREEN_BRIEF) {
        drawWorld(state, time);
        drawCenterPanel(state.briefTitle, state.briefLines, 'Press ENTER to start the job', PALETTE.gold);
      } else if (screen === SCREEN_MISSION_DONE) {
        drawWorld(state, time);
        drawHud(state, time);
        drawCenterPanel(state.doneTitle, state.doneLines, 'Press ENTER to continue', PALETTE.green);
      } else if (screen === SCREEN_BUSTED) {
        drawWorld(state, time);
        drawCenterPanel('BUSTED', [`The cops hauled you in. Fine: $${state.lastFine}.`, 'Rosa is not impressed.'], 'Press ENTER to get back out there', PALETTE.red);
      } else if (screen === SCREEN_WASTED) {
        drawWorld(state, time);
        drawCenterPanel('WASTED', [`St. Solara patched you up. Bill: $${state.lastFine}.`, 'The city keeps moving without you.'], 'Press ENTER to get back out there', PALETTE.red);
      } else if (screen === SCREEN_STORY_DONE) {
        drawWorld(state, time);
        drawCenterPanel('SOLARA BAY IS YOURS', [`All five jobs done. $${state.cash} in your pocket.`, 'Rosa says the city finally respects you.'], 'Press ENTER to keep playing', PALETTE.gold);
      }
      ctx.restore();
    },
  };
}
