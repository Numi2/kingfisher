// Pure, renderer-independent arcade flight dynamics. All rates are per second.
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const finite = (x, fallback = 0) => Number.isFinite(x) ? x : fallback;
export const wrapAngle = (x) => Math.atan2(Math.sin(x), Math.cos(x));
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// One radial dead zone preserves direction and equal diagonal authority.
export function radialInput(x, y, deadZone = 0.035, curved = false) {
  x = finite(x); y = finite(y);
  const length = Math.hypot(x, y);
  if (length <= deadZone) return { x: 0, y: 0 };
  const t = clamp((length - deadZone) / (1 - deadZone), 0, 1);
  const magnitude = curved ? t * (0.76 + 0.24 * t) : t;
  return { x: x / length * magnitude, y: y / length * magnitude };
}

// Exact critically damped spring for a stationary target over this interval.
export function springVector(position, velocity, target, omega, dt) {
  const decay = Math.exp(-omega * dt);
  for (const axis of ['x', 'y', 'z']) {
    const error = position[axis] - target[axis];
    const impulse = velocity[axis] + omega * error;
    position[axis] = target[axis] + (error + impulse * dt) * decay;
    velocity[axis] = (velocity[axis] - omega * impulse * dt) * decay;
  }
}

// Distance from the origin to a relative-motion segment, without allocations.
export function sweptDistance(ax, ay, az, bx, by, bz) {
  const x = bx - ax, y = by - ay, z = bz - az;
  const denominator = x*x + y*y + z*z;
  const t = denominator > 1e-12 ? clamp(-(ax*x + ay*y + az*z) / denominator, 0, 1) : 0;
  return Math.hypot(ax + x*t, ay + y*t, az + z*t);
}

export function initializeMotion(s) {
  s.yawVelocity = 0; s.pitchVelocity = 0;
  s.boostTimer = 0; s.boostCooldown = 0; s.flapPulseTimer = 0;
  s.brakeBlend = 0; s.diveBlend = 0; s.flightAction = 'GLIDE';
  s.filteredSteering = { x: 0, y: 0 };
}

