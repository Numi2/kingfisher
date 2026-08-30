import * as THREE from "three";

export const HUNT_DURATION = 120;

export const MEDAL_TARGETS = {
  bronze: 3200,
  silver: 7200,
  gold: 12500,
};

export const DEFAULT_CONTROL_SETTINGS = {
  sensitivity: 1,
  assist: 0.5,
  cameraDistance: 1,
  invertY: false,
  smartDive: true,
  reducedMotion: false,
  adaptiveQuality: true,
  sound: true,
  haptics: true,
};

export const DEFAULT_HABITAT = {
  fishDensity: 1,
  riverCurrent: 1,
  waterClarity: 0.82,
  wingPower: 1,
  biodiversity: 1,
  wind: 0.38,
  weather: 0.2,
};

export const FISH_TYPES = {
  rainbow: { id: "rainbow", label: "RAINBOW TROUT", value: 620, rarity: 1, depth: [0.7, 2.7], body: 0x8aa3a7, stripe: 0xe05a73 },
  brown: { id: "brown", label: "BROWN TROUT", value: 760, rarity: 1.35, depth: [1.0, 3.4], body: 0x9b7a52, stripe: 0x3b2d22 },
  brook: { id: "brook", label: "BROOK TROUT", value: 880, rarity: 1.65, depth: [0.7, 2.8], body: 0x5f7563, stripe: 0xe49c53 },
  char: { id: "char", label: "ARCTIC CHAR", value: 1040, rarity: 2.1, depth: [1.2, 3.7], body: 0x657d8c, stripe: 0xe86d52 },
  cutthroat: { id: "cutthroat", label: "CUTTHROAT TROUT", value: 1120, rarity: 2.35, depth: [0.8, 3.1], body: 0x8c9a7c, stripe: 0xd45c43 },
  grayling: { id: "grayling", label: "ARCTIC GRAYLING", value: 1260, rarity: 2.8, depth: [0.9, 3.0], body: 0x8198aa, stripe: 0x7a5cae },
  salmon: { id: "salmon", label: "SALMON PARR", value: 980, rarity: 2.15, depth: [0.6, 2.8], body: 0x8e9b83, stripe: 0x414841 },
  perch: { id: "perch", label: "RIVER PERCH", value: 520, rarity: 1.2, depth: [0.9, 3.6], body: 0x8ca64e, stripe: 0x233b29 },
  dace: { id: "dace", label: "RIVER DACE", value: 420, rarity: 1.1, depth: [0.5, 2.4], body: 0xa8b9bd, stripe: 0x73888e },
  minnow: { id: "minnow", label: "SILVER MINNOW", value: 360, rarity: 1, depth: [0.4, 2.2], body: 0xb8c8cc, stripe: 0x6c8189 },
  sculpin: { id: "sculpin", label: "RIVER SCULPIN", value: 1380, rarity: 3.2, depth: [2.3, 4.0], body: 0x6f6759, stripe: 0x342f2a },
  golden: { id: "golden", label: "GOLDEN TROUT", value: 3200, rarity: 8, depth: [1.1, 3.5], body: 0xf2c94c, stripe: 0xf07d32, legendary: true },
};

const WORLD_HALF_LENGTH = 190;
const RIVER_HALF_WIDTH = 8.2;
const WATER_Y = 0;
const RIVERBED_Y = -4.4;
const HUD_INTERVAL = 0.09;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => min + Math.random() * (max - min);

function safeReadJSON(key, fallback) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function weightedFishType(biodiversity) {
  const entries = Object.values(FISH_TYPES);
  const weights = entries.map((type) => {
    const rareBoost = Math.pow(clamp(biodiversity, 0.5, 1.5), Math.max(0, type.rarity - 1));
    return (1 / Math.pow(type.rarity, 1.28)) * rareBoost;
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  let pick = Math.random() * total;
  for (let index = 0; index < entries.length; index += 1) {
    pick -= weights[index];
    if (pick <= 0) return entries[index];
  }
  return entries[0];
}

function makeBird() {
  const group = new THREE.Group();
  group.name = "kingfisher";

  const blue = new THREE.MeshStandardMaterial({ color: 0x1788b8, roughness: 0.48, metalness: 0.08 });
  const deepBlue = new THREE.MeshStandardMaterial({ color: 0x0b5f8f, roughness: 0.45 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe3a63b, roughness: 0.56 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf3f3ed, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x211b18, roughness: 0.72 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12), blue);
  body.scale.set(0.82, 0.8, 1.45);
  body.position.z = 0.15;
  group.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), gold);
  belly.scale.set(0.68, 0.7, 1.1);
  belly.position.set(0, -0.27, 0.22);
  group.add(belly);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 18, 12), deepBlue);
  head.position.set(0, 0.18, -0.8);
  group.add(head);

  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), white);
  throat.scale.set(0.8, 0.7, 0.7);
  throat.position.set(0, -0.08, -1.02);
  group.add(throat);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.35, 10), dark);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.08, -1.6);
  group.add(beak);

  const wingGeometry = new THREE.BoxGeometry(1.5, 0.08, 0.72);
  const leftWing = new THREE.Mesh(wingGeometry, blue);
  leftWing.position.set(-0.83, 0.1, 0.12);
  leftWing.rotation.z = 0.12;
  group.add(leftWing);
  const rightWing = leftWing.clone();
  rightWing.position.x = 0.83;
  rightWing.rotation.z = -0.12;
  group.add(rightWing);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.2, 5), deepBlue);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0.05, 1.35);
  group.add(tail);

  group.userData.leftWing = leftWing;
  group.userData.rightWing = rightWing;
  group.rotation.order = "YXZ";
  return group;
}

