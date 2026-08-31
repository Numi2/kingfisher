"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import VirtualJoystick from "./VirtualJoystick";
import {
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_HABITAT,
  FISH_TYPES,
  HUNT_DURATION,
  MEDAL_TARGETS,
  KingfisherGameEngine,
} from "../lib/KingfisherGameEngine";

const EMPTY_HUD = {
  state: "menu",
  mode: "hunt",
  countdown: 0,
  timeRemaining: HUNT_DURATION,
  score: 0,
  catches: 0,
  misses: 0,
  collisions: 0,
  rescues: 0,
  combo: 0,
  bestCombo: 0,
  energy: 1,
  focus: 0,
  focusActive: false,
  focusTime: 0,
  timeBonus: 0,
  perfectDives: 0,
  rareCatches: 0,
  discoveredSpecies: 0,
  discovered: {},
  totalSpecies: Object.keys(FISH_TYPES).length,
  lifetimeCatches: 0,
  lastDiveGrade: "",
  air: 1,
  underwater: false,
  depth: 0,
  altitude: 5,
  speed: 0,
  holdingFish: null,
  holdingValue: 0,
  targetLabel: "SCAN THE WATER",
  targetKind: "none",
  targetDistance: 0,
  marker: null,
  offCourse: false,
  activeFish: 0,
  fishTotal: 64,
  bestScore: 0,
  speciesCaught: {},
  habitat: DEFAULT_HABITAT,
};

const CONTROL_PRESETS = {
  assisted: { sensitivity: 0.86, assist: 0.72, cameraDistance: 1.08 },
  natural: { sensitivity: 1, assist: 0.5, cameraDistance: 1 },
  direct: { sensitivity: 1.18, assist: 0.12, cameraDistance: 0.94 },
};

function formatScore(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString("en-US");
}