// s is the engine's authoritative motion state, not a second simulation copy.
// env.target, when present, is a predicted world position with {x, y, z}.
export function stepFlightMotion(s, input, env, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) return;
  const p = s.bird.position;
  const wet = Boolean(env.underwater);
  const sensitivity = clamp(finite(env.sensitivity, 1), 0.6, 1.55);
  const power = clamp(finite(env.wingPower, 1), 0.75, 1.35);
  const x = clamp(finite(input.x), -1, 1), y = clamp(finite(input.y), -1, 1);
  const brake = Boolean(input.brake);
  const flap = (Boolean(input.flap) || s.flapPulseTimer > 0) && !brake;
  const dive = Boolean(input.dive) && !flap && !brake && !s.holdingFish;
  const burst = s.boostTimer > 0 && !brake;
  s.boostTimer = Math.max(0, s.boostTimer - dt);
  s.boostCooldown = Math.max(0, s.boostCooldown - dt);
  s.flapPulseTimer = Math.max(0, s.flapPulseTimer - dt);
  s.brakeBlend = damp(s.brakeBlend, brake ? 1 : 0, 18, dt);
  s.diveBlend = damp(s.diveBlend, dive ? 1 : 0, 20, dt);

  // No accumulated analog lag: intent is direct; angular velocity provides smoothing.
  s.filteredSteering.x = x; s.filteredSteering.y = y;
  const turnLimit = brake ? 4.8 : wet ? 3.7 : 3.25 - 0.75 * smoothstep(16, 34, s.speed);
  let yawRate = x * turnLimit * sensitivity;
  let targetPitch = y * (wet ? 1.18 : 1.06);
  if (Math.abs(y) < 0.035 && !dive) targetPitch = 0;
  if (dive) targetPitch = clamp(-1.13 + y * 2.25, -1.46, 1.18);

  // Near-surface clearance is an assist only: explicit down input still wins.
  if (!wet && !dive && y >= -0.08 && p.y < 1.65) targetPitch = Math.max(targetPitch, (1.65 - p.y) * 0.28);
  if (flap && wet && y > -0.15) targetPitch = Math.max(targetPitch, 1.08);
  if (s.surfaceAssistTimer > 0 && y > -0.18 && !dive) {
    targetPitch = Math.max(targetPitch, wet ? 1.18 : p.y < 1.6 ? 0.43 : 0.13);
  }

  if (dive && env.target) {
    const dx = env.target.x - p.x, dy = env.target.y - p.y, dz = env.target.z - p.z;
    const distance = Math.hypot(dx, dy, dz);
    const assist = clamp(finite(env.assist), 0, 0.9);
    const proximity = 1 - smoothstep(4, 42, distance);
    const yawWeight = assist * (0.72 + 0.28 * proximity) * (1 - smoothstep(0.12, 0.68, Math.abs(x)));
    const pitchWeight = (assist > 0 ? 0.75 + 0.25 * assist : 0) * (1 - smoothstep(0.12, 0.68, Math.abs(y)));
    const targetYaw = Math.atan2(dx, -dz);
    const correction = clamp(wrapAngle(targetYaw - s.yaw) * 5.8, -3.8, 3.8);
    yawRate = yawRate * (1 - yawWeight) + correction * yawWeight;
    const aimPitch = Math.atan2(dy, Math.max(0.001, Math.hypot(dx, dz)));
    // Neutral stick aims at the fish; strong stick input overrides the entire assist.
    targetPitch = targetPitch * (1 - pitchWeight) + aimPitch * pitchWeight;
  }

  // Exact first-order rate integration gives consistent yaw response at 30/60/120 Hz.
  const yawResponse = brake ? 29 : x * s.yawVelocity < 0 ? 32 : Math.abs(x) < 0.035 && !dive ? 32 : 28;
  const decay = Math.exp(-yawResponse * dt);
  const previousYawRate = s.yawVelocity;
  s.yaw += yawRate * dt + (previousYawRate - yawRate) * (1 - decay) / yawResponse;
  s.yaw = wrapAngle(s.yaw);
  s.yawVelocity = yawRate + (previousYawRate - yawRate) * decay;
  const pitchRate = clamp((clamp(targetPitch, -1.46, 1.22) - s.pitch) * 9.5, -4.8, 4.8);
  const pitchDecay = Math.exp(-27 * dt);
  s.pitch += pitchRate * dt + (s.pitchVelocity - pitchRate) * (1 - pitchDecay) / 27;
  s.pitchVelocity = pitchRate + (s.pitchVelocity - pitchRate) * pitchDecay;
  s.pitch = clamp(s.pitch, -1.46, 1.22);
  s.bank = damp(s.bank, clamp(-s.yawVelocity * 0.25 - x * 0.17, -1.16, 1.16), 16, dt);

  let targetSpeed = (wet ? 8.5 : 12.5) * power;
  if (dive) targetSpeed = (wet ? 15.5 : 24 + 10 * clamp(-Math.sin(s.pitch), 0, 1)) * power;
  if (flap && s.energy > 0.025) targetSpeed += wet ? 5.0 : 7.0;
  if (burst) targetSpeed = Math.max(targetSpeed, (wet ? 20 : 28) * power);
  if (s.bankBoostTimer > 0) targetSpeed += 3 * Math.min(1, s.bankBoostTimer / 1.25);
  if (s.focusActive) targetSpeed *= 1.06;
  if (brake) targetSpeed = wet ? 3.8 : 4.8;
  if (flap && s.energy > 0.025) s.energy = Math.max(0, s.energy - dt * (wet ? 0.17 : 0.12));
  else s.energy = Math.min(1, s.energy + dt * (brake ? 0.20 : 0.14));
  s.speed = damp(s.speed, targetSpeed, brake ? 11 : burst ? 10 : flap ? 7 : dive ? 6 : 3.8, dt);

  const cp = Math.cos(s.pitch);
  s.forward.x = Math.sin(s.yaw) * cp;
  s.forward.y = Math.sin(s.pitch);
  s.forward.z = -Math.cos(s.yaw) * cp;
  // Translation follows the commanded heading, rather than a second delayed turn.
  s.velocity.x = s.forward.x * s.speed + (wet ? 0 : finite(env.wind) * 0.12 * Math.sin(finite(env.time) * 0.7));
  s.velocity.y = s.forward.y * s.speed;
  s.velocity.z = s.forward.z * s.speed + (wet ? finite(env.current, 1) * 0.22 : 0);
  p.x += s.velocity.x * dt; p.y += s.velocity.y * dt; p.z += s.velocity.z * dt;
  s.flightAction = brake ? 'BRAKE' : burst ? 'BURST' : dive ? 'DIVE' : wet && (flap || s.surfaceAssistTimer > 0) ? 'SURFACE' : flap ? 'FLAP' : Math.abs(x) > 0.15 ? 'TURN' : y > 0.15 ? 'CLIMB' : y < -0.15 ? 'DESCEND' : 'GLIDE';
}
