from pathlib import Path
import json

# One-time integration; the verified workflow commits the resulting source files.
def once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError(f'Expected exactly one integration anchor: {old[:100]!r}; got {text.count(old)}')
    return text.replace(old, new, 1)

engine_path = Path('app/lib/KingfisherGameEngine.js')
e = engine_path.read_text()
e = once(e, '  _catchFish(fish, distance, elapsed) {', '  _catchFish(fish, distance, elapsed) {\n    const underwater = this.bird.position.y < WATER_Y - 0.06;')
e = once(e, '      holdingFish: this.holdingFish, holdingValue: this.holdingValue,', '''      holdingFish: this.holdingFish, holdingValue: this.holdingValue,
      flightAction: this.flightAction || "GLIDE", braking: this._activeInput?.brake || false,
      diving: this._activeInput?.dive || false, flapping: this._activeInput?.flap || false,
      boostActive: this.boostTimer > 0, boostCooldown: this.boostCooldown || 0,''')
e = once(e, '      const y = this.waterBase[index + 1];', '      const y = this.waterBase[index + 1] - this.water.position.z;')
engine_path.write_text(e)

p = Path('app/components/KingfisherGame.jsx')
s = p.read_text()
s = once(s, 'import VirtualJoystick from "./VirtualJoystick";', 'import VirtualJoystick from "./VirtualJoystick";\nimport FlightAction from "./FlightAction";')
s = once(s, '} from "../lib/KingfisherGameEngine";', '} from "../lib/AgileKingfisherEngine";')
a = s.index('function HoldControl('); b = s.index('function RangeField(', a)
s = s[:a] + s[b:]
s = s.replace('window.localStorage.getItem("aspen-kingfisher-controls-v3")', 'window.localStorage.getItem("aspen-kingfisher-controls-v4") || window.localStorage.getItem("aspen-kingfisher-controls-v3")')
s = s.replace('window.localStorage.setItem("aspen-kingfisher-controls-v3",', 'window.localStorage.setItem("aspen-kingfisher-controls-v4",')
s = s.replace('["water", "lock", "focus", "miss", "collision", "rescue"]', '["water", "lock", "focus", "boost", "miss", "collision", "rescue"]')
a = s.index('            <div className="action-controls">')
b = s.index('            </div>\n          </div>\n        </>', a) + len('            </div>')
s = s[:a] + '''            <div className="action-controls">
              <FlightAction className="brake-control" label="BRAKE" shortcut="X" icon={<PauseIcon/>}
                hint="Hold to slow down; steer while braking for a sharp turn." active={hud.braking}
                disabled={gameState === "countdown"} onHold={(v) => engineRef.current?.setBraking(v)}/>
              <FlightAction className="burst-control" label="BURST" shortcut="E" icon={<BoltIcon/>}
                hint="Tap for a short acceleration burst. Double-tap FLAP also works." active={hud.boostActive}
                cooldown={(hud.boostCooldown || 0) / 1.3} disabled={gameState === "countdown"}
                onHold={(v) => engineRef.current?.setBurst(v)}/>
              <FlightAction className="dive-control" label="DIVE" shortcut="SHIFT" icon={<DiveIcon/>}
                hint="Tap to dive at the selected fish. Tap again or FLAP to cancel." active={hud.diving}
                disabled={gameState === "countdown" || Boolean(hud.holdingFish)} onHold={(v) => engineRef.current?.setDiving(v)}/>
              <FlightAction className="flap-control" label="FLAP" shortcut="SPACE" icon={<WingIcon/>}
                hint="Tap for a wingbeat; hold to accelerate. Underwater, flap to surface." active={hud.flapping}
                disabled={gameState === "countdown"} onHold={(v) => engineRef.current?.setFlapping(v)}/>
            </div>''' + s[b:]
s = once(s, '          <div className="flight-controls">', '''          <div className="flight-telemetry" aria-live="off"><strong>{hud.flightAction || "GLIDE"}</strong><span>{Math.round(hud.speed || 0)} m/s{hud.holdingFish ? ` · PERCH ${Math.round(hud.targetDistance || 0)} m` : ""}</span></div>
          <div className="flight-controls">''')
s = once(s, '              <h1>KINGFISHER</h1>', '''              <h1>KINGFISHER</h1>
              <p className="flight-help">Steer to turn and climb. DIVE to strike. FLAP to recover.<br/>Hold BRAKE for tight turns. Tap BURST to accelerate.</p>''')
