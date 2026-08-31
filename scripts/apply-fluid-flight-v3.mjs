import fs from 'node:fs';

const path = 'app/lib/KingfisherGameEngine.js';
let text = fs.readFileSync(path, 'utf8');

function replaceOnce(oldValue, newValue, label) {
  if (!text.includes(oldValue)) throw new Error(`Missing ${label}`);
  text = text.replace(oldValue, newValue);
}

function replaceMethod(name, nextName, replacement) {
  const startToken = `  ${name}`;
  const endToken = `\n  ${nextName}`;
  const start = text.indexOf(startToken);
  if (start < 0) throw new Error(`Missing method ${name}`);
  const end = text.indexOf(endToken, start);
  if (end < 0) throw new Error(`Missing method boundary ${name} -> ${nextName}`);
  text = text.slice(0, start) + replacement.trimEnd() + text.slice(end);
}

replaceOnce('export const KINGFISHER_VERSION = "2.0.0";', 'export const KINGFISHER_VERSION = "3.0.0";', 'version');
replaceOnce('  assist: 0.78,', '  assist: 0.66,', 'default assist');
replaceOnce('const MAX_BANK = 0.78;', 'const MAX_BANK = 0.68;', 'max bank');

replaceOnce(
  '    this.hitStopTimer = 0;\n',
  '    this.hitStopTimer = 0;\n    this.filteredSteer = { x: 0, y: 0 };\n    this.yawVelocity = 0;\n    this.pitchVelocity = 0;\n    this.cameraVelocity = new THREE.Vector3();\n    this.cameraLookVelocity = new THREE.Vector3();\n    this.cameraFovVelocity = 0;\n    this.worldRebases = 0;\n',
  'controller state',
);

replaceOnce(
  '    this.hitStopTimer = 0;\n    this._resetBird();',
  '    this.hitStopTimer = 0;\n    this.filteredSteer.x = 0;\n    this.filteredSteer.y = 0;\n    this.yawVelocity = 0;\n    this.pitchVelocity = 0;\n    this.cameraVelocity.set(0, 0, 0);\n    this.cameraLookVelocity.set(0, 0, 0);\n    this.cameraFovVelocity = 0;\n    this._resetBird();',
  'run reset controller',
);

replaceOnce(
  '    this.velocity.set(0, 0, -this.speed);\n    this.forward.set(0, 0, -1);',
  '    this.velocity.set(0, 0, -this.speed);\n    this.forward.set(0, 0, -1);\n    this.filteredSteer.x = 0;\n    this.filteredSteer.y = 0;\n    this.yawVelocity = 0;\n    this.pitchVelocity = 0;\n    this.cameraVelocity.set(0, 0, 0);\n    this.cameraLookVelocity.set(0, 0, 0);\n    this.cameraFovVelocity = 0;',
  'bird reset controller',
);

