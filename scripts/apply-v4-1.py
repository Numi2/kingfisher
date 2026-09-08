from pathlib import Path
import json
root=Path('.')
def edit(path,old,new):
 p=root/path;s=p.read_text();assert s.count(old)==1,(path,old[:75],s.count(old));p.write_text(s.replace(old,new,1))
E='app/lib/AgileKingfisherEngine.js'
edit(E,"import * as THREE from 'three';","import * as THREE from 'three';\nimport { FlightClock, FlightPadEdges } from './FlightSession.mjs';")
edit(E,"KINGFISHER_VERSION = '4.0.0'","KINGFISHER_VERSION = '4.1.0'")
edit(E,"    this._padPrevious = {};",'''    this.flightClock = new FlightClock();
    this.padEdges = new FlightPadEdges();
    this._keyboardNavigation = false;
    this.pauseHistory = [];
    this._renderDirty = true;''')
edit(E,"    this._onResize = () => this._resize();\n    this._onBlur = () => { this.setPaused(true); this._clearTransientInput(); };\n    this._onVisibility = () => { if (document.hidden) this._onBlur(); this._frameTimestamp = null; };",'''    this._onResize = () => { this._resize(); this._renderDirty = true; };
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
    this.flightClock.setHidden(document.hidden);''')
edit(E,"      if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target?.tagName) || event.target?.isContentEditable) return;\n      if (event.code === 'Escape' && !event.repeat) { this.setPaused(this.state !== 'paused'); return; }",'''      if (event.code === 'Tab') { this._keyboardNavigation = true; return; }
      if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable) return;
      if (event.code === 'Escape' && !event.repeat) { event.preventDefault(); this.setPaused(this.state !== 'paused', 'keyboard'); return; }
      // Preserve deliberate Tab-navigation, but a mouse-focused HUD button must not
      // turn the next Space wingbeat into a native click on Pause.
      if (this._keyboardNavigation && event.target?.closest?.('button,[role="button"]')) return;''')
edit(E,"      const action = actionFor(event.code);\n      if (action && !event.repeat)","      const action = actionFor(event.code);\n      if (action) { event.preventDefault(); event.stopPropagation(); }\n      if (action && !event.repeat)")
edit(E,"    this._onKeyUp = event => { this.keys.delete(event.code); const action = actionFor(event.code); if (action) this._setAction(action, false, event.code); };",'''    this._onKeyUp = event => {
      const held = this.keys.delete(event.code), action = actionFor(event.code);
      if (action && held) { event.preventDefault(); event.stopPropagation(); this._setAction(action, false, event.code); }
    };''')
edit(E,"    window.addEventListener('keydown', this._onKeyDown, { passive: false });\n    window.addEventListener('keyup', this._onKeyUp);",'''    window.addEventListener('keydown', this._onKeyDown, { passive: false, capture: true });
    window.addEventListener('keyup', this._onKeyUp, { capture: true });
    window.addEventListener('pointerdown', this._onPointerInput, { capture: true, passive: true });
    this.renderer.domElement.addEventListener('webglcontextlost', this._onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this._onContextRestored);''')
edit(E,"    for (const sources of Object.values(this._actions)) sources.clear();", "    for (const sources of Object.values(this._actions)) sources.clear();\n    this.padEdges.reset();")
a='''    const buttons = { flap: Boolean(pad?.buttons?.[0]?.pressed), dive: Boolean(pad?.buttons?.[1]?.pressed || pad?.buttons?.[7]?.pressed), brake: Boolean(pad?.buttons?.[2]?.pressed || pad?.buttons?.[6]?.pressed), burst: Boolean(pad?.buttons?.[5]?.pressed) };
    for (const [action, down] of Object.entries(buttons)) {
      if (down !== Boolean(this._padPrevious[action])) this._setAction(action, down, 'gamepad');
      this._padPrevious[action] = down;
    }
    const pause = Boolean(pad?.buttons?.[9]?.pressed);
    if (pause && !this._padPrevious.pause) this.setPaused(this.state !== 'paused');
    this._padPrevious.pause = pause;'''
