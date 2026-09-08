# Kingfisher River Hunt

A WebGL kingfisher hunting game built with Next.js and Three.js. Fly over a living river, dive for fish, surface, and return your catch to a marked perch. HUNT is timed; FLY is untimed.

## Flight controls — v4

| Action | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Turn and climb | Left joystick | WASD / arrows | Left stick |
| Dive / cancel dive | DIVE | Shift | B / right trigger |
| Flap and accelerate | FLAP | Space | A |
| Brake and turn sharply | Hold BRAKE + steer | X or C + steer | X / left trigger + stick |
| Short acceleration burst | BURST or double-tap FLAP | E or double-tap Space | Right bumper or double-tap A |
| Pause / resume | Pause button | Escape | Start |

A FLAP tap gives a short powered wingbeat; holding it accelerates without forcing continuous climbing. Underwater, FLAP initiates surfacing. FLAP or BRAKE cancels a committed dive. Strong steering takes priority over dive assistance. With one-tap dive disabled, hold the dive control instead. BURST consumes energy and has a short cooldown. Fly through the marked perch to bank a held fish.

The controls menu retains EASY, FLOW and RAW presets, custom sensitivity, aim assistance, inverted pitch, camera distance and low-motion options. Scores and the fish collection remain local to the browser. Switching tabs or losing focus pauses the game and clears held actions.

## Run

```sh
npm install --legacy-peer-deps
npm run dev
```

Open the local address printed by Next.js. For production:

```sh
npm run build
npm run start
```

## Controller implementation

`app/lib/AgileKingfisherEngine.js` is the controller used by the UI. It reuses the existing river engine's habitat, scoring, collection and effects. `app/lib/FlightMotion.mjs` provides renderer-independent, time-based motion. The bird's model orientation matches its actual travel direction; angular velocity is smoothed without repeatedly filtering the velocity vector. Flight uses bounded substeps, and the chase camera uses an exact damped update with player translation compensation.

Catch detection follows the moving beak and fish over a timestep, rather than testing only their final positions. Perch banking also uses a swept check. World-origin changes preserve camera, target and collision-history coordinates. Collisions initiate local recovery rather than routinely teleporting the bird away.

## Verification

```sh
npm run test:flight
npm run build
npm install --no-save --legacy-peer-deps playwright@1.55.0
npx playwright install chromium
# In another terminal: npm run start
node scripts/verify-flight.cjs
```

The motion suite covers steering response and release, reversal, 30/60/120/144 Hz heading consistency, braking, acceleration, underwater recovery, manual override, swept strikes and camera stability. The Chromium suite checks a real HUNT launch and animation, desktop and touch-emulated controls, simultaneous touches, cancellation, burst cooldown, model alignment, a catch/bank cycle and world rebasing. It then freezes rendering for deterministic mechanics assertions; those checks are not frame-rate benchmarks. Screenshots are stored under `test-artifacts/`.

Physical iPhone/iPad, Safari and real gamepad hardware testing remain separate from these automated checks. `?debug=1` exposes the engine only for inspection and development.