a = s.index('              <div className="preset-grid">'); b = s.index('              </div>', a)+len('              </div>')
s = s[:a] + '''              <div className="preset-grid">
                {[["assisted","EASY"],["natural","FLOW"],["direct","RAW"]].map(([id,label]) => {
                  const selected = Object.entries(CONTROL_PRESETS[id]).every(([key,value]) => Math.abs(settings[key]-value) < 0.005);
                  return <button key={id} type="button" className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => setSettings(old => ({...old,...CONTROL_PRESETS[id]}))}>{label}</button>;
                })}
              </div>''' + s[b:]
p.write_text(s)

p = Path('app/globals.css')
p.write_text(p.read_text() + '''
/* Flight v4: readable actions, unobstructed playfield and thumb-sized hit targets. */
.flight-controls .action-controls { position: absolute; right: max(16px, env(safe-area-inset-right)); bottom: max(18px, env(safe-area-inset-bottom)); display: grid; grid-template-columns: 76px 86px; grid-template-areas: "brake burst" "dive flap"; gap: 10px; width: auto; height: auto; transform: none; pointer-events: auto; }
.flight-controls .flight-control { position: relative; inset: auto; margin: 0; width: 100%; height: 78px; border-radius: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.flight-controls .brake-control { grid-area: brake; height: 62px; background: rgba(12,35,43,.8); }
.flight-controls .burst-control { grid-area: burst; height: 62px; background: rgba(76,58,23,.82); border-color: rgba(255,213,128,.65); }
.flight-controls .dive-control { grid-area: dive; }
.flight-controls .flap-control { grid-area: flap; }
.flight-controls .flight-control .ui-icon { width: 26px; height: 26px; flex: 0 0 26px; }
.flight-controls .flight-control .action-label { position: relative; z-index: 2; font-size: 10px; font-weight: 800; letter-spacing: .08em; line-height: 1; color: #f1fbff; }
.flight-controls .flight-control kbd { position: relative; z-index: 2; font: 8px/1.2 inherit; opacity: .65; }
.flight-controls .flight-control:focus-visible { outline: 3px solid #fff2c7; outline-offset: 4px; }
.flight-controls .flight-control.pressed { transform: scale(.95); filter: brightness(1.22); }
.flight-controls .action-cooldown { position: absolute; bottom: 0; left: 0; width: 100%; height: 4px; background: #ffe2a0; transform: scaleX(var(--action-cooldown,0)); transform-origin: left; pointer-events: none; }
.flight-controls .joystick-zone { position: absolute; left: 0; bottom: 0; width: calc(100% - 196px); max-width: 52vw; height: min(240px,55vh); touch-action: none; pointer-events: auto; }
.joystick-zone.active .joystick-base, .joystick-zone.active .joystick-knob { transition: none !important; }
.flight-telemetry { position: absolute; left: 50%; bottom: calc(max(18px,env(safe-area-inset-bottom)) + 170px); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 12px; border-radius: 18px; background: rgba(5,25,33,.5); color: #f0fcff; pointer-events: none; white-space: nowrap; font-size: 10px; }
.flight-telemetry strong { font-size: 11px; letter-spacing: .13em; }
.flight-telemetry span { opacity: .78; font-variant-numeric: tabular-nums; }
.flight-help { max-width: 390px; margin: 10px auto 18px; font-size: 11px; line-height: 1.65; color: #b6d5dc; }
@media (pointer: coarse) { .flight-controls .flight-control kbd { display: none; } }
@media (max-height: 480px) { .flight-controls .action-controls { grid-template-columns: 68px 78px; gap: 8px; bottom: max(10px,env(safe-area-inset-bottom)); } .flight-controls .flight-control { height: 65px; } .flight-controls .brake-control, .flight-controls .burst-control { height: 52px; } .flight-telemetry { bottom: 18px; } .flight-help { margin: 5px auto 9px; font-size: 10px; } }
''')

p = Path('package.json'); package = json.loads(p.read_text()); package['version'] = '4.0.0'
package.setdefault('scripts',{})['test:flight'] = 'node --test tests/flight-motion.test.mjs'
p.write_text(json.dumps(package,indent=2)+'\n')
p = Path('app/api/health/route.js'); p.write_text(p.read_text().replace('3.0.0','4.0.0'))
print('Integrated flight v4 source and catch exception fix')
