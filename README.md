# Solara Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/lotus8777/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/lotus8777/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6, set in Solara Bay — a sun-soaked coastal city of avenues, a park, a beach and a port. Danny Vega owes Rosa a favour, and Rosa collects: five jobs, from a quiet package run to the big score at Solara Bank, with the whole city on your tail.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no network — the game is plain static files under `game/`.

## What is in the city

- **Drive and steal** — any car on the street is yours if you can take it. Traffic drives the road grid; parked cars are free for the taking, a carjacking is not.
- **Wanted levels** — one to five stars. Steal a car, run someone over, fire a gun, and the police come: cruisers ram your car, cops on foot chase you down. Lay low and the heat cools; a fresh coat at Quick Coat clears it at once.
- **Five missions, one story** — First Fare, Getaway Driver, The Collection, Heat Wave and The Big Score, given by Rosa at her diner and Marco at the Hideout. Briefings, objective markers on the HUD and the minimap, rewards in cash.
- **Combat** — fists and a pistol (buy one at Harbor Arms). Health, busted and wasted, with a fine and a trip to the police station or the hospital.
- **A living city** — pedestrians strolling the sidewalks, traffic, a park, a beach, a port, day-long sunshine, and a minimap that shows the whole of Solara Bay.
- **Sound** — engine hum, two-tone sirens, gunshots and a bass line, all synthesized live with WebAudio. M mutes.
- **Save** — progress, cash and missions save automatically in your browser.

## Controls

| Keys | What |
| --- | --- |
| WASD / arrows | Move on foot, drive |
| Shift | Run |
| E | Enter a car, use a shop, talk, pick up |
| F | Punch |
| Space | Shoot (on foot) / handbrake (driving) |
| H | Horn |
| P / Esc | Pause |
| M | Mute |
| Enter | Start, confirm |

## How it is built

`game/` is plain ES modules on a canvas — no engine, no library, no assets from the network. The city is generated from a seed (`?seed=N`), so the same seed always builds the same Solara Bay. `?shot=start|street|drive|chase&seed=1` stages the four screenshot scenes deterministically. `main.ts` hands the game in: it copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the vendored make.fun library.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
