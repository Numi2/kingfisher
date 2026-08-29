# Aspen Kingfisher — River Hunt: Living River

A standalone Three.js / Next.js wildlife game built from the control and rendering architecture developed for Aspen Worm Flight, but with its own game world and mechanics.

## Core loop

Fly along a living river, scan for fish, tap DIVE to lock and commit to a strike, catch the fish with the beak underwater, FLAP back to the surface, and return to a gold perch to bank the catch. The standard hunt lasts 120 seconds, with extra time earned for perfect and legendary catches.

## Living river systems

- 12 fish species including rainbow trout, brown trout, brook trout, Arctic char, cutthroat trout, Arctic grayling, salmon parr, perch, dace, minnows, sculpin, and legendary golden trout.
- Fish flee, burst, school, change depth, and respond to the bird.
- Procedural moving water, dynamic dawn-to-day sky, fog, weather, crosswind, mist, insects, riverbed pebbles, aquatic plants, rocks, trees, reeds, perches, obstacles, and a kingfisher nest burrow.
- Blue/iridescent head and wings, golden-yellow belly, white throat, articulated wings and head tracking.
- Perfect-dive grading, combos, rare-catch multipliers, Kingfisher Focus, medal thresholds, persistent best score, lifetime catches, and a persistent field guide.
- Floating mobile joystick, one-tap Smart Dive, FLAP/surface control, keyboard and gamepad support, haptics, generated audio, reduced-motion option, and adaptive render quality.

## Run locally

```bash
npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:3000`.

## ChatGPT App

MCP endpoint: `/mcp`

Tool: `launch_kingfisher_river_hunt`

The tool can launch hunt/free flight/River Lab/controls/field guide and configure habitat and control parameters.
