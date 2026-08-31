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
  targetLabel: "",
  targetKind: "none",
  targetDistance: 0,
  targetLocked: false,
  marker: null,
  offCourse: false,
  activeFish: 0,
  fishTotal: 64,
  bestScore: 0,
  speciesCaught: {},
  habitat: DEFAULT_HABITAT,
};

const CONTROL_PRESETS = {
  assisted: { sensitivity: 0.88, assist: 0.84, cameraDistance: 1.04 },
  natural: { sensitivity: 1, assist: 0.72, cameraDistance: 1 },
  direct: { sensitivity: 1.16, assist: 0.18, cameraDistance: 0.94 },
};

function Icon({ children, className = "", viewBox = "0 0 24 24" }) {
  return <svg className={`ui-icon ${className}`} viewBox={viewBox} aria-hidden="true">{children}</svg>;
}

function FishIcon({ className = "" }) {
  return <Icon className={className}><path d="M3 12c3.2-4.2 7.1-6 11.5-5.4 1.9.3 3.5 1 4.8 2.1L23 6v12l-3.7-2.7c-1.3 1.1-2.9 1.8-4.8 2.1C10.1 18 6.2 16.2 3 12Z"/><circle cx="14.7" cy="10" r="1" className="icon-cut"/><path d="M7 12c2.2-1.5 4.4-1.8 6.7-.9" className="icon-line"/></Icon>;
}

function WingIcon({ className = "" }) {
  return <Icon className={className}><path d="M3 15.4C7.1 6.8 13.3 4.1 21 5.1c-2.1 1.3-3.8 2.8-5.1 4.5 1.6-.4 3.2-.4 4.8 0-3.1 1.2-5.6 2.8-7.6 4.8 1.6-.1 3 .2 4.2.8-4.6 2.2-9.3 2.3-14.3.2Z"/><path d="M5.2 15.2c4-2.7 8.2-5.1 12.5-7.1" className="icon-line"/></Icon>;
}

function DiveIcon({ className = "" }) {
  return <Icon className={className}><path d="M11 2h2v12.2l4.3-4.3 1.4 1.4L12 18l-6.7-6.7 1.4-1.4 4.3 4.3V2Z"/><path d="M5 21h14" className="icon-line"/></Icon>;
}

function BranchIcon({ className = "" }) {
  return <Icon className={className}><path d="M3 17.5c5.8-.3 11.8-2.8 18-7.5l-1.1-1.6C13.9 12.9 8.2 15.2 3 15.5v2Z"/><path d="M10.6 14.4 8 8.7l1.8-.8 2.5 5.3M15.2 12 17 6l1.9.6-1.5 5" className="icon-line"/></Icon>;
}

function BoltIcon({ className = "" }) {
  return <Icon className={className}><path d="m13.6 1-8 12h5.2L9.7 23l8.7-13h-5.2L13.6 1Z"/></Icon>;
}

function DropIcon({ className = "" }) {
  return <Icon className={className}><path d="M12 2.2C9.4 6.1 5 10.6 5 15a7 7 0 0 0 14 0c0-4.4-4.4-8.9-7-12.8Z"/></Icon>;
}

function PlayIcon({ className = "" }) {
  return <Icon className={className}><path d="m7 4 13 8-13 8V4Z"/></Icon>;
}

function PauseIcon({ className = "" }) {
  return <Icon className={className}><path d="M7 4h4v16H7zM13 4h4v16h-4z"/></Icon>;
}

function ReturnIcon({ className = "" }) {
  return <Icon className={className}><path d="M7.5 7H20v11H8v-2h10V9H7.5l3.3 3.3-1.4 1.4L3.7 8l5.7-5.7 1.4 1.4L7.5 7Z"/></Icon>;
}

function SlidersIcon({ className = "" }) {
  return <Icon className={className}><path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h10M18 18h2" className="icon-line"/><circle cx="13" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="18" r="2"/></Icon>;
}

