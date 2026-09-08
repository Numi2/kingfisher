import * as THREE from 'three';
import { FlightClock, FlightPadEdges } from './FlightSession.mjs';
import { KingfisherGameEngine as RiverEngine } from './KingfisherGameEngine';
import { clamp, finite, damp, wrapAngle, radialInput, springVector, sweptDistance, initializeMotion, stepFlightMotion } from './FlightMotion.mjs';
export { DEFAULT_CONTROL_SETTINGS, DEFAULT_HABITAT, FISH_TYPES, HUNT_DURATION, MEDAL_TARGETS } from './KingfisherGameEngine';
export const KINGFISHER_VERSION = '4.1.0';

// Retains the existing habitat, rendering, scoring, collection and effects.
// This is the sole gameplay controller used by the UI.
export class KingfisherGameEngine extends RiverEngine {
  constructor(...args) {
    super(...args);
    cancelAnimationFrame(this.frame);
    this._ensureV4();
    this._frameTimestamp = null;
    this._animate = this._tick.bind(this);
    this.frame = requestAnimationFrame(this._animate);
  }

  _ensureV4() {
    if (this._v4Ready) return;
    this._v4Ready = true;
    initializeMotion(this);
    this._actions = { dive: new Set(), flap: new Set(), brake: new Set(), burst: new Set() };
    this.flightClock = new FlightClock();
    this.padEdges = new FlightPadEdges();
    this._keyboardNavigation = false;
    this.pauseHistory = [];
    this._renderDirty = true;
    this._lastFlapAt = -Infinity;
    this._diveSuppressed = false;
    this._collisionCooldown = 0;
    this._simulationTime = 0;
    this._wingPhase = 0;
    this._wingAmplitude = 0.3;
    this._wingFold = 0;
    this._cameraYaw = 0;
    this._lastCameraBird = null;
    this._previousForward = new THREE.Vector3(0, 0, -1);
    this._predictedTarget = new THREE.Vector3();
    this._activeInput = { x: 0, y: 0, dive: false, flap: false, brake: false };
    this._motionEnvironment = {};
    this._loopSurfaces = this.scene.children.filter(o => o === this.sky || o === this.water || (o.isMesh && ((o.geometry?.parameters?.height || 0) > 300 || (o.geometry?.parameters?.depth || 0) > 300)));
  }