replaceMethod('_updateFlight(dt, elapsed, input) {', '_checkBoundaries() {', String.raw`  _updateFlight(dt, elapsed, input) {
    const underwater = this.bird.position.y < WATER_Y - 0.06;
    this.previousBirdPosition.copy(this.bird.position);
    this.recoveryTimer = Math.max(0, this.recoveryTimer - dt);
    this.bankBoostTimer = Math.max(0, this.bankBoostTimer - dt);
    const recovering = this.recoveryTimer > 0;
    const bankBoost = this.bankBoostTimer > 0;

    if (input.flap && this.smartDiveCommit) this._cancelCommittedDive(true);
    if (input.dive && !this.holdingFish && !this.lockedTarget?.visible) this._chooseFishTarget(true);
    if (input.dive && this.currentTarget?.visible && !this.lockedTarget) this.lockedTarget = this.currentTarget;

    const inputRate = underwater ? 12.5 : 15.5;
    this.filteredSteer.x = lerp(this.filteredSteer.x, clamp(input.x, -1, 1), smooth(inputRate, dt));
    this.filteredSteer.y = lerp(this.filteredSteer.y, clamp(input.y, -1, 1), smooth(inputRate, dt));

    const sensitivity = this.controlSettings.sensitivity;
    const speedNorm = clamp((this.speed - 6) / 20, 0, 1);
    const maxYawRate = underwater ? 1.02 : lerp(0.9, 1.42, speedNorm);
    let requestedYawRate = this.filteredSteer.x * maxYawRate * sensitivity;
    let targetPitch = this.filteredSteer.y * (underwater ? 0.56 : 0.46) * sensitivity;
    const locked = input.dive && !this.holdingFish && this.lockedTarget?.visible;

    if (locked) {
      const target = this.lockedTarget;
      const predicted = this.temp3.copy(target.position);
      const toTargetNow = this.temp2.copy(target.position).sub(this.bird.position);
      const distance = toTargetNow.length();
      const leadTime = clamp(distance / Math.max(13, this.speed + target.userData.speed), 0.12, 0.62);
      predicted.z += target.userData.speed * this.habitat.riverCurrent * leadTime;

      const toTarget = this.temp2.copy(predicted).sub(this.bird.position);
      const horizontal = Math.max(0.001, Math.hypot(toTarget.x, toTarget.z));
      const desiredYaw = Math.atan2(toTarget.x, -toTarget.z);
      const yawError = Math.atan2(Math.sin(desiredYaw - this.yaw), Math.cos(desiredYaw - this.yaw));
      const desiredPitch = Math.atan2(toTarget.y, horizontal);
      const assist = clamp(this.controlSettings.assist, 0, 0.9);
      const proximity = 1 - clamp((distance - 5) / 42, 0, 1);
      const guidance = clamp(assist * (0.34 + proximity * 0.56), 0, 0.82);
      const autoYawRate = clamp(yawError * lerp(1.55, 2.7, proximity), -maxYawRate * 1.18, maxYawRate * 1.18);

      requestedYawRate = lerp(requestedYawRate, autoYawRate + requestedYawRate * 0.28, guidance);
      targetPitch = lerp(targetPitch, clamp(desiredPitch - lerp(0.06, 0.18, proximity), -1.42, -0.22), guidance);
      if (distance < 8.5) targetPitch = lerp(targetPitch, clamp(desiredPitch, -1.48, 0.25), 0.72);
      this.targetLockAge += dt;
    } else if (input.dive && !this.holdingFish) {
      targetPitch = Math.min(targetPitch, -0.94);
    } else if (input.flap) {
      targetPitch = Math.max(targetPitch, underwater ? 0.58 : 0.31);
    } else if (!underwater) {
      const neutralPitch = this.bird.position.y < 2.2 ? 0.12 : this.bird.position.y > 11 ? -0.1 : -0.018;
      targetPitch = lerp(targetPitch, neutralPitch, 0.34);
    }

    if (recovering && this.holdingFish) {
      targetPitch = Math.max(targetPitch, underwater ? 0.68 : 0.24);
      if (!underwater) {
        const perch = this._nearestPerch();
        const toPerch = this.temp3.copy(perch.position).sub(this.bird.position);
        const desiredYaw = Math.atan2(toPerch.x, -toPerch.z);
        const yawError = Math.atan2(Math.sin(desiredYaw - this.yaw), Math.cos(desiredYaw - this.yaw));
        requestedYawRate += clamp(yawError * 0.42, -0.34, 0.34);
      }
    }

    const yawResponse = locked ? 9.5 : underwater ? 7.8 : 8.6;
    this.yawVelocity = lerp(this.yawVelocity, requestedYawRate, smooth(yawResponse, dt));
    this.yaw += this.yawVelocity * dt;

    const pitchError = clamp(targetPitch, -1.48, 0.72) - this.pitch;
    const desiredPitchVelocity = clamp(pitchError * (locked ? 5.8 : recovering ? 5.1 : 4.45), -1.7, 1.7);
    this.pitchVelocity = lerp(this.pitchVelocity, desiredPitchVelocity, smooth(10.5, dt));
    this.pitch = clamp(this.pitch + this.pitchVelocity * dt, -1.5, 0.76);

    const bankTarget = -clamp(this.yawVelocity / Math.max(0.35, maxYawRate), -1, 1) * MAX_BANK;
    this.bank = lerp(this.bank, bankTarget, smooth(9.2, dt));

    this.forward.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    ).normalize();

    const wingPower = this.habitat.wingPower;
    let targetSpeed = underwater ? UNDERWATER_CRUISE * wingPower : AIR_CRUISE * wingPower;
    if (input.dive && !this.holdingFish) {
      const diveFactor = clamp((-this.pitch - 0.1) / 1.25, 0, 1);
      targetSpeed = lerp(targetSpeed, AIR_DIVE * wingPower, 0.48 + diveFactor * 0.52);
    }
    if (input.flap && this.energy > 0.015) {
      targetSpeed += underwater ? 5.2 : 6.4;
      this.energy = Math.max(0, this.energy - dt * (underwater ? 0.17 : 0.115));
    } else {
      this.energy = Math.min(1, this.energy + dt * (underwater ? 0.065 : 0.135));
    }
    if (recovering) targetSpeed += underwater ? 5.6 : 3.4;
    if (bankBoost) targetSpeed += 5.4 * clamp(this.bankBoostTimer / 1.8, 0.18, 1);
    if (this.focusActive) targetSpeed *= 1.08;

    this.speed = lerp(this.speed, targetSpeed, smooth(input.dive ? 3.7 : input.flap || recovering ? 5.1 : underwater ? 3.4 : 2.8, dt));
    this.speed = clamp(this.speed, 4.4, AIR_DIVE * wingPower * 1.12);

    const desiredVelocity = this.temp.copy(this.forward).multiplyScalar(this.speed);
    if (!underwater) {
      desiredVelocity.x += Math.sin(elapsed * 0.52 + this.bird.position.z * 0.013) * this.habitat.wind * 0.46;
      desiredVelocity.x += Math.sin(elapsed * 2.2 + this.bird.position.z * 0.02) * this.habitat.wind * this.habitat.weather * 0.18;
      if (!input.dive && !input.flap && !recovering) desiredVelocity.y -= 0.22;
      if (recovering) desiredVelocity.y += 0.85;
    } else {
      desiredVelocity.multiplyScalar(0.96);
      if (recovering) desiredVelocity.y += 2.6;
    }

    this.velocity.lerp(desiredVelocity, smooth(underwater ? 7.4 : 7.8, dt));
    this.bird.position.addScaledVector(this.velocity, dt);
    this.bird.position.y = clamp(this.bird.position.y, RIVERBED_Y - 0.05, 30);

    this._rebaseWorldIfNeeded();
    this._checkBoundaries();
    this._handleWaterTransition(input, dt);
    this._updateFocus(dt);
    this._updateBirdRotation();
  }

  _rebaseWorldIfNeeded() {
    if (!this.bird || Math.abs(this.bird.position.z) < 72) return;
    const shift = -this.bird.position.z;
    for (const child of this.scene.children) child.position.z += shift;
    this.previousBirdPosition.z += shift;
    this.camera.position.z += shift;
    this.cameraLook.z += shift;
    this.cameraLookTarget.z += shift;
    this.worldRebases += 1;
  }`);