function GuideIcon({ className = "" }) {
  return <Icon className={className}><path d="M4 4.5c3.4-.7 6.1 0 8 2.1 1.9-2.1 4.6-2.8 8-2.1v14c-3.4-.7-6.1 0-8 2.1-1.9-2.1-4.6-2.8-8-2.1v-14Z"/><path d="M12 6.6v14" className="icon-line"/></Icon>;
}

function TrophyIcon({ className = "" }) {
  return <Icon className={className}><path d="M7 3h10v3h4v3c0 3-1.8 5-5.2 5.8A5 5 0 0 1 13 17.9V20h4v2H7v-2h4v-2.1a5 5 0 0 1-2.8-3.1C4.8 14 3 12 3 9V6h4V3Zm10 5v4.4c1.4-.6 2-1.7 2-3.4V8h-2ZM5 8v1c0 1.7.6 2.8 2 3.4V8H5Z"/></Icon>;
}

function HomeIcon({ className = "" }) {
  return <Icon className={className}><path d="m3 11 9-8 9 8v10h-6v-6H9v6H3V11Z"/></Icon>;
}

function RestartIcon({ className = "" }) {
  return <Icon className={className}><path d="M5.2 6.1A9 9 0 1 1 3 12h2a7 7 0 1 0 1.7-4.6L10 10.7H3V3.8l2.2 2.3Z"/></Icon>;
}