edit(E,a,'''    for (const [action, down] of this.padEdges.sample(pad, performance.now())) {
      if (action === 'pause') { if (down) this.setPaused(this.state !== 'paused', 'gamepad'); }
      else this._setAction(action, down, 'gamepad');
    }''')
edit(E,"    input = { ...input, dive: input.dive && !this.holdingFish && !this._diveSuppressed && (this.smartDiveCommit || this._actions.dive.size > 0) };", "    input.dive = input.dive && !this.holdingFish && !this._diveSuppressed && (this.smartDiveCommit || this._actions.dive.size > 0);")
edit(E,"    for (const object of [...this.fish, ...this.perches, ...this.decor]) {", "    for (const group of [this.fish, this.perches, this.decor]) for (const object of group) {")
edit(E,"    super._resetBird(); this._previousForward.copy(this.forward); this._collisionCooldown = 0;", "    super._resetBird(); this._previousForward.copy(this.forward); this._collisionCooldown = 0;\n    this.flightClock.reset(); this._renderDirty = true;")
p=root/E;s=p.read_text();a=s.index('  _tick(timestamp) {');s=s[:a]+'''  _focusFlight() {
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
''';p.write_text(s)
U='app/components/KingfisherGame.jsx'
edit(U,'import FlightAction from "./FlightAction";', 'import FlightAction from "./FlightAction";\nimport PauseButton from "./PauseButton";')
edit(U,'    <main className={`game-shell', '    <main tabIndex={-1} aria-label="Kingfisher flight game" className={`game-shell')
edit(U,'              <button type="button" onClick={() => engineRef.current?.setPaused(true)} aria-label="Pause"><PauseIcon/></button>', '              <PauseButton onPause={() => engineRef.current?.setPaused(true)}><PauseIcon/></PauseButton>')
edit(U,'function BranchIcon({ className = "" }) {','function BrakeIcon() {\n  return <Icon><path d="M3 5v8a7 7 0 0 0 14 0V6l4 4 1.4-1.4L16 2.2l-6.4 6.4L11 10l4-4v7a5 5 0 0 1-10 0V5H3Z"/></Icon>;\n}\n\nfunction BranchIcon({ className = "" }) {')
edit(U,'className="brake-control" label="BRAKE" shortcut="X" icon={<PauseIcon/>}', 'className="brake-control" label="BRAKE" shortcut="X" icon={<BrakeIcon/>}')
edit(U,'          <div className="flight-telemetry" aria-live="off"><strong>{hud.flightAction || "GLIDE"}</strong><span>{Math.round(hud.speed || 0)} m/s{hud.holdingFish ? ` · PERCH ${Math.round(hud.targetDistance || 0)} m` : ""}</span></div>', '          <div className="flight-telemetry" aria-label={`${hud.flightAction || "GLIDE"}, ${Math.round(hud.speed || 0)} metres per second`}><BoltIcon/><span>{Math.round(hud.speed || 0)}</span></div>')
edit(U,'className="resume" type="button" onClick', 'className="resume" aria-label="Resume flight" type="button" onClick')
edit(U,'<div className="menu-layer pause-layer"><section className="pause-card">', '<div className="menu-layer pause-layer" role="dialog" aria-modal="true" aria-label="Game paused"><section className="pause-card">')
edit(U,'<button type="button" onClick={() => engineRef.current?.restartCurrentMode()}><RestartIcon/></button>', '<button type="button" aria-label="Restart flight" onClick={() => engineRef.current?.restartCurrentMode()}><RestartIcon/></button>')
edit(U,'<button type="button" onClick={goMenu}><HomeIcon/></button>', '<button type="button" aria-label="Main menu" onClick={goMenu}><HomeIcon/></button>')
edit(U,'  const startHunt = () => {', '''  useEffect(() => {
    if (gameState === 'paused') document.querySelector('.pause-grid .resume')?.focus({ preventScroll: true });
  }, [gameState]);

  const startHunt = () => {''')
