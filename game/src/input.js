// Keyboard and pointer input for Solara Bay. Held keys give movement and driving;
// one-shot presses (confirm, pause, interact, attack, horn) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost or counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_ATTACK = 8;
export const ACTION_SHOOT = 16;
export const ACTION_HORN = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const ATTACK = new Set(['KeyF']);
const SHOOT = new Set(['Space']);
const HORN = new Set(['KeyH']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mutePressed = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || RUN.has(event.code)) {
      held.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (INTERACT.has(event.code)) {
      if (!event.repeat) actions |= ACTION_INTERACT;
    } else if (ATTACK.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ATTACK;
    } else if (SHOOT.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SHOOT;
    } else if (HORN.has(event.code)) {
      if (!event.repeat) actions |= ACTION_HORN;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) mutePressed = true;
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
  });
  target.addEventListener('pointerdown', (event) => {
    actions |= ACTION_CONFIRM;
    const rect = target.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) / rect.width;
    mouse.y = (event.clientY - rect.top) / rect.height;
  });

  const mouse = { x: 0.5, y: 0.5 };

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    mouse,
    /** -1/0/1 for each axis, from the held movement keys. */
    moveX() {
      return (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
    },
    moveY() {
      return (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0);
    },
    running() {
      return has(RUN);
    },
    /** True once when M is pressed (mute toggle), then cleared. */
    takeMute() {
      const v = mutePressed;
      mutePressed = false;
      return v;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. With a mask, only
     * those bits are taken and the rest stay queued for the next taker (the loop takes
     * pause/confirm first; the simulation then takes interact/attack/shoot). */
    takeActions(mask) {
      if (mask === undefined) {
        const taken = actions;
        actions = 0;
        return taken;
      }
      const taken = actions & mask;
      actions &= ~mask;
      return taken;
    },
  };
}