function RadialGauge({ value, children, className = "", size = 54 }) {
  const safe = Math.max(0, Math.min(1, Number(value) || 0));
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className={`radial-gauge ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="gauge-track" cx="24" cy="24" r={radius} />
        <circle className="gauge-progress" cx="24" cy="24" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - safe)} />
      </svg>
      <div className="gauge-content">{children}</div>
    </div>
  );
}

function HoldControl({ className = "", icon, onHold, disabled = false, active = false }) {
  const pointer = useRef(null);
  const [pressed, setPressed] = useState(false);
  const release = (event) => {
    if (pointer.current !== null && event?.pointerId !== undefined && pointer.current !== event.pointerId) return;
    pointer.current = null;
    setPressed(false);
    onHold?.(false);
  };
  return (
    <button
      type="button"
      className={`flight-control ${className} ${pressed ? "pressed" : ""} ${active ? "active" : ""}`}
      disabled={disabled}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (disabled) return;
        event.preventDefault();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setPressed(true);
        onHold?.(true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <span className="control-ripple" />
      {icon}
    </button>
  );
}

function RangeField({ label, value, min, max, step, onChange }) {
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    <label className="range-field">
      <div><span>{label}</span><strong>{Number(value).toFixed(decimals)}</strong></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label className="toggle-row">
      <strong>{label}</strong>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function formatScore(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString("en-US");
}

function fishColor(type) {
  return `linear-gradient(135deg, #${type.body.toString(16).padStart(6, "0")}, #${type.stripe.toString(16).padStart(6, "0")})`;
}

export default function KingfisherGame() {
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const pulseTimer = useRef(null);
  const previousScore = useRef(0);
  const [ready, setReady] = useState(false);
  const [rendererError, setRendererError] = useState("");
  const [gameState, setGameState] = useState("menu");
  const [mode, setMode] = useState("hunt");
  const [hud, setHud] = useState(EMPTY_HUD);
  const [pulse, setPulse] = useState(null);
  const [finish, setFinish] = useState(null);
  const [menuView, setMenuView] = useState("home");
  const [habitat, setHabitat] = useState(DEFAULT_HABITAT);
  const [settings, setSettings] = useState(DEFAULT_CONTROL_SETTINGS);
  const [connected, setConnected] = useState(false);

  const speciesList = useMemo(() => Object.values(FISH_TYPES).sort((a, b) => (b.rarity || 1) - (a.rarity || 1)), []);

  const emitPulse = (type, points = 0) => {
    window.clearTimeout(pulseTimer.current);
    setPulse({ type, points, id: performance.now() });
    pulseTimer.current = window.setTimeout(() => setPulse(null), type === "catch" || type === "bank" ? 950 : 520);
  };

  useEffect(() => {
    if (!mountRef.current) return undefined;
    let engine;
    let storedSettings = DEFAULT_CONTROL_SETTINGS;
    try {
      const parsed = JSON.parse(window.localStorage.getItem("aspen-kingfisher-controls-v3") || window.localStorage.getItem("aspen-kingfisher-controls-v2") || "null");
      if (parsed && typeof parsed === "object") storedSettings = { ...DEFAULT_CONTROL_SETTINGS, ...parsed };
    } catch {}
    setSettings(storedSettings);

    try {
      engine = new KingfisherGameEngine(mountRef.current, {
        onReady: () => setReady(true),
        onError: (error) => setRendererError(error?.message || String(error)),
        onHud: (nextHud) => {
          const delta = Math.max(0, (nextHud.score || 0) - previousScore.current);
          previousScore.current = nextHud.score || 0;
          setHud(nextHud);
          if (delta > 0) emitPulse(nextHud.holdingFish ? "catch" : "bank", delta);
        },
        onState: ({ state, mode: nextMode }) => {
          setGameState(state);
          setMode(nextMode);
          if (state !== "finished") setFinish(null);
        },
        onEvent: (event) => {
          if (["water", "lock", "focus", "miss", "collision", "rescue"].includes(event.type)) emitPulse(event.type, 0);
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
          app = new App({ name: "aspen-kingfisher-river-hunt", version: "2.0.0" }, {}, { autoResize: true });
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
          app.ontoolresult = (result) => applyLaunch(result.structuredContent?.launch || {});
          await app.connect();
          setConnected(true);
        })
        .catch(() => {});
    }

    return () => {
      window.clearTimeout(pulseTimer.current);
      app?.close?.();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setControlSettings(settings);
    try { window.localStorage.setItem("aspen-kingfisher-controls-v3", JSON.stringify(settings)); } catch {}
  }, [settings]);

  const startHunt = () => {
    previousScore.current = 0;
    setMenuView("home");
    setFinish(null);
    engineRef.current?.unlockAudio();
    engineRef.current?.startHunt();
  };

  const startFree = () => {
    previousScore.current = 0;
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
    emitPulse("focus", 0);
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
    const inside = !hud.marker.behind && Math.abs(x) < 0.8 && Math.abs(y) < 0.7;
    return {
      left: `${Math.max(7, Math.min(93, (x * 0.5 + 0.5) * 100))}%`,
      top: `${Math.max(12, Math.min(86, (y * 0.5 + 0.5) * 100))}%`,
      angle,
      inside,
      proximity: Math.max(0, Math.min(1, 1 - (hud.targetDistance || 0) / 52)),
    };
  }, [hud.marker, hud.targetDistance, gameState]);

  const controlsVisible = ["playing", "countdown"].includes(gameState);
  const paused = gameState === "paused";
  const timerProgress = mode === "hunt" ? Math.max(0, Math.min(1, hud.timeRemaining / HUNT_DURATION)) : 1;
  const fast = hud.speed > 17;
  const veryFast = hud.speed > 23;
  const eventClass = pulse ? `pulse-${pulse.type}` : "";

  return (
    <main className={`game-shell state-${gameState} ${hud.underwater ? "is-underwater" : ""} ${hud.targetLocked ? "has-lock" : ""} ${hud.holdingFish ? "has-catch" : ""} ${fast ? "is-fast" : ""} ${veryFast ? "is-very-fast" : ""} ${hud.focusActive ? "is-focus" : ""} ${eventClass}`}>
      <div ref={mountRef} className="render-mount" />
      <div className="cinematic-vignette" />
      <div className="speed-field"><i/><i/><i/><i/><i/><i/><i/><i/></div>
      <div className="water-lens" />
      <div className="screen-flash" />

      {!ready && !rendererError ? (
        <div className="loading-screen"><div className="loading-spinner"/><FishIcon/><strong>KINGFISHER</strong></div>
      ) : null}
      {rendererError ? <div className="fatal-screen"><strong>3D</strong><p>{rendererError}</p></div> : null}

      {controlsVisible ? (
        <>
          <div className="minimal-hud">
            <div className="score-orb"><FishIcon/><strong>{formatScore(hud.score)}</strong></div>
            <RadialGauge value={timerProgress} className="time-orb" size={64}>
              {mode === "hunt" ? <strong>{Math.max(0, Math.ceil(hud.timeRemaining))}</strong> : <span className="infinity">∞</span>}
            </RadialGauge>
            <div className={`combo-orb ${hud.combo > 1 ? "charged" : ""}`}><BoltIcon/><strong>{Math.max(1, hud.combo || 1)}</strong></div>
            <div className="hud-tools">
              <button type="button" onClick={() => engineRef.current?.rescue("", 80)} aria-label="Return"><ReturnIcon/></button>
              <button type="button" onClick={() => engineRef.current?.setPaused(true)} aria-label="Pause"><PauseIcon/></button>
            </div>
          </div>

          <div className="resource-stack">
            <RadialGauge value={hud.energy} className={`energy-orb ${hud.energy < 0.2 ? "critical" : ""}`} size={48}><WingIcon/></RadialGauge>
            {hud.underwater ? <RadialGauge value={hud.air} className={`air-orb ${hud.air < 0.25 ? "critical" : ""}`} size={48}><DropIcon/></RadialGauge> : null}
          </div>

          {marker ? (
            <div
              className={`visual-reticle ${marker.inside ? "inside" : "edge"} ${hud.targetKind} ${hud.targetLocked ? "locked" : ""} ${hud.targetDistance < 9 ? "strike" : ""}`}
              style={{ left: marker.left, top: marker.top, "--reticle-angle": `${marker.angle}deg`, "--proximity": marker.proximity }}
            >
              <span className="reticle-outer"/><span className="reticle-inner"/><span className="reticle-dot"/><i/>
            </div>
          ) : null}

          {hud.offCourse ? <><div className="edge-warning left"/><div className="edge-warning right"/></> : null}

          {hud.holdingFish ? (
            <div className="carry-chain"><FishIcon/><span/><BranchIcon/></div>
          ) : null}

          {pulse ? (
            <div key={pulse.id} className={`impact-pulse ${pulse.type}`}>
              <div className="impact-symbol">
                {pulse.type === "catch" ? <FishIcon/> : pulse.type === "bank" ? <BranchIcon/> : pulse.type === "lock" ? <DiveIcon/> : pulse.type === "water" ? <DropIcon/> : pulse.type === "focus" ? <BoltIcon/> : pulse.type === "miss" ? <span>×</span> : <span>!</span>}
              </div>
              {pulse.points > 0 ? <strong>+{formatScore(pulse.points)}</strong> : null}
            </div>
          ) : null}

          <div className="flight-controls">
            <VirtualJoystick disabled={gameState === "countdown"} onChange={(x, y) => engineRef.current?.setSteering(x, y)}/>
            <div className="action-controls">
              <HoldControl
                className="dive-control"
                icon={<DiveIcon/>}
                active={hud.targetLocked}
                disabled={gameState === "countdown" || Boolean(hud.holdingFish)}
                onHold={(value) => engineRef.current?.setDiving(value)}
              />
              <HoldControl
                className="flap-control"
                icon={<WingIcon/>}
                active={hud.underwater || Boolean(hud.holdingFish)}
                disabled={gameState === "countdown"}
                onHold={(value) => engineRef.current?.setFlapping(value)}
              />
            </div>
          </div>
        </>
      ) : null}

      {gameState === "countdown" ? (
        <div className="countdown-orb"><span>{Math.max(1, Math.ceil(hud.countdown))}</span></div>
      ) : null}

      {gameState === "menu" ? (
        <div className="menu-layer">
          {menuView === "home" ? (
            <section className="menu-card home-card">
              <div className="brand-bird"><FishIcon/><WingIcon/></div>
              <div className="menu-kicker">ASPEN</div>
              <h1>KINGFISHER</h1>
              <div className="primary-menu-actions">
                <button className="hero-play" type="button" onClick={startHunt}><PlayIcon/><span>HUNT</span></button>
                <button type="button" onClick={startFree}><WingIcon/><span>FLY</span></button>
              </div>
              <div className="icon-menu-grid">
                <button type="button" onClick={() => setMenuView("habitat")}><DropIcon/><span>RIVER</span></button>
                <button type="button" onClick={() => setMenuView("guide")}><GuideIcon/><span>FISH</span></button>
                <button type="button" onClick={() => setMenuView("controls")}><SlidersIcon/><span>CONTROL</span></button>
              </div>
              <div className="visual-tutorial"><VirtualJoystick disabled/><i/><DiveIcon/><i/><FishIcon/><i/><WingIcon/><i/><BranchIcon/></div>
              <div className="menu-scoreline"><TrophyIcon/><strong>{formatScore(hud.bestScore)}</strong><span>{hud.discoveredSpecies}/{hud.totalSpecies}</span>{connected ? <i/> : null}</div>
            </section>
          ) : null}

          {menuView === "habitat" ? (
            <section className="menu-card settings-card">
              <button className="back-button" type="button" onClick={() => setMenuView("home")}><HomeIcon/></button>
              <div className="menu-kicker">RIVER</div><h2>DYNAMIC HABITAT</h2>
              <div className="range-grid">
                <RangeField label="Fish" value={habitat.fishDensity} min={0.55} max={1.7} step={0.01} onChange={(value) => setHabitat((old) => ({ ...old, fishDensity: value }))}/>
                <RangeField label="Current" value={habitat.riverCurrent} min={0.45} max={1.85} step={0.01} onChange={(value) => setHabitat((old) => ({ ...old, riverCurrent: value }))}/>
                <RangeField label="Clarity" value={habitat.waterClarity} min={0.38} max={0.98} step={0.01} onChange={(value) => setHabitat((old) => ({ ...old, waterClarity: value }))}/>
                <RangeField label="Power" value={habitat.wingPower} min={0.75} max={1.35} step={0.01} onChange={(value) => setHabitat((old) => ({ ...old, wingPower: value }))}/>
                <RangeField label="Diversity" value={habitat.biodiversity} min={0.5} max={1.5} step={0.01} onChange={(value) => setHabitat((old) => ({ ...old, biodiversity: value }))}/>
                <RangeField label="Wind" value={habitat.wind} min={0} max={1.6} step={0.01} onChange={(value) => setHabitat((old) => ({ ...old, wind: value }))}/>
                <RangeField label="Weather" value={habitat.weather} min={0} max={1} step={0.01} onChange={(value) => setHabitat((old) => ({ ...old, weather: value }))}/>
              </div>
              <button className="wide-action" type="button" onClick={() => { applyHabitat(); startHunt(); }}><PlayIcon/><span>HUNT</span></button>
            </section>
          ) : null}

          {menuView === "controls" ? (
            <section className="menu-card settings-card">
              <button className="back-button" type="button" onClick={() => setMenuView("home")}><HomeIcon/></button>
              <div className="menu-kicker">FLIGHT</div><h2>CONTROL</h2>
              <div className="preset-grid">
                <button type="button" onClick={() => setSettings((old) => ({ ...old, ...CONTROL_PRESETS.assisted }))}>EASY</button>
                <button type="button" className="selected" onClick={() => setSettings((old) => ({ ...old, ...CONTROL_PRESETS.natural }))}>FLOW</button>
                <button type="button" onClick={() => setSettings((old) => ({ ...old, ...CONTROL_PRESETS.direct }))}>RAW</button>
              </div>
              <div className="range-grid">
                <RangeField label="Steering" value={settings.sensitivity} min={0.6} max={1.55} step={0.01} onChange={(value) => setSettings((old) => ({ ...old, sensitivity: value }))}/>
                <RangeField label="Aim" value={settings.assist} min={0} max={0.9} step={0.01} onChange={(value) => setSettings((old) => ({ ...old, assist: value }))}/>
                <RangeField label="Camera" value={settings.cameraDistance} min={0.78} max={1.32} step={0.01} onChange={(value) => setSettings((old) => ({ ...old, cameraDistance: value }))}/>
              </div>
              <div className="toggle-grid">
                <ToggleRow label="Invert" checked={settings.invertY} onChange={(value) => setSettings((old) => ({ ...old, invertY: value }))}/>
                <ToggleRow label="One-tap dive" checked={settings.smartDive} onChange={(value) => setSettings((old) => ({ ...old, smartDive: value }))}/>
                <ToggleRow label="Low motion" checked={settings.reducedMotion} onChange={(value) => setSettings((old) => ({ ...old, reducedMotion: value }))}/>
                <ToggleRow label="Adaptive" checked={settings.adaptiveQuality} onChange={(value) => setSettings((old) => ({ ...old, adaptiveQuality: value }))}/>
                <ToggleRow label="Sound" checked={settings.sound} onChange={(value) => setSettings((old) => ({ ...old, sound: value }))}/>
                <ToggleRow label="Haptics" checked={settings.haptics} onChange={(value) => setSettings((old) => ({ ...old, haptics: value }))}/>
              </div>
              <button className="wide-action" type="button" onClick={startHunt}><PlayIcon/><span>PLAY</span></button>
            </section>
          ) : null}

          {menuView === "guide" ? (
            <section className="menu-card guide-card">
              <button className="back-button" type="button" onClick={() => setMenuView("home")}><HomeIcon/></button>
              <div className="menu-kicker">RIVER</div><h2>SPECIES</h2>
              <div className="guide-grid">
                {speciesList.map((species) => {
                  const found = Boolean(hud.discovered?.[species.id]);
                  return <article key={species.id} className={`${found ? "found" : "hidden"} ${species.legendary ? "legendary" : ""}`}><i style={{ background: fishColor(species) }}/><strong>{found ? species.label : "?"}</strong><span>{found ? hud.discovered[species.id] : ""}</span></article>;
                })}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {paused ? (
        <div className="menu-layer pause-layer"><section className="pause-card">
          <RadialGauge value={timerProgress} size={96}><strong>{mode === "hunt" ? Math.ceil(hud.timeRemaining) : "∞"}</strong></RadialGauge>
          <div className="pause-grid">
            <button className="resume" type="button" onClick={() => engineRef.current?.setPaused(false)}><PlayIcon/></button>
            <button type="button" onClick={() => engineRef.current?.restartCurrentMode()}><RestartIcon/></button>
            <button type="button" onClick={goMenu}><HomeIcon/></button>
          </div>
        </section></div>
      ) : null}

      {gameState === "finished" && finish ? (
        <div className="menu-layer finish-layer"><section className="menu-card finish-card">
          <div className="finish-trophy"><TrophyIcon/></div>
          <div className="finish-stars">{[1,2,3].map((star) => <span key={star} className={star <= finish.stars ? "earned" : ""}>★</span>)}</div>
          <h2>{formatScore(finish.score)}</h2>
          <div className="finish-metrics">
            <div><FishIcon/><strong>{finish.catches}</strong></div>
            <div><BoltIcon/><strong>{finish.bestCombo}</strong></div>
            <div><DiveIcon/><strong>{finish.perfectDives || 0}</strong></div>
            <div><GuideIcon/><strong>{finish.discoveredSpecies || 0}/{finish.totalSpecies || Object.keys(FISH_TYPES).length}</strong></div>
          </div>
          <button className="wide-action" type="button" onClick={startHunt}><RestartIcon/><span>AGAIN</span></button>
          <button className="quiet-action" type="button" onClick={goMenu}><HomeIcon/></button>
        </section></div>
      ) : null}
    </main>
  );
}