function makeFish(type) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: type.body, roughness: 0.48, metalness: 0.06 });
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: type.stripe, roughness: 0.52 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), bodyMaterial);
  body.scale.set(0.72, 0.58, 1.55);
  group.add(body);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.75), stripeMaterial);
  stripe.position.y = 0.06;
  group.add(stripe);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.7, 3), stripeMaterial);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 0.85;
  group.add(tail);

  group.userData.type = type;
  group.userData.tail = tail;
  group.userData.phase = Math.random() * Math.PI * 2;
  group.userData.baseX = 0;
  group.userData.speed = rand(1.1, 2.5) * (type.rarity > 3 ? 1.18 : 1);
  group.userData.caught = false;
  return group;
}

function makePerch(z, side = 1) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2d, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf5c752, emissive: 0x5c3900, emissiveIntensity: 0.8, roughness: 0.35 });
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 4.2, 8), wood);
  branch.rotation.z = Math.PI / 2;
  group.add(branch);
  const marker = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.08, 10, 32), gold);
  marker.rotation.x = Math.PI / 2;
  marker.position.y = 0.08;
  group.add(marker);
  group.position.set(side * 4.4, 3.6, z);
  group.userData.marker = marker;
  return group;
}

export class KingfisherGameEngine {
  constructor(mount, callbacks = {}, habitat = DEFAULT_HABITAT) {
    this.mount = mount;
    this.callbacks = callbacks;
    this.habitat = { ...DEFAULT_HABITAT, ...habitat };
    this.controlSettings = { ...DEFAULT_CONTROL_SETTINGS };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87bed2);
    this.scene.fog = new THREE.FogExp2(0x99c8d1, 0.0065);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 700);
    this.renderer = null;
    this.clock = new THREE.Clock();
    this.frame = 0;
    this.lastHud = 0;
    this.destroyed = false;
    this.state = "menu";
    this.mode = "hunt";
    this.prePauseState = "playing";
    this.countdown = 0;
    this.timeRemaining = HUNT_DURATION;

    this.steering = { x: 0, y: 0 };
    this.keyboardSteering = { x: 0, y: 0 };
    this.diving = false;
    this.flapping = false;
    this.smartDiveCommit = false;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.velocity = new THREE.Vector3(0, 0, -9);
    this.forward = new THREE.Vector3(0, 0, -1);
    this.cameraDirection = new THREE.Vector3();
    this.temp = new THREE.Vector3();
    this.temp2 = new THREE.Vector3();
    this.wasUnderwater = false;
    this.audioContext = null;

    this.score = 0;
    this.catches = 0;
    this.misses = 0;
    this.collisions = 0;
    this.rescues = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.energy = 1;
    this.focus = 0;
    this.focusActive = false;
    this.focusTime = 0;
    this.timeBonus = 0;
    this.perfectDives = 0;
    this.rareCatches = 0;
    this.air = 1;
    this.holdingFish = null;
    this.holdingValue = 0;
    this.holdingType = null;
    this.currentTarget = null;
    this.targetKind = "none";
    this.lastDiveGrade = "";
    this.diveStartHeight = 0;
    this.runSpecies = {};

    this.bestScore = safeReadJSON("aspen-kingfisher-best-v2", 0) || 0;
    this.lifetimeCatches = safeReadJSON("aspen-kingfisher-lifetime-v2", 0) || 0;
    this.discovered = safeReadJSON("aspen-kingfisher-discovered-v2", {}) || {};
    this.speciesCaught = safeReadJSON("aspen-kingfisher-species-v2", {}) || {};

    this.fish = [];
    this.perches = [];
    this.decor = [];
    this.rocks = [];

    try {
      this._initRenderer();
      this._buildWorld();
      this._bindEvents();
      this._resetBird();
      this._emitState();
      this._emitHud(true);
      this.callbacks.onReady?.();
      this._animate();
    } catch (error) {
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  _initRenderer() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = false;
    renderer.setPixelRatio(this._desiredPixelRatio());
    renderer.setSize(Math.max(1, this.mount.clientWidth), Math.max(1, this.mount.clientHeight), false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.setAttribute("aria-label", "3D kingfisher river habitat");
    this.mount.replaceChildren(renderer.domElement);
    this.renderer = renderer;
    this._resize();
  }

  _desiredPixelRatio() {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    if (!this.controlSettings.adaptiveQuality) return Math.min(dpr, 2);
    const small = typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 700;
    return Math.min(dpr, small ? 1.35 : 1.75);
  }

  _buildWorld() {
    this.scene.clear();

    const hemi = new THREE.HemisphereLight(0xccefff, 0x30442f, 2.3);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d4, 3.1);
    sun.position.set(-24, 38, 14);
    this.scene.add(sun);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(320, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0x89c5d7, side: THREE.BackSide, fog: false })
    );
    this.scene.add(sky);

    const riverbed = new THREE.Mesh(
      new THREE.PlaneGeometry(RIVER_HALF_WIDTH * 2.1, WORLD_HALF_LENGTH * 2.2, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x56695d, roughness: 1 })
    );
    riverbed.rotation.x = -Math.PI / 2;
    riverbed.position.y = RIVERBED_Y;
    this.scene.add(riverbed);

    const waterColor = new THREE.Color().setHSL(0.52, 0.52, lerp(0.28, 0.42, this.habitat.waterClarity));
    this.waterMaterial = new THREE.MeshPhysicalMaterial({
      color: waterColor,
      transparent: true,
      opacity: lerp(0.62, 0.8, this.habitat.waterClarity),
      roughness: lerp(0.18, 0.42, this.habitat.weather),
      metalness: 0.02,
      clearcoat: 0.35,
      clearcoatRoughness: 0.28,
      side: THREE.DoubleSide,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_HALF_WIDTH * 2, WORLD_HALF_LENGTH * 2, 36, 160), this.waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    this.water = water;
    this.scene.add(water);

    const bankMaterial = new THREE.MeshStandardMaterial({ color: 0x55733d, roughness: 0.96 });
    const bankGeometry = new THREE.BoxGeometry(28, 2.8, WORLD_HALF_LENGTH * 2.1);
    const leftBank = new THREE.Mesh(bankGeometry, bankMaterial);
    leftBank.position.set(-(RIVER_HALF_WIDTH + 14), -0.6, 0);
    this.scene.add(leftBank);
    const rightBank = leftBank.clone();
    rightBank.position.x = RIVER_HALF_WIDTH + 14;
    this.scene.add(rightBank);

    const gravelMaterial = new THREE.MeshStandardMaterial({ color: 0x8c8372, roughness: 1 });
    for (let index = 0; index < 68; index += 1) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.18, 0.72), 0), gravelMaterial);
      const bankSide = Math.random() < 0.42;
      rock.position.set(
        bankSide ? (Math.random() < 0.5 ? -1 : 1) * rand(RIVER_HALF_WIDTH + 0.4, RIVER_HALF_WIDTH + 6) : rand(-RIVER_HALF_WIDTH + 0.7, RIVER_HALF_WIDTH - 0.7),
        bankSide ? rand(-0.5, 0.35) : rand(RIVERBED_Y + 0.2, RIVERBED_Y + 0.7),
        rand(-WORLD_HALF_LENGTH, WORLD_HALF_LENGTH)
      );
      rock.rotation.set(rand(0, 2), rand(0, 2), rand(0, 2));
      this.scene.add(rock);
      this.decor.push(rock);
      if (bankSide) this.rocks.push(rock);
    }

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x69482d, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x315f3b, roughness: 0.9 });
    for (let index = 0; index < 46; index += 1) {
      const side = index % 2 ? 1 : -1;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, rand(3.5, 6.5), 7), trunkMat);
      trunk.position.set(side * rand(RIVER_HALF_WIDTH + 4, RIVER_HALF_WIDTH + 13), 1.3, rand(-WORLD_HALF_LENGTH, WORLD_HALF_LENGTH));
      const crown = new THREE.Mesh(new THREE.SphereGeometry(rand(1.25, 2.2), 8, 6), leafMat);
      crown.scale.y = 1.25;
      crown.position.copy(trunk.position).add(new THREE.Vector3(0, rand(2.5, 4.5), 0));
      this.scene.add(trunk, crown);
      this.decor.push(trunk, crown);
    }

    this.perches = [
      makePerch(42, -1),
      makePerch(-18, 1),
      makePerch(-88, -1),
      makePerch(118, 1),
    ];
    this.perches.forEach((perch) => this.scene.add(perch));

    this.bird = makeBird();
    this.scene.add(this.bird);
    this._spawnFish();
  }

  _spawnFish() {
    this.fish.forEach((fish) => this.scene.remove(fish));
    this.fish = [];
    const count = clamp(Math.round(56 * this.habitat.fishDensity), 28, 96);
    for (let index = 0; index < count; index += 1) {
      const type = weightedFishType(this.habitat.biodiversity);
      const fish = makeFish(type);
      this._placeFish(fish, true);
      this.scene.add(fish);
      this.fish.push(fish);
    }
  }

  _placeFish(fish, randomZ = false) {
    const type = fish.userData.type;
    const depth = rand(type.depth[0], type.depth[1]);
    fish.position.set(rand(-RIVER_HALF_WIDTH + 0.9, RIVER_HALF_WIDTH - 0.9), -depth, randomZ ? rand(-WORLD_HALF_LENGTH, WORLD_HALF_LENGTH) : this._wrapZ(this.bird.position.z - rand(55, 130)));
    fish.userData.baseX = fish.position.x;
    fish.userData.phase = Math.random() * Math.PI * 2;
    fish.userData.caught = false;
    fish.visible = true;
  }

  _bindEvents() {
    this._onResize = () => this._resize();
    this._onKeyDown = (event) => {
      this.keys.add(event.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
      if (event.code === "KeyT" && !event.repeat) this.rescue("RETURNED TO PERCH", 180);
      if (event.code === "KeyR" && !event.repeat) this.restartCurrentMode();
      if (event.code === "Escape" && !event.repeat && ["playing", "countdown", "paused"].includes(this.state)) this.setPaused(this.state !== "paused");
    };
    this._onKeyUp = (event) => this.keys.delete(event.code);
    window.addEventListener("resize", this._onResize, { passive: true });
    window.addEventListener("keydown", this._onKeyDown, { passive: false });
    window.addEventListener("keyup", this._onKeyUp, { passive: true });
  }

  _resize() {
    if (!this.renderer || !this.mount) return;
    const width = Math.max(1, this.mount.clientWidth || window.innerWidth || 1);
    const height = Math.max(1, this.mount.clientHeight || window.innerHeight || 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this._desiredPixelRatio());
    this.renderer.setSize(width, height, false);
  }

  setControlSettings(settings = {}) {
    this.controlSettings = { ...DEFAULT_CONTROL_SETTINGS, ...this.controlSettings, ...settings };
    if (this.renderer) this.renderer.setPixelRatio(this._desiredPixelRatio());
  }

  applyHabitat(habitat = {}) {
    this.habitat = { ...DEFAULT_HABITAT, ...habitat };
    if (this.waterMaterial) {
      const waterColor = new THREE.Color().setHSL(0.52, 0.52, lerp(0.28, 0.42, this.habitat.waterClarity));
      this.waterMaterial.color.copy(waterColor);
      this.waterMaterial.opacity = lerp(0.62, 0.8, this.habitat.waterClarity);
      this.waterMaterial.roughness = lerp(0.18, 0.42, this.habitat.weather);
    }
    this._spawnFish();
    this._emitHud(true);
  }

  setSteering(x = 0, y = 0) {
    this.steering.x = clamp(Number(x) || 0, -1, 1);
    this.steering.y = clamp(Number(y) || 0, -1, 1);
  }

  setDiving(value) {
    const next = Boolean(value);
    if (next && !this.diving && this.controlSettings.smartDive && this.currentTarget && !this.holdingFish) this.smartDiveCommit = true;
    if (!next && !this.controlSettings.smartDive) this.smartDiveCommit = false;
    this.diving = next;
    if (next) this.diveStartHeight = Math.max(this.diveStartHeight, this.bird?.position.y || 0);
  }

  setFlapping(value) {
    this.flapping = Boolean(value);
    if (value) this.smartDiveCommit = false;
  }

  unlockAudio() {
    if (!this.controlSettings.sound || this.audioContext) {
      this.audioContext?.resume?.();
      return;
    }
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.audioContext.resume?.();
    } catch {}
  }

  _tone(frequency = 440, duration = 0.08, volume = 0.025) {
    if (!this.controlSettings.sound || !this.audioContext) return;
    try {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.frequency.value = frequency;
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      const now = this.audioContext.currentTime;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    } catch {}
  }

  _haptic(pattern = 12) {
    if (!this.controlSettings.haptics) return;
    try { navigator.vibrate?.(pattern); } catch {}
  }

  startHunt() {
    this._resetRun("hunt");
    this.state = "countdown";
    this.countdown = 3.4;
    this._emitState();
    this._emitHud(true);
    this._tone(520, 0.06, 0.02);
  }

  startFreeFlight() {
    this._resetRun("free");
    this.state = "playing";
    this.countdown = 0;
    this._emitState();
    this._emitHud(true);
  }

  showMenu() {
    this.state = "menu";
    this.mode = this.mode || "hunt";
    this.diving = false;
    this.flapping = false;
    this.smartDiveCommit = false;
    this._resetBird();
    this._emitState();
    this._emitHud(true);
  }

  setPaused(value) {
    if (value) {
      if (!["playing", "countdown"].includes(this.state)) return;
      this.prePauseState = this.state;
      this.state = "paused";
      this._emitState();
    } else if (this.state === "paused") {
      this.state = this.prePauseState === "countdown" ? "countdown" : "playing";
      this._emitState();
    }
    this._emitHud(true);
  }

  restartCurrentMode() {
    if (this.mode === "free") this.startFreeFlight();
    else this.startHunt();
  }

  rescue(message = "RETURNED TO PERCH", penalty = 0) {
    if (!this.bird) return;
    const perch = this._nearestPerch();
    this.bird.position.copy(perch.position).add(new THREE.Vector3(0, 1.4, 4.6));
    this.yaw = 0;
    this.pitch = 0;
    this.velocity.set(0, 0, -7.5);
    this.energy = Math.max(this.energy, 0.72);
    this.air = 1;
    this.rescues += 1;
    this.score = Math.max(0, this.score - Math.max(0, penalty || 0));
    if (this.holdingFish) {
      this.misses += 1;
      this.holdingFish = null;
      this.holdingValue = 0;
      this.holdingType = null;
      this.combo = 0;
    }
    this.callbacks.onEvent?.({ type: "rescue", message });
    this._tone(210, 0.14, 0.035);
    this._haptic([18, 30, 18]);
    this._emitHud(true);
  }

  _resetRun(mode) {
    this.mode = mode;
    this.score = 0;
    this.catches = 0;
    this.misses = 0;
    this.collisions = 0;
    this.rescues = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.energy = 1;
    this.focus = 0;
    this.focusActive = false;
    this.focusTime = 0;
    this.timeBonus = 0;
    this.perfectDives = 0;
    this.rareCatches = 0;
    this.air = 1;
    this.holdingFish = null;
    this.holdingValue = 0;
    this.holdingType = null;
    this.lastDiveGrade = "";
    this.runSpecies = {};
    this.timeRemaining = HUNT_DURATION;
    this.diving = false;
    this.flapping = false;
    this.smartDiveCommit = false;
    this._resetBird();
    this.fish.forEach((fish) => this._placeFish(fish, true));
  }

  _resetBird() {
    if (!this.bird) return;
    this.bird.position.set(-1.5, 6.5, 34);
    this.yaw = 0;
    this.pitch = -0.05;
    this.velocity.set(0, 0, -8.4);
    this.wasUnderwater = false;
    this.air = 1;
    this.energy = Math.max(this.energy, 0.85);
    this._updateBirdRotation();
    this._updateCamera(1);
  }

  _emitState() {
    this.callbacks.onState?.({ state: this.state, mode: this.mode });
  }

  _emitHud(force = false) {
    const now = performance.now() / 1000;
    if (!force && now - this.lastHud < HUD_INTERVAL) return;
    this.lastHud = now;
    const target = this._resolveTarget();
    const marker = target ? this._projectMarker(target.position) : null;
    const targetDistance = target ? this.bird.position.distanceTo(target.position) : 0;
    const activeFish = this.fish.reduce((sum, fish) => sum + (fish.visible ? 1 : 0), 0);
    const discoveredSpecies = Object.keys(this.discovered).length;
    const speed = this.velocity.length();
    const underwater = this.bird.position.y < WATER_Y - 0.08;

    this.callbacks.onHud?.({
      state: this.state,
      mode: this.mode,
      countdown: this.countdown,
      timeRemaining: this.timeRemaining,
      score: this.score,
      catches: this.catches,
      misses: this.misses,
      collisions: this.collisions,
      rescues: this.rescues,
      combo: this.combo,
      bestCombo: this.bestCombo,
      energy: this.energy,
      focus: this.focus,
      focusActive: this.focusActive,
      focusTime: this.focusTime,
      timeBonus: this.timeBonus,
      perfectDives: this.perfectDives,
      rareCatches: this.rareCatches,
      discoveredSpecies,
      discovered: { ...this.discovered },
      totalSpecies: Object.keys(FISH_TYPES).length,
      lifetimeCatches: this.lifetimeCatches,
      lastDiveGrade: this.lastDiveGrade,
      air: this.air,
      underwater,
      depth: Math.max(0, -this.bird.position.y),
      altitude: Math.max(0, this.bird.position.y),
      speed,
      holdingFish: this.holdingFish,
      holdingValue: this.holdingValue,
      targetLabel: this.holdingFish ? "GOLD PERCH" : this.currentTarget?.userData?.type?.label || "SCAN THE WATER",
      targetKind: this.holdingFish ? "perch" : this.currentTarget ? "fish" : "none",
      targetDistance,
      marker,
      offCourse: Math.abs(this.bird.position.x) > RIVER_HALF_WIDTH + 1.5,
      activeFish,
      fishTotal: this.fish.length,
      bestScore: this.bestScore,
      speciesCaught: { ...this.speciesCaught },
      habitat: { ...this.habitat },
    });
  }

  _resolveTarget() {
    if (this.holdingFish) {
      this.targetKind = "perch";
      return this._nearestPerch();
    }
    this.targetKind = this.currentTarget ? "fish" : "none";
    return this.currentTarget;
  }

  _projectMarker(position) {
    this.temp.copy(position).project(this.camera);
    this.camera.getWorldDirection(this.cameraDirection);
    this.temp2.copy(position).sub(this.camera.position);
    return {
      x: this.temp.x,
      y: this.temp.y,
      behind: this.temp2.dot(this.cameraDirection) < 0,
    };
  }

  _nearestPerch() {
    let best = this.perches[0];
    let bestDistance = Infinity;
    for (const perch of this.perches) {
      const distance = this.bird.position.distanceTo(perch.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = perch;
      }
    }
    return best;
  }

  _chooseFishTarget() {
    if (this.holdingFish) {
      this.currentTarget = null;
      return;
    }
    let best = null;
    let bestScore = Infinity;
    const forward = this.forward;
    for (const fish of this.fish) {
      if (!fish.visible || fish.userData.caught) continue;
      const toFish = this.temp.copy(fish.position).sub(this.bird.position);
      const distance = toFish.length();
      if (distance > 72) continue;
      const ahead = toFish.normalize().dot(forward);
      if (ahead < -0.12) continue;
      const depthPenalty = Math.max(0, -fish.position.y - 2.7) * 2.5;
      const score = distance * (1.08 - Math.max(0, ahead) * 0.42) + depthPenalty;
      if (score < bestScore) {
        bestScore = score;
        best = fish;
      }
    }
    this.currentTarget = best;
  }

  _updateInput() {
    let x = 0;
    let y = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y -= 1;

    const pads = navigator.getGamepads?.() || [];
    const pad = Array.from(pads).find(Boolean);
    if (pad) {
      const dead = (value) => Math.abs(value) < 0.12 ? 0 : value;
      x += dead(pad.axes?.[0] || 0);
      y += -dead(pad.axes?.[1] || 0);
      if (pad.buttons?.[0]?.pressed) this.flapping = true;
      else if (!this.keys.has("Space")) this.flapping = false;
      if (pad.buttons?.[1]?.pressed) this.diving = true;
      else if (!this.keys.has("ShiftLeft") && !this.keys.has("ShiftRight")) this.diving = false;
    }

    this.keyboardSteering.x = clamp(x, -1, 1);
    this.keyboardSteering.y = clamp(y, -1, 1);
    if (this.keys.has("Space")) this.flapping = true;
    if (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) this.diving = true;
  }

  _updateBird(dt, elapsed) {
    const underwater = this.bird.position.y < WATER_Y - 0.06;
    const steerX = clamp(this.steering.x + this.keyboardSteering.x, -1, 1);
    let steerY = clamp(this.steering.y + this.keyboardSteering.y, -1, 1);
    if (this.controlSettings.invertY) steerY *= -1;
    const sensitivity = this.controlSettings.sensitivity;

    this.yaw -= steerX * 1.35 * sensitivity * dt;
    let targetPitch = steerY * 0.62 * sensitivity;
    const diveActive = (this.diving || this.smartDiveCommit) && !this.holdingFish;
    if (diveActive) targetPitch = Math.min(targetPitch, -0.72);
    if (this.flapping) targetPitch = Math.max(targetPitch, underwater ? 0.52 : 0.28);
    if (!diveActive && !this.flapping && !underwater && this.bird.position.y < 2.0) targetPitch = Math.max(targetPitch, 0.08);
    this.pitch = lerp(this.pitch, clamp(targetPitch, -0.92, 0.72), 1 - Math.exp(-5.2 * dt));

    this.forward.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();

    if (diveActive && this.currentTarget && this.controlSettings.assist > 0) {
      const targetDir = this.temp.copy(this.currentTarget.position).sub(this.bird.position).normalize();
      const assist = clamp(this.controlSettings.assist * (this.smartDiveCommit ? 1.12 : 1), 0, 0.95);
      this.forward.lerp(targetDir, assist * (1 - Math.exp(-3.8 * dt))).normalize();
      this.yaw = Math.atan2(this.forward.x, -this.forward.z);
      this.pitch = Math.asin(clamp(this.forward.y, -1, 1));
    }

    let speed = (underwater ? 6.3 : 9.6) * this.habitat.wingPower;
    if (diveActive) speed += underwater ? 3.6 : 11.8;
    if (this.flapping && this.energy > 0.02) speed += underwater ? 4.4 : 5.8;
    if (this.focusActive) speed *= 1.08;

    if (this.flapping && this.energy > 0) this.energy = Math.max(0, this.energy - dt * (underwater ? 0.24 : 0.17));
    else this.energy = Math.min(1, this.energy + dt * (underwater ? 0.045 : 0.095));

    const desired = this.temp.copy(this.forward).multiplyScalar(speed);
    if (!underwater) {
      desired.x += Math.sin(elapsed * 0.65 + this.bird.position.z * 0.012) * this.habitat.wind * 1.1;
      desired.x += Math.sin(elapsed * 2.1) * this.habitat.wind * this.habitat.weather * 0.35;
    }
    const response = underwater ? 2.4 : 4.6;
    this.velocity.lerp(desired, 1 - Math.exp(-response * dt));
    this.bird.position.addScaledVector(this.velocity, dt);

    if (!underwater && !diveActive && !this.flapping) this.bird.position.y -= 0.15 * dt;
    this.bird.position.y = clamp(this.bird.position.y, RIVERBED_Y - 0.15, 28);
    this.bird.position.z = this._wrapZ(this.bird.position.z);

    if (Math.abs(this.bird.position.x) > RIVER_HALF_WIDTH + 9) {
      this.collisions += 1;
      this.callbacks.onEvent?.({ type: "collision", message: "BANK COLLISION — RETURNING TO THE RIVER" });
      this._tone(150, 0.18, 0.04);
      this._haptic([30, 20, 30]);
      this.rescue("RETURNED TO THE RIVER", 220);
      return;
    }
    if (this.bird.position.y <= RIVERBED_Y + 0.05) {
      this.collisions += 1;
      this.callbacks.onEvent?.({ type: "collision", message: "RIVERBED IMPACT" });
      this.rescue("SURFACED AFTER IMPACT", 220);
      return;
    }

    const nowUnderwater = this.bird.position.y < WATER_Y - 0.06;
    if (nowUnderwater && !this.wasUnderwater) {
      this.callbacks.onEvent?.({ type: "water", message: "WATER ENTRY" });
      this._tone(260, 0.05, 0.022);
      this._haptic(15);
      this.diveStartHeight = Math.max(this.diveStartHeight, 3);
    }
    if (!nowUnderwater && this.wasUnderwater) {
      this.air = Math.max(this.air, 0.55);
      this.smartDiveCommit = false;
      this._tone(390, 0.04, 0.018);
    }
    this.wasUnderwater = nowUnderwater;

    if (nowUnderwater) {
      this.air = Math.max(0, this.air - dt * 0.11);
      if (this.air <= 0) {
        this.rescue("OUT OF AIR — RETURNED TO PERCH", 260);
        return;
      }
    } else {
      this.air = Math.min(1, this.air + dt * 0.5);
    }

    if (this.focusActive) {
      this.focusTime = Math.max(0, this.focusTime - dt);
      if (this.focusTime <= 0) this.focusActive = false;
    } else if (this.focus >= 1 && this.combo >= 3) {
      this.focusActive = true;
      this.focusTime = 4.5;
      this.focus = 0;
      this.callbacks.onEvent?.({ type: "focus", message: "KINGFISHER FOCUS" });
      this._tone(760, 0.12, 0.025);
    }

    this._updateBirdRotation();
  }

  _updateBirdRotation() {
    this.bird.rotation.y = this.yaw;
    this.bird.rotation.x = -this.pitch;
  }

  _updateFish(dt, elapsed) {
    const current = this.habitat.riverCurrent;
    for (const fish of this.fish) {
      if (!fish.visible) continue;
      const phase = fish.userData.phase;
      const flee = this.temp.copy(fish.position).sub(this.bird.position);
      const distance = flee.length();
      let fleeX = 0;
      if (distance < 8 && distance > 0.01) fleeX = (flee.x / distance) * (8 - distance) * 0.55;
      fish.position.z += fish.userData.speed * current * dt;
      fish.position.x = clamp(fish.userData.baseX + Math.sin(elapsed * 1.4 + phase) * 1.2 + fleeX, -RIVER_HALF_WIDTH + 0.65, RIVER_HALF_WIDTH - 0.65);
      fish.position.y += Math.sin(elapsed * 1.7 + phase) * 0.0025;
      fish.position.z = this._wrapZ(fish.position.z);
      fish.rotation.y = Math.PI + Math.sin(elapsed * 0.5 + phase) * 0.14;
      if (fish.userData.tail) fish.userData.tail.rotation.y = Math.sin(elapsed * 7 + phase) * 0.45;
    }
  }

  _checkCatchAndBank() {
    if (!this.holdingFish && this.currentTarget?.visible && this.bird.position.y < -0.18) {
      const distance = this.bird.position.distanceTo(this.currentTarget.position);
      if (distance < 1.05) this._catchFish(this.currentTarget, distance);
      else if ((this.diving || this.smartDiveCommit) && this.bird.position.y < -3.8 && distance > 2.8) {
        this.misses += 1;
        this.combo = 0;
        this.smartDiveCommit = false;
        this.callbacks.onEvent?.({ type: "miss", message: "DIVE MISSED — FLAP TO SURFACE" });
      }
    }

    if (this.holdingFish) {
      const perch = this._nearestPerch();
      if (this.bird.position.distanceTo(perch.position) < 2.55) this._bankFish();
    }
  }

  _catchFish(fish, distance) {
    const type = fish.userData.type;
    const speed = this.velocity.length();
    const diveDrop = Math.max(0, this.diveStartHeight - this.bird.position.y);
    const perfect = speed > 14.8 && diveDrop > 4.4 && distance < 0.8;
    const clean = speed > 11 && distance < 0.95;
    const multiplier = perfect ? 1.8 : clean ? 1.35 : 1;
    this.lastDiveGrade = perfect ? "PERFECT" : clean ? "CLEAN" : "CATCH";
    if (perfect) this.perfectDives += 1;
    this.holdingFish = type.label;
    this.holdingType = type;
    this.holdingValue = Math.round(type.value * multiplier);
    fish.visible = false;
    fish.userData.caught = true;
    this.currentTarget = null;
    this.smartDiveCommit = false;
    this.focus = Math.min(1, this.focus + (perfect ? 0.42 : 0.22));
    this.callbacks.onEvent?.({ type: "catch", message: `${this.lastDiveGrade} DIVE · ${type.label}` });
    this._tone(perfect ? 880 : 620, 0.11, 0.034);
    this._haptic(perfect ? [16, 20, 28] : 24);
  }

  _bankFish() {
    const type = this.holdingType;
    if (!type) return;
    this.catches += 1;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const comboMultiplier = 1 + Math.min(1.25, Math.max(0, this.combo - 1) * 0.12);
    const bankValue = Math.round(this.holdingValue * comboMultiplier);
    this.score += bankValue;
    this.lifetimeCatches += 1;
    this.runSpecies[type.id] = (this.runSpecies[type.id] || 0) + 1;
    this.speciesCaught[type.id] = (this.speciesCaught[type.id] || 0) + 1;
    this.discovered[type.id] = (this.discovered[type.id] || 0) + 1;
    if (type.rarity >= 3 || type.legendary) this.rareCatches += 1;

    const earnedTime = this.mode === "hunt" ? (this.lastDiveGrade === "PERFECT" ? 2.5 : type.legendary ? 4 : type.rarity >= 3 ? 1.5 : 0.55) : 0;
    if (earnedTime > 0) {
      this.timeRemaining += earnedTime;
      this.timeBonus += earnedTime;
    }

    safeWriteJSON("aspen-kingfisher-lifetime-v2", this.lifetimeCatches);
    safeWriteJSON("aspen-kingfisher-discovered-v2", this.discovered);
    safeWriteJSON("aspen-kingfisher-species-v2", this.speciesCaught);

    const message = `${type.label} BANKED · +${bankValue.toLocaleString("en-US")}${earnedTime ? ` · +${earnedTime.toFixed(1)}s` : ""}`;
    this.callbacks.onEvent?.({ type: "bank", message });
    this._tone(type.legendary ? 980 : 720, 0.15, 0.036);
    this._haptic(type.legendary ? [25, 35, 25, 35, 40] : [18, 22, 28]);

    const caughtFish = this.fish.find((fish) => fish.userData.caught && fish.userData.type.id === type.id);
    if (caughtFish) this._placeFish(caughtFish, false);
    this.holdingFish = null;
    this.holdingValue = 0;
    this.holdingType = null;
    this.lastDiveGrade = "";
    this.energy = Math.min(1, this.energy + 0.18);
    this.focus = Math.min(1, this.focus + 0.12);
    this.diveStartHeight = this.bird.position.y;
  }

  _updateCamera(dt) {
    if (!this.bird) return;
    const distance = 7.8 * this.controlSettings.cameraDistance;
    const height = this.bird.position.y < 0 ? 2.25 : 2.9;
    const desired = this.temp.copy(this.forward).multiplyScalar(-distance).add(this.bird.position).add(new THREE.Vector3(0, height, 0));
    const alpha = dt >= 1 ? 1 : 1 - Math.exp(-5.4 * dt);
    this.camera.position.lerp(desired, alpha);
    const look = this.temp2.copy(this.bird.position).addScaledVector(this.forward, 7).add(new THREE.Vector3(0, 0.35, 0));
    this.camera.lookAt(look);
  }

  _animateWater(elapsed) {
    if (!this.water?.geometry?.attributes?.position) return;
    const position = this.water.geometry.attributes.position;
    const weather = this.habitat.weather;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const wave = Math.sin(y * 0.13 + elapsed * 1.7) * 0.05 + Math.cos(x * 0.7 + elapsed * 1.1) * 0.025;
      position.setZ(index, wave * (1 + weather * 1.8));
    }
    position.needsUpdate = true;
  }

  _wrapZ(value) {
    if (value < -WORLD_HALF_LENGTH) return value + WORLD_HALF_LENGTH * 2;
    if (value > WORLD_HALF_LENGTH) return value - WORLD_HALF_LENGTH * 2;
    return value;
  }

  _finishHunt() {
    if (this.state === "finished") return;
    this.state = "finished";
    this.diving = false;
    this.flapping = false;
    this.smartDiveCommit = false;
    const precision = this.catches + this.misses > 0 ? this.catches / (this.catches + this.misses) : 0;
    let stars = 0;
    let medal = "RIVER APPRENTICE";
    if (this.score >= MEDAL_TARGETS.bronze) { stars = 1; medal = "BRONZE KINGFISHER"; }
    if (this.score >= MEDAL_TARGETS.silver) { stars = 2; medal = "SILVER KINGFISHER"; }
    if (this.score >= MEDAL_TARGETS.gold) { stars = 3; medal = "GOLD KINGFISHER"; }
    const newBest = this.score > this.bestScore;
    if (newBest) {
      this.bestScore = this.score;
      safeWriteJSON("aspen-kingfisher-best-v2", this.bestScore);
    }
    const species = Object.entries(this.runSpecies)
      .map(([id, count]) => ({ name: FISH_TYPES[id]?.label || id, count }))
      .sort((a, b) => b.count - a.count);
    const result = {
      score: this.score,
      catches: this.catches,
      misses: this.misses,
      collisions: this.collisions,
      rescues: this.rescues,
      bestCombo: this.bestCombo,
      perfectDives: this.perfectDives,
      rareCatches: this.rareCatches,
      timeBonus: this.timeBonus,
      discoveredSpecies: Object.keys(this.discovered).length,
      totalSpecies: Object.keys(FISH_TYPES).length,
      bestScore: this.bestScore,
      precision,
      stars,
      medal,
      species,
      newBest,
    };
    this._emitState();
    this._emitHud(true);
    this.callbacks.onFinish?.(result);
    this._tone(stars === 3 ? 960 : stars === 2 ? 760 : stars === 1 ? 620 : 420, 0.22, 0.04);
  }

  _animate = () => {
    if (this.destroyed) return;
    this.frame = requestAnimationFrame(this._animate);
    let dt = Math.min(0.034, Math.max(0.001, this.clock.getDelta()));
    const elapsed = this.clock.elapsedTime;

    this._updateInput();

    if (this.state === "countdown") {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown <= 0) {
        this.state = "playing";
        this._emitState();
        this._tone(740, 0.09, 0.028);
      }
    } else if (this.state === "playing") {
      if (this.mode === "hunt") {
        this.timeRemaining = Math.max(0, this.timeRemaining - dt);
        if (this.timeRemaining <= 0) this._finishHunt();
      }
      this._chooseFishTarget();
      this._updateBird(dt, elapsed);
      this._updateFish(dt, elapsed);
      this._checkCatchAndBank();
    } else if (this.state === "menu") {
      this.bird.position.y = 5.8 + Math.sin(elapsed * 1.6) * 0.22;
      this.yaw = Math.sin(elapsed * 0.25) * 0.18;
      this.pitch = Math.sin(elapsed * 0.7) * 0.035;
      this.forward.set(Math.sin(this.yaw), this.pitch, -Math.cos(this.yaw)).normalize();
      this._updateBirdRotation();
      this._updateFish(dt, elapsed);
    }

    const flapPhase = Math.sin(elapsed * (this.flapping ? 22 : 7));
    if (this.bird?.userData.leftWing) {
      const amplitude = this.flapping ? 0.85 : 0.24;
      this.bird.userData.leftWing.rotation.z = 0.15 + flapPhase * amplitude;
      this.bird.userData.rightWing.rotation.z = -0.15 - flapPhase * amplitude;
    }
    for (const perch of this.perches) {
      if (perch.userData.marker) perch.userData.marker.rotation.z = elapsed * 0.42;
    }

    this._animateWater(elapsed);
    this._updateCamera(dt);
    this._emitHud(false);
    this.renderer.render(this.scene, this.camera);
  };

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose?.();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose?.());
      }
    });
    this.renderer?.dispose?.();
    this.renderer?.domElement?.remove?.();
    this.audioContext?.close?.();
  }
}