function formatClock(value) {
  if (!Number.isFinite(value)) return "00:00";
  const safe = Math.max(0, value);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe - minutes * 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function HoldButton({ className = "", label, sublabel, onHold, disabled = false }) {
  const pointer = useRef(null);
  const release = (event) => {
    if (pointer.current !== null && event?.pointerId !== undefined && pointer.current !== event.pointerId) return;
    pointer.current = null;
    onHold?.(false);
  };
  return (
    <button
      type="button"
      className={`hold-button ${className}`}
      disabled={disabled}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (disabled) return;
        event.preventDefault();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onHold?.(true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <strong>{label}</strong>
      {sublabel ? <span>{sublabel}</span> : null}
    </button>
  );
}

function RangeField({ label, value, min, max, step, unit = "", onChange, description = "" }) {
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    <label className="range-field">
      <div><span>{label}</span><strong>{Number(value).toFixed(decimals)}{unit}</strong></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      {description ? <small>{description}</small> : null}
    </label>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <label className="toggle-row">
      <span><strong>{label}</strong>{description ? <small>{description}</small> : null}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function ResultMetric({ label, value, className = "" }) {
  return <div className={className}><span>{label}</span><strong>{value}</strong></div>;
}

export default function KingfisherGame() {
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const toastTimer = useRef(null);
  const [ready, setReady] = useState(false);
  const [rendererError, setRendererError] = useState("");
  const [gameState, setGameState] = useState("menu");
  const [mode, setMode] = useState("hunt");
  const [hud, setHud] = useState(EMPTY_HUD);
  const [toast, setToast] = useState(null);
  const [finish, setFinish] = useState(null);
  const [menuView, setMenuView] = useState("home");
  const [habitat, setHabitat] = useState(DEFAULT_HABITAT);
  const [settings, setSettings] = useState(DEFAULT_CONTROL_SETTINGS);
  const [connected, setConnected] = useState(false);

  const habitatEstimate = useMemo(() => ({
    fishCount: Math.round(56 * habitat.fishDensity),
    current: habitat.riverCurrent < 0.75 ? "CALM" : habitat.riverCurrent < 1.25 ? "NATURAL" : "FAST",
    visibility: Math.round(habitat.waterClarity * 100),
    cruise: 9.6 * habitat.wingPower,
    dive: 22.8 * habitat.wingPower,
    biodiversity: habitat.biodiversity < 0.8 ? "LOW" : habitat.biodiversity < 1.2 ? "RICH" : "EXCEPTIONAL",
    wind: habitat.wind < 0.4 ? "STILL" : habitat.wind < 1.05 ? "BREEZY" : "GUSTY",
    weather: habitat.weather < 0.22 ? "CLEAR" : habitat.weather < 0.58 ? "MIXED" : "STORMY",
  }), [habitat]);

  const speciesList = useMemo(() => Object.values(FISH_TYPES).sort((a, b) => (b.rarity || 1) - (a.rarity || 1)), []);

  useEffect(() => {
    if (!mountRef.current) return undefined;
    let engine;
    let storedSettings = DEFAULT_CONTROL_SETTINGS;
    try {
      const parsed = JSON.parse(window.localStorage.getItem("aspen-kingfisher-controls-v2") || "null");
      if (parsed && typeof parsed === "object") storedSettings = { ...DEFAULT_CONTROL_SETTINGS, ...parsed };
    } catch {}
    setSettings(storedSettings);

    try {
      engine = new KingfisherGameEngine(mountRef.current, {
        onReady: () => setReady(true),
        onError: (error) => setRendererError(error?.message || String(error)),
        onHud: setHud,
        onState: ({ state, mode: nextMode }) => {
          setGameState(state);
          setMode(nextMode);
          if (state !== "finished") setFinish(null);
        },
        onEvent: (event) => {
          setToast(event);
          window.clearTimeout(toastTimer.current);
          const duration = event.type === "collision" || event.type === "rescue" ? 1450 : 1200;
          toastTimer.current = window.setTimeout(() => setToast(null), duration);
        },
        onFinish: setFinish,
      }, DEFAULT_HABITAT);
      engine.setControlSettings(storedSettings);
      engineRef.current = engine;
    } catch (error) {
      setRendererError(error?.message || String(error));
      return undefined;
    }

    let app;
    if (window.self !== window.top) {
      import("@modelcontextprotocol/ext-apps")
        .then(async ({ App }) => {
          app = new App({ name: "aspen-kingfisher-river-hunt", version: "1.0.0" }, {}, { autoResize: true });
          const applyLaunch = (args = {}) => {
            const nextHabitat = {
              ...engine.habitat,
              ...(Number.isFinite(args.fishDensity) ? { fishDensity: args.fishDensity } : {}),
              ...(Number.isFinite(args.riverCurrent) ? { riverCurrent: args.riverCurrent } : {}),
              ...(Number.isFinite(args.waterClarity) ? { waterClarity: args.waterClarity } : {}),
              ...(Number.isFinite(args.wingPower) ? { wingPower: args.wingPower } : {}),
              ...(Number.isFinite(args.biodiversity) ? { biodiversity: args.biodiversity } : {}),
              ...(Number.isFinite(args.wind) ? { wind: args.wind } : {}),
              ...(Number.isFinite(args.weather) ? { weather: args.weather } : {}),
            };
            const nextControls = {
              ...engine.controlSettings,
              ...(Number.isFinite(args.sensitivity) ? { sensitivity: args.sensitivity } : {}),
              ...(Number.isFinite(args.assist) ? { assist: args.assist } : {}),
              ...(typeof args.invertY === "boolean" ? { invertY: args.invertY } : {}),
              ...(typeof args.smartDive === "boolean" ? { smartDive: args.smartDive } : {}),
              ...(typeof args.reducedMotion === "boolean" ? { reducedMotion: args.reducedMotion } : {}),
            };
            engine.applyHabitat(nextHabitat);
            engine.setControlSettings(nextControls);
            setHabitat({ ...engine.habitat });
            setSettings({ ...engine.controlSettings });
            if (args.mode === "free") engine.startFreeFlight();
            else if (args.mode === "habitat") { engine.showMenu(); setMenuView("habitat"); }
            else if (args.mode === "controls") { engine.showMenu(); setMenuView("controls"); }
            else if (args.mode === "guide") { engine.showMenu(); setMenuView("guide"); }
            else engine.startHunt();
          };
          app.ontoolinput = (params) => applyLaunch(params.arguments || {});
          app.ontoolresult = (result) => applyLaunch(result.structuredContent?.launch || result.structuredContent?.habitat || {});
          app.onerror = (error) => console.warn("ChatGPT app bridge error", error);
          await app.connect();
          setConnected(true);
        })
        .catch((error) => console.warn("ChatGPT app bridge unavailable", error));
    }

    return () => {
      window.clearTimeout(toastTimer.current);
      app?.close?.();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setControlSettings(settings);
    try {
      window.localStorage.setItem("aspen-kingfisher-controls-v2", JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const startHunt = () => {
    setMenuView("home");
    setFinish(null);
    engineRef.current?.unlockAudio();
    engineRef.current?.startHunt();
  };

  const startFree = () => {
    setMenuView("home");
    setFinish(null);
    engineRef.current?.unlockAudio();
    engineRef.current?.startFreeFlight();
  };

  const goMenu = () => {
    setMenuView("home");
    setFinish(null);
    engineRef.current?.showMenu();
  };

  const applyHabitat = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.applyHabitat(habitat);
    setHabitat({ ...engine.habitat });
    setToast({ type: "bank", message: "RIVER HABITAT REBUILT" });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 950);
  };

  const applyPreset = (preset) => {
    setSettings((current) => ({ ...current, ...CONTROL_PRESETS[preset] }));
  };

  const marker = useMemo(() => {
    if (!hud.marker || !["playing", "countdown"].includes(gameState)) return null;
    let x = hud.marker.x;
    let y = -hud.marker.y;
    if (hud.marker.behind) {
      x = -x || 0.001;
      y = -y;
    }
    const angle = Math.atan2(y, x) * 180 / Math.PI;
    const inside = !hud.marker.behind && Math.abs(x) < 0.78 && Math.abs(y) < 0.66;
    const left = Math.max(9, Math.min(91, (x * 0.5 + 0.5) * 100));
    const top = Math.max(15, Math.min(82, (y * 0.5 + 0.5) * 100));
    return { left: `${left}%`, top: `${top}%`, angle, inside };
  }, [hud.marker, gameState]);

  const controlsVisible = ["playing", "countdown"].includes(gameState);
  const paused = gameState === "paused";
  const countdownText = hud.countdown > 0 ? String(Math.ceil(hud.countdown)) : "HUNT";
  const targetAction = hud.targetKind === "perch" ? "BANK THE CATCH" : hud.targetKind === "fish" ? hud.targetLocked ? "LOCKED · COMMITTING" : settings.smartDive ? "TAP DIVE TO STRIKE" : "HOLD DIVE TO STRIKE" : "SEARCH THE RIVER";

  return (
    <main className={`game-shell state-${gameState} ${hud.energy < 0.16 ? "low-energy" : ""} ${hud.underwater && hud.air < 0.28 ? "low-air" : ""} ${hud.focusActive ? "focus-active" : ""}`}>
      <div ref={mountRef} className="render-mount" />

      {!ready && !rendererError ? (
        <div className="loading-screen">
          <div className="loading-spinner" />
          <strong>AWAKENING THE RIVER</strong>
          <span>Building water, trout, wildlife, rocks, trees, and the kingfisher</span>
        </div>
      ) : null}
      {rendererError ? <div className="fatal-screen"><strong>3D RENDERER FAILED</strong><p>{rendererError}</p></div> : null}

      {controlsVisible ? (
        <>
          <header className="race-hud">
            <div className="hud-block catch-block">
              <span>{hud.holdingFish ? "IN THE BEAK" : "FISH CAUGHT"}</span>
              <strong>{hud.holdingFish ? hud.holdingFish : `${hud.catches}`}</strong>
            </div>
            <div className="hud-block timer-block">
              <span>{mode === "hunt" ? "HUNT TIME" : "FREE FLIGHT"}</span>
              <strong>{mode === "hunt" ? formatClock(hud.timeRemaining) : `${hud.speed.toFixed(1)} m/s`}</strong>
              <small>{formatScore(hud.score)} POINTS · BEST {formatScore(hud.bestScore)}</small>
            </div>
            <div className="hud-actions">
              <button type="button" className="rescue-button" aria-label="Return to nearest perch" onClick={() => engineRef.current?.rescue("RETURNED TO PERCH", 180)}>↶</button>
              <button type="button" className="pause-button" aria-label="Pause" onClick={() => engineRef.current?.setPaused(true)}>Ⅱ</button>
            </div>
          </header>

          <div className="resource-bars">
            <div className="resource-meter wing-meter" aria-label={`Wing energy ${Math.round(hud.energy * 100)} percent`}>
              <span>WINGS</span><div><i style={{ width: `${Math.max(0, hud.energy * 100)}%` }} /></div>
            </div>
            <div className={`resource-meter air-meter ${hud.underwater ? "visible" : ""}`} aria-label={`Air ${Math.round(hud.air * 100)} percent`}>
              <span>{hud.underwater ? "AIR" : "DEPTH"}</span><div><i style={{ width: `${Math.max(0, (hud.underwater ? hud.air : 1) * 100)}%` }} /></div>
            </div>
          </div>

          <div className={`focus-meter ${hud.focusActive ? "active" : ""}`} aria-label={`Kingfisher focus ${Math.round((hud.focusActive ? 1 : hud.focus) * 100)} percent`}>
            <span>{hud.focusActive ? `FOCUS ${hud.focusTime.toFixed(1)}s` : "KINGFISHER FOCUS"}</span>
            <div><i style={{ width: `${Math.max(0, (hud.focusActive ? 1 : hud.focus) * 100)}%` }} /></div>
          </div>

          <div className="status-rail">
            <span className="target-pill">{hud.targetLabel}</span>
            <span className={`combo-pill ${hud.combo > 1 ? "hot" : ""}`}>STREAK ×{hud.combo}</span>
            <span className="depth-pill">{hud.underwater ? `${hud.depth.toFixed(1)}m DEEP` : `${hud.altitude.toFixed(1)}m HIGH`}</span>
            {hud.timeBonus > 0 ? <span className="time-pill">+{hud.timeBonus.toFixed(1)}s HUNT TIME</span> : null}
          </div>

          {hud.holdingFish ? <div className="catch-banner"><strong>{hud.holdingFish}</strong><span>FLAP TO SURFACE · THEN FLY THROUGH A GOLD PERCH TO BANK IT</span></div> : null}
          {hud.offCourse ? <div className="off-course-warning">RETURN TO THE RIVER</div> : null}

          {marker ? (
            <div className={`target-marker ${marker.inside ? "inside" : "edge"} ${hud.targetKind} ${hud.targetLocked ? "locked" : ""}`} style={{ left: marker.left, top: marker.top }}>
              <i style={{ transform: `rotate(${marker.angle}deg)` }}>➤</i>
              <span>{Math.round(hud.targetDistance)}m · {targetAction}</span>
            </div>
          ) : null}

          <div className="mobile-flight-controls">
            <VirtualJoystick disabled={gameState === "countdown"} onChange={(x, y) => engineRef.current?.setSteering(x, y)} />
            <div className="power-controls">
              <HoldButton className="dive-button" label={hud.holdingFish ? "CARRY" : "DIVE"} sublabel={hud.holdingFish ? "FIND A PERCH" : settings.smartDive ? "TAP · LOCK · STRIKE" : "HOLD · LOCK · STRIKE"} disabled={gameState === "countdown" || Boolean(hud.holdingFish)} onHold={(value) => engineRef.current?.setDiving(value)} />
              <HoldButton className="flap-button" label="FLAP" sublabel={hud.underwater ? "SURFACE" : "BURST + CLIMB"} disabled={gameState === "countdown"} onHold={(value) => engineRef.current?.setFlapping(value)} />
            </div>
          </div>

          <div className="desktop-controls">
            FLY <b>W A S D</b> / ARROWS · DIVE <b>SHIFT</b> · FLAP <b>SPACE</b> · PERCH RESCUE <b>T</b> · RESTART <b>R</b>
          </div>
        </>
      ) : null}

      {gameState === "countdown" ? (
        <>
          <div className="countdown"><span key={countdownText}>{countdownText}</span></div>
          <div className="race-briefing">STEER ABOVE THE RIVER · TAP DIVE TO COMMIT · CATCH WITH THE BEAK · FLAP OUT · RETURN TO A GOLD PERCH</div>
        </>
      ) : null}

      {toast ? <div className={`game-toast ${toast.type}`}>{toast.message}</div> : null}

      {gameState === "menu" ? (
        <div className="menu-layer">
          {menuView === "home" ? (
            <section className="menu-card home-card">
              <div className="menu-kicker">ASPEN&apos;S WILDLIFE GAME</div>
              <h1>KINGFISHER<br /><em>RIVER HUNT</em></h1>
              <p>Live the hunt of a fast blue-and-gold kingfisher. Read a moving river, track schools beneath the surface, commit to high-speed dives, strike fish with the beak, burst back into the air, and return to a branch before choosing the next hunt.</p>
              <button className="primary-action" type="button" onClick={startHunt}>
                <span>BEGIN THE HUNT</span><i>120 SECONDS · LIVING RIVER · SMART DIVES</i>
              </button>
              <div className="menu-actions menu-actions-grid">
                <button type="button" onClick={startFree}>FREE FLIGHT</button>
                <button type="button" onClick={() => setMenuView("habitat")}>RIVER LAB</button>
                <button type="button" onClick={() => setMenuView("guide")}>FIELD GUIDE</button>
                <button type="button" onClick={() => setMenuView("controls")}>CONTROLS</button>
              </div>
              <div className="species-row">
                {speciesList.slice(0, 8).map((species) => <span key={species.id}>{species.label}</span>)}
              </div>
              <div className="medal-targets">
                <span><i>★</i> GOLD <strong>{formatScore(MEDAL_TARGETS.gold)}</strong></span>
                <span><i>★</i> SILVER <strong>{formatScore(MEDAL_TARGETS.silver)}</strong></span>
                <span><i>★</i> BRONZE <strong>{formatScore(MEDAL_TARGETS.bronze)}</strong></span>
              </div>
              <div className="menu-stats">
                <div><span>BEST SCORE</span><strong>{formatScore(hud.bestScore)}</strong></div>
                <div><span>RIVER FISH</span><strong>{hud.fishTotal || habitatEstimate.fishCount}</strong></div>
                <div><span>SPECIES FOUND</span><strong>{hud.discoveredSpecies}/{hud.totalSpecies}</strong></div>
                <div><span>LIFETIME CATCHES</span><strong>{hud.lifetimeCatches}</strong></div>
                <div><span>CONTROL</span><strong>STICK + DIVE + FLAP</strong></div>
              </div>
              {connected ? <div className="connected-badge">CONNECTED TO CHATGPT</div> : null}
            </section>
          ) : null}

          {menuView === "habitat" ? (
            <section className="menu-card lab-card habitat-card">
              <button type="button" className="back-button" onClick={() => setMenuView("home")}>← BACK</button>
              <div className="menu-kicker">RIVER LAB</div>
              <h2>SHAPE THE HABITAT</h2>
              <p>Rebuild the river as an ecosystem. Fish density and biodiversity change the species mix; current, clarity, wind, and weather change what the bird sees and how the hunt feels; wing power changes the kingfisher&apos;s speed envelope.</p>
              <div className="range-grid">
                <RangeField label="Fish population" value={habitat.fishDensity} min={0.55} max={1.7} step={0.01} description="Controls how many trout, char, perch, and minnows live in the river." onChange={(value) => setHabitat((old) => ({ ...old, fishDensity: value }))} />
                <RangeField label="River current" value={habitat.riverCurrent} min={0.45} max={1.85} step={0.01} description="Changes water motion and how quickly fish move through the river." onChange={(value) => setHabitat((old) => ({ ...old, riverCurrent: value }))} />
                <RangeField label="Water clarity" value={habitat.waterClarity} min={0.38} max={0.98} step={0.01} description="Higher clarity makes fish easier to see before and during the dive." onChange={(value) => setHabitat((old) => ({ ...old, waterClarity: value }))} />
                <RangeField label="Wing power" value={habitat.wingPower} min={0.75} max={1.35} step={0.01} description="Changes cruise speed, flap burst, and maximum dive speed." onChange={(value) => setHabitat((old) => ({ ...old, wingPower: value }))} />
                <RangeField label="Biodiversity" value={habitat.biodiversity} min={0.5} max={1.5} step={0.01} description="Controls how strongly rare trout, char, grayling, salmon parr, sculpin, and golden trout appear." onChange={(value) => setHabitat((old) => ({ ...old, biodiversity: value }))} />
                <RangeField label="Wind" value={habitat.wind} min={0} max={1.6} step={0.01} description="Adds crosswind and gusts to above-water flight." onChange={(value) => setHabitat((old) => ({ ...old, wind: value }))} />
                <RangeField label="Weather" value={habitat.weather} min={0} max={1} step={0.01} description="Changes cloud cover, sky light, mist, and water roughness." onChange={(value) => setHabitat((old) => ({ ...old, weather: value }))} />
              </div>
              <div className="robot-readout habitat-readout">
                <ResultMetric label="VISIBLE FISH" value={String(habitatEstimate.fishCount)} />
                <ResultMetric label="CURRENT" value={habitatEstimate.current} />
                <ResultMetric label="VISIBILITY" value={`${habitatEstimate.visibility}%`} />
                <ResultMetric label="CRUISE" value={`${habitatEstimate.cruise.toFixed(1)} m/s`} />
                <ResultMetric label="DIVE SPEED" value={`${habitatEstimate.dive.toFixed(1)} m/s`} />
                <ResultMetric label="BIODIVERSITY" value={habitatEstimate.biodiversity} />
                <ResultMetric label="WIND" value={habitatEstimate.wind} />
                <ResultMetric label="WEATHER" value={habitatEstimate.weather} />
                <ResultMetric label="RAINBOW TROUT" value="ABUNDANT" />
              </div>
              <button className="secondary-action" type="button" onClick={applyHabitat}>REBUILD RIVER</button>
              <button className="primary-action compact" type="button" onClick={() => { applyHabitat(); startHunt(); }}><span>HUNT THIS RIVER</span></button>
            </section>
          ) : null}

          {menuView === "guide" ? (
            <section className="menu-card guide-card">
              <button type="button" className="back-button" onClick={() => setMenuView("home")}>← BACK</button>
              <div className="menu-kicker">RIVER FIELD GUIDE</div>
              <h2>FISH OF THE HUNT</h2>
              <p>Every species has a different speed, depth range, rarity, and score value. Rainbow trout remain the main prey, while rare fish demand faster, cleaner dives.</p>
              <div className="guide-progress"><strong>{hud.discoveredSpecies}/{hud.totalSpecies}</strong><span>SPECIES DISCOVERED · {hud.lifetimeCatches} LIFETIME CATCHES</span></div>
              <div className="species-guide-grid">
                {speciesList.map((species) => {
                  const discovered = Boolean(hud.discovered?.[species.id]);
                  return (
                    <article key={species.id} className={`species-card ${discovered ? "discovered" : "unknown"} ${species.legendary ? "legendary" : ""}`}>
                      <div className="fish-swatch" style={{ background: `linear-gradient(135deg, #${species.body.toString(16).padStart(6, "0")}, #${species.stripe.toString(16).padStart(6, "0")})` }} />
                      <div>
                        <strong>{discovered ? species.label : "UNDISCOVERED FISH"}</strong>
                        <span>{species.legendary ? "LEGENDARY" : `RARITY ×${(species.rarity || 1).toFixed(1)}`} · {species.value.toLocaleString("en-US")} BASE</span>
                        <small>{discovered ? `${hud.discovered[species.id]} caught · depth ${species.depth[0].toFixed(1)}–${species.depth[1].toFixed(1)}m` : "Catch it to reveal the entry."}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {menuView === "controls" ? (
            <section className="menu-card controls-card">
              <button type="button" className="back-button" onClick={() => setMenuView("home")}>← BACK</button>
              <div className="menu-kicker">KINGFISHER CONTROLS</div>
              <h2>SET THE RESPONSE</h2>
              <p>Drag anywhere in the lower-left zone to steer. With Smart Dive on, tap Dive once to lock and commit to the selected fish. Press Flap at any time to break the dive, burst upward, or escape the water.</p>
              <div className="control-presets">
                <button type="button" onClick={() => applyPreset("assisted")}><strong>ASSISTED</strong><span>Strong fish lock</span></button>
                <button type="button" className="recommended" onClick={() => applyPreset("natural")}><strong>NATURAL</strong><span>Recommended</span></button>
                <button type="button" onClick={() => applyPreset("direct")}><strong>DIRECT</strong><span>Manual diving</span></button>
              </div>
              <div className="range-grid controls-ranges">
                <RangeField label="Steering sensitivity" value={settings.sensitivity} min={0.6} max={1.55} step={0.01} description="Higher values turn and pitch the bird faster." onChange={(value) => setSettings((old) => ({ ...old, sensitivity: value }))} />
                <RangeField label="Fish targeting assist" value={settings.assist} min={0} max={0.86} step={0.01} description="Guides the beak toward a selected fish while Dive is held." onChange={(value) => setSettings((old) => ({ ...old, assist: value }))} />
                <RangeField label="Camera distance" value={settings.cameraDistance} min={0.78} max={1.32} step={0.01} description="Changes how far the chase camera follows behind the bird." onChange={(value) => setSettings((old) => ({ ...old, cameraDistance: value }))} />
              </div>
              <div className="toggle-grid">
                <ToggleRow label="Invert climb" description="Pull down to climb." checked={settings.invertY} onChange={(value) => setSettings((old) => ({ ...old, invertY: value }))} />
                <ToggleRow label="Smart one-tap dive" description="Tap DIVE once and the bird commits to the selected fish until the strike or water exit." checked={settings.smartDive} onChange={(value) => setSettings((old) => ({ ...old, smartDive: value }))} />
                <ToggleRow label="Reduced camera motion" description="Removes impact camera shake while keeping the flight model intact." checked={settings.reducedMotion} onChange={(value) => setSettings((old) => ({ ...old, reducedMotion: value }))} />
                <ToggleRow label="Adaptive graphics" description="Adjusts render resolution to protect smooth flight on mobile." checked={settings.adaptiveQuality} onChange={(value) => setSettings((old) => ({ ...old, adaptiveQuality: value }))} />
                <ToggleRow label="River and wing sound" description="Wingbeats, dives, catches, water, and game cues." checked={settings.sound} onChange={(value) => setSettings((old) => ({ ...old, sound: value }))} />
                <ToggleRow label="Haptics" description="Vibration for water entry, catches, banking, and impacts." checked={settings.haptics} onChange={(value) => setSettings((old) => ({ ...old, haptics: value }))} />
              </div>
              <div className="control-map">
                <div><span>STICK</span><strong>TURN + CLIMB</strong></div>
                <div><span>DIVE</span><strong>LOCK + STRIKE</strong></div>
                <div><span>FLAP</span><strong>BURST + SURFACE</strong></div>
                <div><span>GOLD PERCH</span><strong>BANK THE FISH</strong></div>
              </div>
              <button className="primary-action compact" type="button" onClick={startHunt}><span>TEST CONTROLS IN HUNT</span></button>
            </section>
          ) : null}
        </div>
      ) : null}

      {paused ? (
        <div className="menu-layer pause-layer">
          <section className="menu-card pause-card">
            <div className="menu-kicker">THE RIVER IS PAUSED</div>
            <h2>{mode === "hunt" ? formatClock(hud.timeRemaining) : "FREE FLIGHT"}</h2>
            <button className="primary-action compact" type="button" onClick={() => engineRef.current?.setPaused(false)}><span>RESUME</span></button>
            <div className="pause-actions">
              <button type="button" onClick={() => { engineRef.current?.rescue("RETURNED TO PERCH", 180); engineRef.current?.setPaused(false); }}>RETURN TO PERCH</button>
              <button type="button" onClick={() => engineRef.current?.restartCurrentMode()}>RESTART</button>
              <button type="button" onClick={() => { engineRef.current?.showMenu(); setMenuView("controls"); }}>CONTROLS</button>
              <button type="button" onClick={goMenu}>MAIN MENU</button>
            </div>
          </section>
        </div>
      ) : null}

      {gameState === "finished" && finish ? (
        <div className="menu-layer finish-layer">
          <section className="menu-card finish-card">
            <div className="menu-kicker">THE HUNT IS COMPLETE</div>
            {finish.newBest ? <div className="new-best">NEW BEST SCORE</div> : null}
            <div className="finish-stars">{[1, 2, 3].map((star) => <span key={star} className={star <= finish.stars ? "earned" : ""}>★</span>)}</div>
            <div className={`medal-label medal-${finish.stars}`}>{finish.medal}</div>
            <h2>{formatScore(finish.score)}</h2>
            <div className="finish-score">RIVER POINTS</div>
            <div className="finish-breakdown">
              <ResultMetric label="FISH BANKED" value={String(finish.catches)} />
              <ResultMetric label="DIVE PRECISION" value={`${Math.round(finish.precision * 100)}%`} />
              <ResultMetric label="BEST STREAK" value={`×${finish.bestCombo}`} />
              <ResultMetric label="PERFECT DIVES" value={String(finish.perfectDives || 0)} />
              <ResultMetric label="RARE CATCHES" value={String(finish.rareCatches || 0)} />
              <ResultMetric label="TIME EARNED" value={`+${(finish.timeBonus || 0).toFixed(1)}s`} />
              <ResultMetric label="FIELD GUIDE" value={`${finish.discoveredSpecies || 0}/${finish.totalSpecies || Object.keys(FISH_TYPES).length}`} />
              <ResultMetric label="MISSES" value={String(finish.misses)} className={finish.misses ? "negative" : ""} />
              <ResultMetric label="COLLISIONS" value={String(finish.collisions)} className={finish.collisions ? "negative" : ""} />
              <ResultMetric label="BEST SCORE" value={formatScore(finish.bestScore)} />
            </div>
            <div className="species-tally">
              {finish.species.length ? finish.species.map((species) => <span key={species.name}><strong>{species.count}×</strong>{species.name}</span>) : <span><strong>0×</strong>NO FISH BANKED YET</span>}
            </div>
            <button className="primary-action compact" type="button" onClick={startHunt}><span>HUNT AGAIN</span></button>
            <div className="menu-actions">
              <button type="button" onClick={startFree}>FREE FLIGHT</button>
              <button type="button" onClick={goMenu}>MAIN MENU</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