F='app/lib/FlightMotion.mjs'
edit(F,"  if (flap && s.energy > 0.025) targetSpeed += wet ? 5.0 : 7.0;", "  const wingAuthority = smoothstep(0, 0.16, s.energy);\n  if (flap) targetSpeed += (wet ? 5.0 : 7.0) * wingAuthority;")
edit(F,"  if (flap && s.energy > 0.025) s.energy = Math.max(0, s.energy - dt * (wet ? 0.17 : 0.12));", "  if (flap) s.energy = Math.max(0, s.energy - dt * (wet ? 0.17 : 0.12) * wingAuthority);")
V='scripts/verify-flight.cjs'
edit(V,"const blurSafe=e.state==='paused'&&!e.smartDiveCommit&&Object.values(e._actions).every(s=>s.size===0);", "const blurSafe=e.state==='playing'&&!e.smartDiveCommit&&Object.values(e._actions).every(s=>s.size===0);")
p=root/'package.json';j=json.loads(p.read_text());j['version']='4.1.0';j['scripts']['test:flight']='node --test tests/*.test.mjs';p.write_text(json.dumps(j,indent=2)+'\n')
p=root/'app/api/health/route.js';p.write_text(p.read_text().replace('4.0.0','4.1.0'))
p=root/'app/globals.css';p.write_text(p.read_text()+'''
/* Uninterrupted flight: isolate the menu affordance from thumb gestures. */
.game-shell:focus { outline: none; }
.hud-tools .pause-control { touch-action: none; -webkit-touch-callout: none; }
.flight-controls .action-label, .flight-controls kbd { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.flight-controls .flight-control .ui-icon { width: 33px; height: 33px; flex-basis: 33px; }
.flight-telemetry { flex-direction: row; gap: 5px; min-height: 24px; }
.flight-telemetry .ui-icon { width: 13px; height: 13px; }
.pause-control:focus-visible { outline: 3px solid #e5fbff; outline-offset: 4px; }
''')
p=root/'.github/workflows/build.yml';s=p.read_text().replace("'scripts/verify-flight.cjs'","'scripts/*.cjs'")
s=s.replace('node scripts/verify-flight.cjs || { cat /tmp/flight-server.log; exit 1; }','node scripts/verify-flight.cjs || { cat /tmp/flight-server.log; exit 1; }\n          node scripts/verify-session.cjs || { cat /tmp/flight-server.log; exit 1; }');p.write_text(s)
p=root/'README.md';s=p.read_text().replace('## Flight controls — v4','## Flight controls — v4.1')
s=s.replace('Switching tabs or losing focus pauses the game and clears held actions.', 'Window-focus changes release held actions without opening a menu. Hidden tabs freeze simulation and the hunt clock, then continue on return. Only an explicit Pause tap, Escape, or a fresh Start press on a standard-mapped gamepad opens the pause menu. A manually paused game stays paused on tab return.')
s=s.replace('node scripts/verify-flight.cjs','node scripts/verify-flight.cjs\nnode scripts/verify-session.cjs')
s+='\n## Uninterrupted-flight regression coverage\n\nThe session suite covers visible blur while flying, delayed frames, hidden-tab clock suspension, simultaneous steering and flapping, accidental HUD focus, drag rejection on Pause, intentional pause/resume, and initially-held or reconnecting gamepads. Timing helpers cap catch-up work at eight physics steps per rendered frame. They never generate pause commands. Motion and timer advancement use the same bounded delta after a foreground stall. Active flight controls are icon-only and retain accessible labels; BRAKE uses a separate turning symbol, not the Pause icon.\n';p.write_text(s)
print('Applied flight 4.1 improvements')