replaceMethod('_updateCamera(dt) {', '_animateWater(elapsed) {', String.raw`  _updateCamera(dt) {
    if (!this.bird) return;
    const underwater = this.bird.position.y < WATER_Y - 0.08;
    const diveActive = (this.pointerDive || this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.gamepadDive || this.smartDiveCommit) && !this.holdingFish;
    const recovering = this.recoveryTimer > 0 && Boolean(this.holdingFish);
    const lockTarget = this.lockedTarget?.visible ? this.lockedTarget : null;
    const speedNorm = clamp((this.speed - 8) / 18, 0, 1);

    const baseDistance = (underwater ? 6.8 : diveActive ? lerp(7.1, 8.4, speedNorm) : recovering ? 8.8 : 8.25) * this.controlSettings.cameraDistance;
    const height = underwater ? 1.55 : diveActive ? lerp(2.25, 2.75, speedNorm) : 3.05;
    const sideOffset = this.bank * 0.52;

    const desired = this.temp.copy(this.forward).multiplyScalar(-baseDistance).add(this.bird.position);
    desired.y += height;
    desired.x += Math.cos(this.yaw) * sideOffset;
    desired.z += Math.sin(this.yaw) * sideOffset;

    if (this.cameraShake > 0.001 && !this.controlSettings.reducedMotion) {
      desired.x += rand(-1, 1) * this.cameraShake * 0.52;
      desired.y += rand(-1, 1) * this.cameraShake * 0.32;
      desired.z += rand(-1, 1) * this.cameraShake * 0.28;
      this.cameraShake *= Math.exp(-12 * dt);
    }

    const cameraOmega = diveActive ? 11.5 : underwater ? 10.5 : 9.5;
    this.temp2.copy(desired).sub(this.camera.position).multiplyScalar(cameraOmega * cameraOmega);
    this.temp2.addScaledVector(this.cameraVelocity, -2 * cameraOmega);
    this.cameraVelocity.addScaledVector(this.temp2, dt);
    this.camera.position.addScaledVector(this.cameraVelocity, dt);

    this.cameraLookTarget.copy(this.bird.position).addScaledVector(this.forward, underwater ? 7.5 : diveActive ? 10.5 : 9.2);
    this.cameraLookTarget.y += underwater ? 0.05 : 0.28;
    if (lockTarget) this.cameraLookTarget.lerp(this.temp3.copy(lockTarget.position), diveActive ? 0.2 : 0.1);

    const lookOmega = diveActive ? 13 : 10.5;
    this.temp2.copy(this.cameraLookTarget).sub(this.cameraLook).multiplyScalar(lookOmega * lookOmega);
    this.temp2.addScaledVector(this.cameraLookVelocity, -2 * lookOmega);
    this.cameraLookVelocity.addScaledVector(this.temp2, dt);
    this.cameraLook.addScaledVector(this.cameraLookVelocity, dt);
    this.camera.lookAt(this.cameraLook);

    const targetFov = underwater ? 69 : diveActive ? lerp(65, 72, speedNorm) : recovering ? 66 : 63;
    const fovOmega = 10;
    const fovAccel = (targetFov - this.camera.fov) * fovOmega * fovOmega - 2 * fovOmega * this.cameraFovVelocity;
    this.cameraFovVelocity += fovAccel * dt;
    this.camera.fov += this.cameraFovVelocity * dt;
    this.camera.updateProjectionMatrix();
  }`);

replaceMethod('_wrapZ(value) {', '_finishHunt() {', String.raw`  _wrapZ(value) {
    const center = this.bird?.position?.z || 0;
    const span = WORLD_HALF_LENGTH * 2;
    let wrapped = value;
    while (wrapped < center - WORLD_HALF_LENGTH) wrapped += span;
    while (wrapped > center + WORLD_HALF_LENGTH) wrapped -= span;
    return wrapped;
  }`);

text = text.replace('this.slowMotionTimer = Math.max(this.slowMotionTimer, perfect ? 0.72 : 0.48);', 'this.slowMotionTimer = Math.max(this.slowMotionTimer, perfect ? 0.28 : 0.16);');
text = text.replace('this.hitStopTimer = Math.max(this.hitStopTimer, perfect ? 0.065 : 0.04);', 'this.hitStopTimer = Math.max(this.hitStopTimer, perfect ? 0.018 : 0.008);');
text = text.replace('this.slowMotionTimer = Math.max(this.slowMotionTimer, 0.32);', 'this.slowMotionTimer = Math.max(this.slowMotionTimer, 0.12);');
text = text.replace('      dt *= 0.52;', '      dt *= 0.72;');

fs.writeFileSync(path, text);