  _bindEvents() {
    this._ensureV4();
    const actionFor = code => ({ ShiftLeft: 'dive', ShiftRight: 'dive', Space: 'flap', KeyX: 'brake', KeyC: 'brake', KeyE: 'burst' })[code];
    this._onResize = () => { this._resize(); this._renderDirty = true; };
    // Window focus can change while the game remains visible (especially in an iframe).
    this._onBlur = () => { this._clearTransientInput(); this.flightClock.reset(); };
    this._onVisibility = () => {
      this.flightClock.setHidden(document.hidden);
      this._clearTransientInput();
      this._renderDirty = true;
      if (document.hidden) this.audioContext?.suspend?.().catch(() => {});
      else if (this.controlSettings.sound) this.audioContext?.resume?.().catch(() => {});
    };
    this._onPointerInput = () => { this._keyboardNavigation = false; };
    this._onContextLost = event => { event.preventDefault(); this.flightClock.setContextLost(true); this._clearTransientInput(); };
    this._onContextRestored = () => { this.flightClock.setContextLost(false); this._renderDirty = true; };
    this.flightClock.setHidden(document.hidden);
    this._onKeyDown = event => {
      if (event.code === 'Tab') { this._keyboardNavigation = true; return; }
      if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable) return;
      if (event.code === 'Escape' && !event.repeat) { event.preventDefault(); this.setPaused(this.state !== 'paused', 'keyboard'); return; }
      // Preserve deliberate Tab-navigation, but a mouse-focused HUD button must not
      // turn the next Space wingbeat into a native click on Pause.
      if (this._keyboardNavigation && event.target?.closest?.('button,[role="button"]')) return;
      if (event.code === 'KeyR' && !event.repeat && this.state !== 'menu') { this.restartCurrentMode(); return; }
      if (this.state !== 'playing') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      const action = actionFor(event.code);
      if (action) { event.preventDefault(); event.stopPropagation(); }
      if (action && !event.repeat) this._setAction(action, true, event.code);
      if (event.code === 'KeyT' && !event.repeat) this.rescue('RETURNED TO RIVER', 80);
    };
    this._onKeyUp = event => {
      const held = this.keys.delete(event.code), action = actionFor(event.code);
      if (action && held) { event.preventDefault(); event.stopPropagation(); this._setAction(action, false, event.code); }
    };
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onVisibility);
    window.addEventListener('keydown', this._onKeyDown, { passive: false, capture: true });
    window.addEventListener('keyup', this._onKeyUp, { capture: true });
    window.addEventListener('pointerdown', this._onPointerInput, { capture: true, passive: true });
    this.renderer.domElement.addEventListener('webglcontextlost', this._onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this._onContextRestored);
  }

  _clearTransientInput() {
    this._ensureV4();
    for (const sources of Object.values(this._actions)) sources.clear();
    this.padEdges.reset();
    super._clearTransientInput();
    this._cancelCommittedDive(true);
    this._diveSuppressed = false;
    this.boostTimer = 0; this.flapPulseTimer = 0;
    this._lastFlapAt = -Infinity;
    this._activeInput = { x: 0, y: 0, dive: false, flap: false, brake: false };
  }

  setSteering(x = 0, y = 0) {
    // Pointer callbacks never modify angular velocity. Releasing a touch must not
    // multiply momentum once per event or disturb a held keyboard/gamepad input.
    this.steering.x = clamp(finite(x), -1, 1);
    this.steering.y = clamp(finite(y), -1, 1);
  }
  setDiving(down) { this._setAction('dive', down, 'touch'); }
  setFlapping(down) { this._setAction('flap', down, 'touch'); }
  setBraking(down) { this._setAction('brake', down, 'touch'); }
  setBurst(down) { this._setAction('burst', down, 'touch'); }

  _setAction(action, down, source) {
    this._ensureV4();
    const sources = this._actions[action];
    if (!sources || (down && this.state !== 'playing')) return;
    const wasDown = sources.size > 0;
    if (down) {
      if (sources.has(source)) return;
      sources.add(source);
    } else sources.delete(source);
    const isDown = sources.size > 0;
    if (isDown && !wasDown) {
      if (action === 'dive') {
        if (this.smartDiveCommit) { this._cancelCommittedDive(true); this._diveSuppressed = true; this.surfaceAssistTimer = this.bird.position.y < 0 ? 0.9 : 0.2; }
        else { this._diveSuppressed = false; this.flapPulseTimer = 0; this.surfaceAssistTimer = 0; this._beginDive(); }
      } else if (action === 'flap') {
        this._cancelCommittedDive(true); this._diveSuppressed = true;
        this.flapPulseTimer = 0.30;
        if (this.bird.position.y < 0.4) this.surfaceAssistTimer = 1.1;
        const now = performance.now();
        if (now - this._lastFlapAt < 280) { this.boost(); this._lastFlapAt = -Infinity; }
        else this._lastFlapAt = now;
      } else if (action === 'brake') {
        this._cancelCommittedDive(true); this._diveSuppressed = true; this.boostTimer = 0;
      } else if (action === 'burst') this.boost();
    }
    if (action === 'dive' && !isDown && wasDown) {
      if (!this.controlSettings.smartDive) this._cancelCommittedDive(true);
      this._diveSuppressed = false;
    }
    this.pointerDive = this._actions.dive.size > 0 && !this._diveSuppressed;
    this.pointerFlap = this._actions.flap.size > 0;
  }

  boost() {
    this._ensureV4();
    if (this.state !== 'playing' || this.boostCooldown > 0 || this.energy < 0.16 || this._actions.brake.size) return false;
    this.energy -= 0.16; this.boostTimer = 0.65; this.boostCooldown = 1.3;
    this.callbacks.onEvent?.({ type: 'boost' }); this._haptic(8); this._tone(470, 0.07, 0.018);
    return true;
  }

  _beginDive() {
    if (this.state !== 'playing' || this.holdingFish) return;
    const yawRate = this.yawVelocity, pitchRate = this.pitchVelocity;
    super._beginDive();
    this.yawVelocity = yawRate; this.pitchVelocity = pitchRate;
    this.diveStartHeight = Math.max(0, this.bird.position.y);
    this.targetLockAge = 0;
  }

  _readInput() {
    this._ensureV4();
    let x = this.steering.x + Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    let y = this.steering.y + Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    let pad;
    try { pad = Array.from(navigator.getGamepads?.() || []).find(p => p?.connected); } catch {}
    const stick = radialInput(pad?.axes?.[0] || 0, -(pad?.axes?.[1] || 0), 0.12);
    x += stick.x; y += stick.y;
    for (const [action, down] of this.padEdges.sample(pad, performance.now())) {
      if (action === 'pause') { if (down) this.setPaused(this.state !== 'paused', 'gamepad'); }
      else this._setAction(action, down, 'gamepad');
    }
    const length = Math.max(1, Math.hypot(x, y));
    const flap = this._actions.flap.size > 0 || this.flapPulseTimer > 0;
    const brake = this._actions.brake.size > 0;
    this._activeInput = { x: clamp(x / length, -1, 1), y: clamp(y / length, -1, 1) * (this.controlSettings.invertY ? -1 : 1), flap, brake, dive: !flap && !brake && !this.holdingFish && (this.smartDiveCommit || (!this._diveSuppressed && this._actions.dive.size > 0)) };
    return this._activeInput;
  }

  _chooseFishTarget(force = false) {
    if (this.holdingFish) { this.currentTarget = null; return; }
    if (!force && this.lockedTarget?.visible) { this.currentTarget = this.lockedTarget; return; }
    let best = null, score = Infinity;
    for (const fish of this.fish) {
      if (!fish.visible || fish.userData.caught) continue;
      const dx = fish.position.x - this.bird.position.x, dy = fish.position.y - this.bird.position.y, dz = fish.position.z - this.bird.position.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > 62 || distance < 0.001) continue;
      const ahead = (dx*this.forward.x + dy*this.forward.y + dz*this.forward.z) / distance;
      if (ahead < 0.05) continue;
      const candidate = distance * 0.35 + (1 - ahead) * 32 - (fish === this.currentTarget ? 2.8 : 0);
      if (candidate < score) { score = candidate; best = fish; }
    }
    this.currentTarget = best;
  }

  _updateFlight(dt, elapsed, input) {
    this._ensureV4();
    this.previousBirdPosition.copy(this.bird.position);
    this._previousForward.copy(this.forward);
    this.surfaceAssistTimer = Math.max(0, this.surfaceAssistTimer - dt);
    this.bankBoostTimer = Math.max(0, this.bankBoostTimer - dt);
    this._collisionCooldown = Math.max(0, this._collisionCooldown - dt);
    // Recompute after catch/cancel within a multi-step frame: stale input cannot re-dive.
    input.dive = input.dive && !this.holdingFish && !this._diveSuppressed && (this.smartDiveCommit || this._actions.dive.size > 0);
    const env = this._motionEnvironment;
    Object.assign(env, { underwater: this.bird.position.y < -0.06, sensitivity: this.controlSettings.sensitivity, assist: this.controlSettings.assist, wingPower: this.habitat.wingPower, wind: this.habitat.wind, current: this.habitat.riverCurrent, time: elapsed, target: null });
    if (input.dive) {
      this.targetLockAge += dt;
      const fish = this.lockedTarget?.visible ? this.lockedTarget : null;
      if (fish) {
        const distance = fish.position.distanceTo(this.bird.position);
        const lead = clamp(distance / Math.max(this.speed, 14), 0.03, 0.5);
        this._predictedTarget.copy(fish.position);
        if (fish.userData.motionVelocity) this._predictedTarget.addScaledVector(fish.userData.motionVelocity, lead);
        env.target = this._predictedTarget;
        const behind = this.temp.copy(fish.position).sub(this.bird.position).dot(this.forward) < -1.5;
        if ((behind && distance < 9 && env.underwater) || this.targetLockAge > 3.5) {
          this._cancelCommittedDive(true); this._diveSuppressed = true; this.surfaceAssistTimer = 1.0; input.dive = false; env.target = null;
        }
      } else if (this.smartDiveCommit && this.targetLockAge > 1.5 && env.underwater) {
        this._cancelCommittedDive(true); this._diveSuppressed = true; this.surfaceAssistTimer = 1; input.dive = false;
      }
    }
    stepFlightMotion(this, input, env, dt);
    this._checkBoundaries();
    this._scrollWorld();
    this._handleWaterTransition(input, dt);
    this._updateFocus(dt);
    this._updateBirdRotation();
  }

  _updateBirdRotation() {
    // Geometry faces local -Z. These signs must agree with forward=(sin(yaw),sin(pitch),-cos(yaw)).
    this.bird.rotation.set(this.pitch, -this.yaw, this.bank, 'YXZ');
  }

  _checkBoundaries() {
    const p = this.bird.position;
    let hit = false;
    if (p.y < -4.08) { p.y = -4.08; this.pitch = Math.max(this.pitch, 0.65); this.velocity.y = Math.max(3, Math.abs(this.velocity.y) * 0.45); this.surfaceAssistTimer = 1.2; hit = true; }
    if (Math.abs(p.x) > 8.35 && p.y < 1.0) { p.x = Math.sign(p.x) * 8.30; this.yaw = -this.yaw; this.yawVelocity = 0; this.pitch = Math.max(this.pitch, 0.35); this.surfaceAssistTimer = 0.8; hit = true; }
    if (Math.abs(p.x) > 24) { p.x = Math.sign(p.x) * 23.95; this.yaw = -this.yaw; this.yawVelocity = 0; hit = true; }
    if (p.y > 32) { p.y = 32; this.pitch = Math.min(0, this.pitch); this.pitchVelocity = Math.min(0, this.pitchVelocity); }
    if (hit) {
      this._cancelCommittedDive(true); this._diveSuppressed = true;
      if (this._collisionCooldown <= 0) { this.collisions++; this.speed *= 0.78; this._collisionCooldown = 0.8; this.callbacks.onEvent?.({ type: 'collision', message: 'RECOVER' }); this._haptic(8); }
    }
  }

  _wrapZ(z) { const center = this.bird?.position.z || 0; return center + ((z - center + 190) % 380 + 380) % 380 - 190; }
  _scrollWorld() {
    const z = this.bird.position.z;
    if (Math.abs(z) > 190) {
      const shift = -Math.floor((z + 190) / 380) * 380;
      for (const object of this.scene.children) object.position.z += shift;
      for (const v of [this.previousBirdPosition, this.camera.position, this.cameraLook, this.cameraDesired, this.cameraLookDesired, this._lastCameraBird]) if (v) v.z += shift;
      for (const fish of this.fish) if (fish.userData.previousPosition) fish.userData.previousPosition.z += shift;
      if (this.sun?.target) { this.sun.target.position.z += shift; this.sun.target.updateMatrixWorld(); }
    }
    for (const group of [this.fish, this.perches, this.decor]) for (const object of group) {
      const before = object.position.z;
      object.position.z = this._wrapZ(before);
      if (object.userData.previousPosition) object.userData.previousPosition.z += object.position.z - before;
    }
    for (const surface of this._loopSurfaces) surface.position.z = this.bird.position.z;
  }

  _updateFish(dt, elapsed) {
    for (const fish of this.fish) {
      if (!fish.userData.previousPosition) fish.userData.previousPosition = fish.position.clone();
      fish.userData.previousPosition.copy(fish.position);
    }
    super._updateFish(dt, elapsed);
    for (const fish of this.fish) {
      const previous = fish.userData.previousPosition;
      previous.z = fish.position.z + ((previous.z - fish.position.z + 190) % 380 + 380) % 380 - 190;
      const velocity = fish.userData.motionVelocity || (fish.userData.motionVelocity = new THREE.Vector3());
      if (dt > 0) velocity.copy(fish.position).sub(previous).multiplyScalar(1 / dt).clampLength(0, 8);
    }
  }

  _checkCatchAndBank(elapsed) {
    const p = this.bird.position, prev = this.previousBirdPosition, f = this.forward, pf = this._previousForward;
    if (!this.holdingFish && (this.diveAttempt || p.y < -0.06) && elapsed - this.lastCatchAt > 0.22) {
      let best = null, bestDistance = Infinity;
      const target = this.lockedTarget?.visible ? this.lockedTarget : this.currentTarget;
      for (const fish of this.fish) {
        if (!fish.visible || fish.userData.caught) continue;
        const q = fish.position, qp = fish.userData.previousPosition || q;
        const d = sweptDistance(prev.x + pf.x*2.1 - qp.x, prev.y + pf.y*2.1 - qp.y, prev.z + pf.z*2.1 - qp.z, p.x + f.x*2.1 - q.x, p.y + f.y*2.1 - q.y, p.z + f.z*2.1 - q.z);
        const radius = (fish === target ? 1.05 + clamp(finite(this.controlSettings.assist), 0, 0.9)*0.65 : 0.72) * (fish.userData.type.scale || 1);
        if (d < radius && d < bestDistance) { best = fish; bestDistance = d; }
      }
      if (best) this._catchFish(best, bestDistance, elapsed);
    }
    if (this.holdingFish) {
      const perch = this._nearestPerch().position;
      if (sweptDistance(prev.x-perch.x, prev.y-perch.y, prev.z-perch.z, p.x-perch.x, p.y-perch.y, p.z-perch.z) < 3.8) this._bankFish();
    }
  }

  _catchFish(...args) {
    super._catchFish(...args);
    this._diveSuppressed = true; this.surfaceAssistTimer = this.bird.position.y < 0 ? 1.1 : 0.3;
    this.slowMotionTimer = 0;
    if (!this._carryMesh) {
      this._carryMesh = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 6), new THREE.MeshStandardMaterial({ color: 0x9abac2, roughness: 0.4 }));
      this._carryMesh.scale.set(2.4, 0.6, 0.7); this._carryMesh.position.set(0, 0, -2.02); this.bird.add(this._carryMesh);
    }
    this._carryMesh.material.color.setHex(this.holdingType.body); this._carryMesh.visible = true;
  }
  _bankFish() { super._bankFish(); if (this._carryMesh) this._carryMesh.visible = false; this.slowMotionTimer = 0; }
  _resetBird() {
    this._ensureV4(); initializeMotion(this); this._cameraYaw = 0; this._lastCameraBird = null;
    super._resetBird(); this._previousForward.copy(this.forward); this._collisionCooldown = 0;
    this.flightClock.reset(); this._renderDirty = true;
    this.lastCatchAt = -Infinity;
    if (this._carryMesh) this._carryMesh.visible = false;
  }
  rescue(...args) {
    super.rescue(...args); this._clearTransientInput(); this.surfaceAssistTimer = 0;
    this._cameraYaw = this.yaw; this._lastCameraBird = null;
    this.camera.position.copy(this.bird.position).add(new THREE.Vector3(0, 2.8, 8));
    this.cameraLook.copy(this.bird.position); this.cameraVelocity.set(0,0,0); this.cameraLookVelocity.set(0,0,0);
    if (this._carryMesh) this._carryMesh.visible = false;
  }

  _updateCamera(dt) {
    if (!this.bird) return;
    this._ensureV4();
    if (!this._lastCameraBird) this._lastCameraBird = this.bird.position.clone();
    const dx = this.bird.position.x-this._lastCameraBird.x, dy = this.bird.position.y-this._lastCameraBird.y, dz = this.bird.position.z-this._lastCameraBird.z;
    for (const v of [this.camera.position, this.cameraLook]) { v.x += dx; v.y += dy; v.z += dz; }
    this._lastCameraBird.copy(this.bird.position);
    this._cameraYaw += wrapAngle(this.yaw + this.yawVelocity*0.035 - this._cameraYaw) * (1-Math.exp(-13*dt));
    const wet = this.bird.position.y < -0.06;
    // Preserve room around the wings in narrow portrait viewports.
    const portraitFraming = clamp(0.70 / Math.max(0.3, this.camera.aspect), 1, 1.65);
    const distance = (wet ? 6.4 : 7.8) * portraitFraming * clamp(finite(this.controlSettings.cameraDistance,1),0.78,1.32);
    const pitch = clamp(this.pitch * 0.48, -0.60, 0.50);
    const direction = this.temp3.set(Math.sin(this._cameraYaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(this._cameraYaw)*Math.cos(pitch));
    this.cameraDesired.copy(this.bird.position).addScaledVector(direction,-distance); this.cameraDesired.y += wet ? 1.6 : 2.5;
    springVector(this.camera.position, this.cameraVelocity, this.cameraDesired, 17, dt);
    this.cameraLookDesired.copy(this.bird.position).addScaledVector(direction, 5.0);
    this.cameraLookDesired.y += 0.12;
    springVector(this.cameraLook, this.cameraLookVelocity, this.cameraLookDesired, 22, dt);
    this.camera.up.set(0,1,0); this.camera.lookAt(this.cameraLook);
    const fov = this.controlSettings.reducedMotion ? 64 : this.boostTimer > 0 ? 71 : wet ? 68 : 64 + 3*this.diveBlend;
    this.camera.fov = damp(this.camera.fov, fov, 8, dt); this.camera.updateProjectionMatrix();
  }

  _animateBird(elapsed, input, dt = 1/60) {
    if (!this.bird?.userData.leftWing) return;
    this._ensureV4();
    const wet = this.bird.position.y < -0.06;
    const powered = input.flap || this.boostTimer > 0 || (wet && this.surfaceAssistTimer > 0);
    const frequency = powered ? 7.8 : wet ? 4.5 : 3.2;
    this._wingPhase = (this._wingPhase + dt * frequency * Math.PI * 2) % (Math.PI*2);
    this._wingAmplitude = damp(this._wingAmplitude, powered ? 0.96 : input.brake ? 0.16 : this.speed > 20 ? 0.12 : 0.32, 14, dt);
    this._wingFold = damp(this._wingFold, input.dive && !this.holdingFish ? 0.91 : 0, 17, dt);
    const phase = Math.sin(this._wingPhase), a = this._wingAmplitude;
    const left = this.bird.userData.leftWing, right = this.bird.userData.rightWing;
    left.rotation.z = (0.16 + phase*a)*(1-this._wingFold) + 1.32*this._wingFold + this.bank*0.11;
    right.rotation.z = (-0.16 - phase*a)*(1-this._wingFold) - 1.32*this._wingFold + this.bank*0.11;
    left.rotation.y = this.brakeBlend*0.3; right.rotation.y = -this.brakeBlend*0.3;
    left.rotation.x = right.rotation.x = -0.06 + Math.abs(phase)*a*0.10;
    const tail = this.bird.userData.tailGroup;
    if (tail) { tail.rotation.y = this.bank*0.26; tail.rotation.x = this.brakeBlend*0.34-this.pitch*0.09; tail.scale.x = 1+this.brakeBlend*0.7; }
  }

  _focusFlight() {
    this._keyboardNavigation = false;
    this.mount?.closest?.('.game-shell')?.focus?.({ preventScroll: true });
  }

  setPaused(value, reason = 'manual') {
    if (value && !['manual', 'keyboard', 'gamepad'].includes(reason)) return;
    const before = this.state;
    super.setPaused(value);
    if (this.state !== before) {
      this.flightClock.reset(); this._renderDirty = true;
      this.pauseHistory.push({ reason, paused: this.state === 'paused', time: this._simulationTime });
      if (this.pauseHistory.length > 16) this.pauseHistory.shift();
      if (!value) this._focusFlight();
    }
  }
  startHunt() { super.startHunt(); this.countdown = 1; this._emitHud(true); this._focusFlight(); }
  startFreeFlight() { super.startFreeFlight(); this._focusFlight(); }

  _tick(timestamp) {
    if (this.destroyed) return;
    const active = this.state !== 'paused' && this.state !== 'finished';
    const { delta: dt, raw, steps } = this.flightClock.sample(timestamp, active);
    if (this.flightClock.suspended) { this.frame = requestAnimationFrame(this._animate); return; }
    const input = this._readInput();
    if (this.state === 'countdown') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown === 0) { this.state = 'playing'; this._emitState(); this._tone(740,0.08,0.02); }
    } else if (this.state === 'playing' && steps > 0) {
      if (this.mode === 'hunt') { this.timeRemaining = Math.max(0,this.timeRemaining-dt); if (!this.timeRemaining) this._finishHunt(); }
      const h = dt / steps;
      for (let i=0; i<steps && this.state === 'playing'; i++) {
        this._simulationTime += h;
        this._chooseFishTarget(); this._updateFlight(h,this._simulationTime,input);
        this._updateFish(h,this._simulationTime); this._checkCatchAndBank(this._simulationTime);
      }
    } else if (this.state === 'menu') {
      this._simulationTime += dt;
      this.bird.position.y = 6.3+Math.sin(this._simulationTime*1.5)*0.18;
      this._chooseFishTarget(); this._updateFish(dt,this._simulationTime);
    }
    const frozen = ['paused','finished'].includes(this.state);
    if (!frozen) {
      this._animateBird(this._simulationTime,this._activeInput,dt);
      this._animateWater(this._simulationTime); this._updateEffects(dt);
      for (const perch of this.perches) if (perch.userData.marker) perch.userData.marker.rotation.z = this._simulationTime*0.55;
    }
    if (!frozen || this._renderDirty) {
      this._updateEnvironmentByDepth(); this._updateCamera(dt);
      if (raw > 0 && raw < 0.75 && !frozen) this._updateAdaptiveQuality(raw);
      this._emitHud(false); this.renderer.render(this.scene,this.camera);
      this._renderDirty = false;
    }
    this.frame = requestAnimationFrame(this._animate);
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown, true);
    window.removeEventListener('keyup', this._onKeyUp, true);
    window.removeEventListener('pointerdown', this._onPointerInput, true);
    this.renderer?.domElement?.removeEventListener('webglcontextlost', this._onContextLost);
    this.renderer?.domElement?.removeEventListener('webglcontextrestored', this._onContextRestored);
    super.destroy();
  }
}
