import * as THREE from "three";

export const KINGFISHER_VERSION = "1.2.0";
export const HUNT_DURATION = 120;

export const MEDAL_TARGETS = {
  bronze: 3200,
  silver: 7200,
  gold: 12500,
};

export const DEFAULT_CONTROL_SETTINGS = {
  sensitivity: 1,
  assist: 0.62,
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
  rainbow: { id: "rainbow", label: "RAINBOW TROUT", value: 620, rarity: 1, depth: [0.7, 2.7], body: 0x8ea9ad, stripe: 0xe15e78, belly: 0xdce8df, scale: 1.08 },
  brown: { id: "brown", label: "BROWN TROUT", value: 760, rarity: 1.35, depth: [1.0, 3.4], body: 0x9b7a52, stripe: 0x3b2d22, belly: 0xd3b786, scale: 1.14 },
  brook: { id: "brook", label: "BROOK TROUT", value: 880, rarity: 1.65, depth: [0.7, 2.8], body: 0x536f61, stripe: 0xe49c53, belly: 0xdab875, scale: 1.04 },
  char: { id: "char", label: "ARCTIC CHAR", value: 1040, rarity: 2.1, depth: [1.2, 3.7], body: 0x647e8f, stripe: 0xe97054, belly: 0xe7b589, scale: 1.18 },
  cutthroat: { id: "cutthroat", label: "CUTTHROAT TROUT", value: 1120, rarity: 2.35, depth: [0.8, 3.1], body: 0x8c9a7c, stripe: 0xd55e43, belly: 0xe8d19e, scale: 1.11 },
  grayling: { id: "grayling", label: "ARCTIC GRAYLING", value: 1260, rarity: 2.8, depth: [0.9, 3.0], body: 0x8298aa, stripe: 0x765caf, belly: 0xd7d9d5, scale: 1.02 },
  salmon: { id: "salmon", label: "SALMON PARR", value: 980, rarity: 2.15, depth: [0.6, 2.8], body: 0x8e9b83, stripe: 0x414841, belly: 0xd5d8be, scale: 1.02 },
  perch: { id: "perch", label: "RIVER PERCH", value: 520, rarity: 1.2, depth: [0.9, 3.6], body: 0x8ca64e, stripe: 0x263b29, belly: 0xd2d98b, scale: 0.94 },
  dace: { id: "dace", label: "RIVER DACE", value: 420, rarity: 1.1, depth: [0.5, 2.4], body: 0xa8b9bd, stripe: 0x73888e, belly: 0xe6eeee, scale: 0.82 },
  minnow: { id: "minnow", label: "SILVER MINNOW", value: 360, rarity: 1, depth: [0.4, 2.2], body: 0xb8c8cc, stripe: 0x6c8189, belly: 0xf0f5f3, scale: 0.72 },
  sculpin: { id: "sculpin", label: "RIVER SCULPIN", value: 1380, rarity: 3.2, depth: [2.3, 4.0], body: 0x6f6759, stripe: 0x342f2a, belly: 0x9b927d, scale: 0.88 },
  golden: { id: "golden", label: "GOLDEN TROUT", value: 3200, rarity: 8, depth: [1.1, 3.5], body: 0xf2c94c, stripe: 0xf07d32, belly: 0xffe7a0, scale: 1.2, legendary: true },
};

const WORLD_HALF_LENGTH = 190;
const RIVER_HALF_WIDTH = 8.6;
const WATER_Y = 0;
const RIVERBED_Y = -4.5;
const HUD_INTERVAL = 0.07;
const AIR_CRUISE = 10.1;
const AIR_DIVE = 25.5;
const UNDERWATER_CRUISE = 7.1;
const MAX_BANK = 0.78;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => min + Math.random() * (max - min);
const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);

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

function pointSegmentDistance(point, a, b, scratch) {
  const ab = scratch.ab.copy(b).sub(a);
  const ap = scratch.ap.copy(point).sub(a);
  const denom = Math.max(1e-6, ab.lengthSq());
  const t = clamp(ap.dot(ab) / denom, 0, 1);
  scratch.closest.copy(a).addScaledVector(ab, t);
  return scratch.closest.distanceTo(point);
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

function setShadows(root, cast = true, receive = false) {
  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = cast;
      object.receiveShadow = receive;
    }
  });
}

function makeFeather(material, length, width, x, z, angle = 0) {
  const feather = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 7), material);
  feather.scale.set(width, 0.11, length);
  feather.position.set(x, 0, z);
  feather.rotation.y = angle;
  return feather;
}

function makeBird() {
  const bird = new THREE.Group();
  bird.name = "kingfisher";
  bird.rotation.order = "YXZ";

  const blue = new THREE.MeshStandardMaterial({ color: 0x168ec5, roughness: 0.34, metalness: 0.12 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x40c4df, roughness: 0.32, metalness: 0.1 });
  const deepBlue = new THREE.MeshStandardMaterial({ color: 0x075b92, roughness: 0.38, metalness: 0.08 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe8a13d, roughness: 0.56 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f2e7, roughness: 0.72 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x151a1d, roughness: 0.48, metalness: 0.08 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 0.2, metalness: 0.12 });
  const eyeGlint = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.62, 22, 14), blue);
  torso.scale.set(0.82, 0.76, 1.48);
  torso.position.z = 0.12;
  bird.add(torso);

  const breast = new THREE.Mesh(new THREE.SphereGeometry(0.53, 20, 12), orange);
  breast.scale.set(0.73, 0.7, 1.18);
  breast.position.set(0, -0.29, -0.02);
  bird.add(breast);

  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.35, 18, 10), white);
  throat.scale.set(0.82, 0.78, 0.72);
  throat.position.set(0, -0.11, -0.82);
  bird.add(throat);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.49, 22, 14), deepBlue);
  head.scale.set(1.02, 0.93, 1.05);
  head.position.set(0, 0.18, -0.86);
  bird.add(head);

  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 10), cyan);
  crown.scale.set(0.9, 0.44, 0.82);
  crown.position.set(0, 0.47, -0.84);
  bird.add(crown);

  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), white);
    cheek.scale.set(0.65, 0.85, 0.65);
    cheek.position.set(side * 0.39, 0.02, -0.96);
    bird.add(cheek);

    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.074, 12, 8), eye);
    eyeball.position.set(side * 0.42, 0.25, -1.14);
    bird.add(eyeball);

    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 5), eyeGlint);
    glint.position.set(side * 0.445, 0.278, -1.2);
    bird.add(glint);
  }

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.135, 1.62, 10), dark);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.08, -1.74);
  bird.add(beak);

  const lowerBeak = new THREE.Mesh(new THREE.ConeGeometry(0.085, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x38383a, roughness: 0.58 }));
  lowerBeak.rotation.x = -Math.PI / 2;
  lowerBeak.position.set(0, 0.005, -1.67);
  bird.add(lowerBeak);

  const leftWing = new THREE.Group();
  const rightWing = new THREE.Group();
  leftWing.position.set(-0.45, 0.16, 0.05);
  rightWing.position.set(0.45, 0.16, 0.05);
  bird.add(leftWing, rightWing);

  const leftCover = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 9), blue);
  leftCover.scale.set(1.5, 0.18, 0.86);
  leftCover.position.x = -0.55;
  leftWing.add(leftCover);
  const rightCover = leftCover.clone();
  rightCover.position.x = 0.55;
  rightWing.add(rightCover);

  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    const length = lerp(0.85, 1.5, t);
    const left = makeFeather(i < 3 ? cyan : deepBlue, length, lerp(0.28, 0.2, t), -0.65 - i * 0.23, 0.13 + i * 0.12, 0.08 + t * 0.18);
    const right = makeFeather(i < 3 ? cyan : deepBlue, length, lerp(0.28, 0.2, t), 0.65 + i * 0.23, 0.13 + i * 0.12, -0.08 - t * 0.18);
    leftWing.add(left);
    rightWing.add(right);
  }

  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.05, 1.16);
  bird.add(tailGroup);
  for (let i = -2; i <= 2; i += 1) {
    const feather = makeFeather(i === 0 ? cyan : deepBlue, 0.92 + Math.abs(i) * 0.06, 0.14, i * 0.14, 0.42, i * -0.06);
    tailGroup.add(feather);
  }

  bird.userData.leftWing = leftWing;
  bird.userData.rightWing = rightWing;
  bird.userData.tailGroup = tailGroup;
  setShadows(bird, true, false);
  return bird;
}

function makeFish(type) {
  const fish = new THREE.Group();
  const scale = type.scale || 1;
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: type.body, roughness: 0.38, metalness: 0.12 });
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: type.stripe, roughness: 0.44, metalness: 0.05 });
  const bellyMaterial = new THREE.MeshStandardMaterial({ color: type.belly || 0xd8dfd6, roughness: 0.58 });
  const finMaterial = new THREE.MeshStandardMaterial({ color: type.stripe, roughness: 0.5, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x050708, roughness: 0.2 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.37, 18, 10), bodyMaterial);
  body.scale.set(0.7 * scale, 0.58 * scale, 1.55 * scale);
  fish.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 8), bellyMaterial);
  belly.scale.set(0.56 * scale, 0.24 * scale, 1.32 * scale);
  belly.position.y = -0.22 * scale;
  fish.add(belly);

  const lateral = new THREE.Mesh(new THREE.BoxGeometry(0.48 * scale, 0.07 * scale, 1.05 * scale), stripeMaterial);
  lateral.position.y = 0.03;
  fish.add(lateral);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34 * scale, 0.76 * scale, 3), finMaterial);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 0.98 * scale;
  fish.add(tail);

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.2 * scale, 0.52 * scale, 3), finMaterial);
  dorsal.rotation.x = Math.PI / 2;
  dorsal.position.set(0, 0.34 * scale, 0.12 * scale);
  fish.add(dorsal);

  for (const side of [-1, 1]) {
    const pectoral = new THREE.Mesh(new THREE.ConeGeometry(0.13 * scale, 0.38 * scale, 3), finMaterial);
    pectoral.rotation.z = side * 1.1;
    pectoral.position.set(side * 0.25 * scale, -0.05 * scale, 0.18 * scale);
    fish.add(pectoral);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045 * scale, 8, 6), eyeMaterial);
    eye.position.set(side * 0.22 * scale, 0.15 * scale, -0.48 * scale);
    fish.add(eye);
  }

  fish.userData.type = type;
  fish.userData.tail = tail;
  fish.userData.phase = Math.random() * Math.PI * 2;
  fish.userData.baseX = 0;
  fish.userData.baseY = -1;
  fish.userData.speed = rand(1.05, 2.25) * (type.rarity > 3 ? 1.15 : 1);
  fish.userData.caught = false;
  fish.userData.school = Math.floor(Math.random() * 8);
  fish.userData.wiggle = rand(0.8, 1.3);
  return fish;
}

function makePerch(z, side = 1) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4930, roughness: 0.92 });
  const moss = new THREE.MeshStandardMaterial({ color: 0x596d31, roughness: 0.95 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf5c752, emissive: 0x674200, emissiveIntensity: 1.1, roughness: 0.28, metalness: 0.1 });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 4.4, 9), wood);
  trunk.rotation.z = Math.PI / 2;
  group.add(trunk);

  const mossPatch = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.4, 8), moss);
  mossPatch.rotation.z = Math.PI / 2;
  mossPatch.position.y = 0.14;
  group.add(mossPatch);

  const marker = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.075, 12, 40), gold);
  marker.rotation.x = Math.PI / 2;
  marker.position.y = 0.1;
  group.add(marker);

  group.position.set(side * 4.5, 3.55, z);
  group.userData.marker = marker;
  setShadows(group, true, false);
  return group;
}

function makeTree(trunkMaterial, leafMaterials, scale = 1) {
  const tree = new THREE.Group();
  const height = rand(4.2, 7.2) * scale;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.34 * scale, height, 7), trunkMaterial);
  trunk.position.y = height * 0.5 - 0.25;
  tree.add(trunk);

  const crownCount = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < crownCount; i += 1) {
    const mat = leafMaterials[i % leafMaterials.length];
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.9, 1.5) * scale, 1), mat);
    crown.scale.set(rand(0.85, 1.25), rand(0.9, 1.35), rand(0.85, 1.2));
    crown.position.set(rand(-0.8, 0.8) * scale, height * rand(0.72, 1.0), rand(-0.7, 0.7) * scale);
    tree.add(crown);
  }
  setShadows(tree, true, true);
  return tree;
}

export class KingfisherGameEngine {
  constructor(mount, callbacks = {}, habitat = DEFAULT_HABITAT) {
    this.mount = mount;
    this.callbacks = callbacks;
    this.habitat = { ...DEFAULT_HABITAT, ...habitat };
    this.controlSettings = { ...DEFAULT_CONTROL_SETTINGS };

    this.scene = new THREE.Scene();
    this.airColor = new THREE.Color(0x82bed2);
    this.underwaterColor = new THREE.Color(0x174e58);
    this.scene.background = this.airColor.clone();
    this.scene.fog = new THREE.FogExp2(this.airColor, 0.0064);
    this.camera = new THREE.PerspectiveCamera(64, 1, 0.08, 720);
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
    this.keys = new Set();
    this.pointerDive = false;
    this.pointerFlap = false;
    this.gamepadDive = false;
    this.gamepadFlap = false;
    this.smartDiveCommit = false;
    this.lockedTarget = null;
    this.currentTarget = null;
    this.targetKind = "none";
    this.targetLockAge = 0;

    this.yaw = 0;
    this.pitch = -0.04;
    this.bank = 0;
    this.speed = AIR_CRUISE;
    this.velocity = new THREE.Vector3(0, 0, -AIR_CRUISE);
    this.forward = new THREE.Vector3(0, 0, -1);
    this.previousBirdPosition = new THREE.Vector3();
    this.cameraDirection = new THREE.Vector3();
    this.cameraLook = new THREE.Vector3();
    this.cameraLookTarget = new THREE.Vector3();
    this.cameraShake = 0;

    this.temp = new THREE.Vector3();
    this.temp2 = new THREE.Vector3();
    this.temp3 = new THREE.Vector3();
    this.scratch = {
      ab: new THREE.Vector3(),
      ap: new THREE.Vector3(),
      closest: new THREE.Vector3(),
    };

    this.wasUnderwater = false;
    this.diveAttempt = false;
    this.diveEnteredWater = false;
    this.diveCaught = false;
    this.diveStartHeight = 0;
    this.lastCatchAt = -Infinity;

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
    this.lastDiveGrade = "";
    this.runSpecies = {};

    this.bestScore = safeReadJSON("aspen-kingfisher-best-v2", 0) || 0;
    this.lifetimeCatches = safeReadJSON("aspen-kingfisher-lifetime-v2", 0) || 0;
    this.discovered = safeReadJSON("aspen-kingfisher-discovered-v2", {}) || {};
    this.speciesCaught = safeReadJSON("aspen-kingfisher-species-v2", {}) || {};

    this.fish = [];
    this.perches = [];
    this.decor = [];
    this.effectParticles = [];
    this.bubbleAccumulator = 0;

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
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    const compact = typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 760;
    return Math.min(dpr, compact ? 1.35 : 1.8);
  }

  _buildWorld() {
    this.scene.clear();
    this.decor = [];

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(340, 28, 16), new THREE.MeshBasicMaterial({ color: 0x83bdd0, side: THREE.BackSide, fog: false }));
    this.scene.add(this.sky);
    this.scene.add(new THREE.HemisphereLight(0xd9f4ff, 0x34462f, 2.15));

    const sun = new THREE.DirectionalLight(0xffedca, 3.45);
    sun.position.set(-32, 46, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 110;
    sun.shadow.bias = -0.0004;
    this.sun = sun;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8bd7f1, 0.62);
    fill.position.set(28, 15, -30);
    this.scene.add(fill);

    const riverbedGeometry = new THREE.PlaneGeometry(RIVER_HALF_WIDTH * 2.2, WORLD_HALF_LENGTH * 2.2, 20, 140);
    const riverbedPosition = riverbedGeometry.attributes.position;
    for (let i = 0; i < riverbedPosition.count; i += 1) {
      const x = riverbedPosition.getX(i);
      const y = riverbedPosition.getY(i);
      riverbedPosition.setZ(i, Math.sin(y * 0.07) * 0.12 + Math.cos(x * 0.8 + y * 0.025) * 0.08);
    }
    riverbedGeometry.computeVertexNormals();
    const riverbed = new THREE.Mesh(riverbedGeometry, new THREE.MeshStandardMaterial({ color: 0x5f6b5d, roughness: 0.96, metalness: 0.02 }));
    riverbed.rotation.x = -Math.PI / 2;
    riverbed.position.y = RIVERBED_Y;
    riverbed.receiveShadow = true;
    this.scene.add(riverbed);

    const waterColor = new THREE.Color().setHSL(0.515, 0.55, lerp(0.31, 0.43, this.habitat.waterClarity));
    this.waterMaterial = new THREE.MeshPhysicalMaterial({
      color: waterColor,
      transparent: true,
      opacity: lerp(0.58, 0.73, this.habitat.waterClarity),
      roughness: lerp(0.08, 0.32, this.habitat.weather),
      metalness: 0.03,
      clearcoat: 0.72,
      clearcoatRoughness: 0.18,
      transmission: 0.08,
      thickness: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const waterGeometry = new THREE.PlaneGeometry(RIVER_HALF_WIDTH * 2, WORLD_HALF_LENGTH * 2, 24, 128);
    this.waterBase = Float32Array.from(waterGeometry.attributes.position.array);
    this.water = new THREE.Mesh(waterGeometry, this.waterMaterial);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_Y;
    this.water.receiveShadow = true;
    this.scene.add(this.water);

    const bankMaterial = new THREE.MeshStandardMaterial({ color: 0x4f713d, roughness: 0.96 });
    const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x6f6047, roughness: 0.98 });
    for (const side of [-1, 1]) {
      const bankGeometry = new THREE.PlaneGeometry(22, WORLD_HALF_LENGTH * 2.15, 12, 130);
      const pos = bankGeometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const z = pos.getY(i);
        const edgeDistance = side < 0 ? x + 11 : 11 - x;
        const undulation = Math.sin(z * 0.045 + side) * 0.45 + Math.sin(z * 0.13) * 0.16;
        pos.setZ(i, clamp(edgeDistance / 7, 0, 1) * 1.2 + undulation * clamp(edgeDistance / 5, 0.2, 1));
      }
      bankGeometry.computeVertexNormals();
      const bank = new THREE.Mesh(bankGeometry, bankMaterial);
      bank.rotation.x = -Math.PI / 2;
      bank.position.set(side * (RIVER_HALF_WIDTH + 10.8), -0.45, 0);
      bank.receiveShadow = true;
      this.scene.add(bank);

      const cliff = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, WORLD_HALF_LENGTH * 2.1), soilMaterial);
      cliff.position.set(side * (RIVER_HALF_WIDTH + 0.5), -0.7, 0);
      cliff.receiveShadow = true;
      this.scene.add(cliff);
    }

    const stoneMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x807a6f, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x696d68, roughness: 0.92 }),
      new THREE.MeshStandardMaterial({ color: 0x8d877a, roughness: 0.96 }),
    ];
    for (let i = 0; i < 105; i += 1) {
      const underwater = Math.random() < 0.58;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.16, underwater ? 0.58 : 0.9), 0), stoneMaterials[i % stoneMaterials.length]);
      if (underwater) stone.position.set(rand(-RIVER_HALF_WIDTH + 0.5, RIVER_HALF_WIDTH - 0.5), rand(RIVERBED_Y + 0.2, RIVERBED_Y + 0.65), rand(-WORLD_HALF_LENGTH, WORLD_HALF_LENGTH));
      else {
        const side = Math.random() < 0.5 ? -1 : 1;
        stone.position.set(side * rand(RIVER_HALF_WIDTH + 1.2, RIVER_HALF_WIDTH + 7), rand(-0.5, 0.5), rand(-WORLD_HALF_LENGTH, WORLD_HALF_LENGTH));
      }
      stone.scale.set(rand(0.75, 1.35), rand(0.65, 1.1), rand(0.8, 1.5));
      stone.rotation.set(rand(0, 2), rand(0, 2), rand(0, 2));
      stone.castShadow = !underwater;
      stone.receiveShadow = true;
      this.scene.add(stone);
      this.decor.push(stone);
    }

    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x65472f, roughness: 0.98 });
    const leafMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x2e5c36, roughness: 0.92 }),
      new THREE.MeshStandardMaterial({ color: 0x3f7442, roughness: 0.92 }),
      new THREE.MeshStandardMaterial({ color: 0x49683b, roughness: 0.94 }),
    ];
    for (let i = 0; i < 56; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const tree = makeTree(trunkMaterial, leafMaterials, rand(0.72, 1.15));
      tree.position.set(side * rand(RIVER_HALF_WIDTH + 5.5, RIVER_HALF_WIDTH + 16), rand(-0.1, 0.65), rand(-WORLD_HALF_LENGTH, WORLD_HALF_LENGTH));
      tree.rotation.y = rand(0, Math.PI * 2);
      this.scene.add(tree);
      this.decor.push(tree);
    }

    const reedMaterial = new THREE.MeshStandardMaterial({ color: 0x6c843d, roughness: 0.92, side: THREE.DoubleSide });
    const reedGeometry = new THREE.CylinderGeometry(0.018, 0.03, 1.2, 5);
    for (let i = 0; i < 130; i += 1) {
      const side = i % 2 ? -1 : 1;
      const reed = new THREE.Mesh(reedGeometry, reedMaterial);
      reed.scale.y = rand(0.6, 1.5);
      reed.position.set(side * rand(RIVER_HALF_WIDTH + 0.4, RIVER_HALF_WIDTH + 2.3), reed.scale.y * 0.6 - 0.25, rand(-WORLD_HALF_LENGTH, WORLD_HALF_LENGTH));
      reed.rotation.z = rand(-0.08, 0.08);
      reed.castShadow = true;
      this.scene.add(reed);
      this.decor.push(reed);
    }

    const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xf0f4ef, transparent: true, opacity: 0.38, depthWrite: false });
    for (let i = 0; i < 13; i += 1) {
      const cloud = new THREE.Group();
      for (let c = 0; c < 4; c += 1) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(2.2, 4.2), 10, 7), cloudMaterial);
        puff.position.set(c * rand(2.0, 3.3), rand(-0.5, 0.8), rand(-1.2, 1.2));
        cloud.add(puff);
      }
      cloud.position.set(rand(-46, 46), rand(26, 45), rand(-WORLD_HALF_LENGTH, WORLD_HALF_LENGTH));
      this.scene.add(cloud);
      this.decor.push(cloud);
    }

    this.perches = [makePerch(45, -1), makePerch(-18, 1), makePerch(-88, -1), makePerch(118, 1)];
    this.perches.forEach((perch) => this.scene.add(perch));

    this.bird = makeBird();
    this.scene.add(this.bird);

    this.targetRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.045, 10, 34), new THREE.MeshBasicMaterial({ color: 0x6beaf3, transparent: true, opacity: 0.86, depthTest: false }));
    this.targetRing.rotation.x = Math.PI / 2;
    this.targetRing.visible = false;
    this.targetRing.renderOrder = 20;
    this.scene.add(this.targetRing);

    this.lockRing = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.035, 10, 34), new THREE.MeshBasicMaterial({ color: 0xffd46b, transparent: true, opacity: 0.9, depthTest: false }));
    this.lockRing.rotation.x = Math.PI / 2;
    this.lockRing.visible = false;
    this.lockRing.renderOrder = 21;
    this.scene.add(this.lockRing);

    this._spawnFish();
    this._updateEnvironmentLook();
  }

  _spawnFish() {
    this.fish.forEach((fish) => this.scene.remove(fish));
    this.fish = [];
    const count = clamp(Math.round(60 * this.habitat.fishDensity), 32, 100);
    for (let index = 0; index < count; index += 1) {
      const fish = makeFish(weightedFishType(this.habitat.biodiversity));
      this._placeFish(fish, true, index);
      this.scene.add(fish);
      this.fish.push(fish);
    }
  }

  _placeFish(fish, randomZ = false, index = 999) {
    const type = fish.userData.type;
    const depth = rand(type.depth[0], type.depth[1]);
    const z = randomZ ? (index < 14 ? rand(-24, 24) : rand(-WORLD_HALF_LENGTH, WORLD_HALF_LENGTH)) : this._wrapZ(this.bird.position.z - rand(55, 125));
    const x = index < 14 ? rand(-5.2, 5.2) : rand(-RIVER_HALF_WIDTH + 0.9, RIVER_HALF_WIDTH - 0.9);
    fish.position.set(x, -depth, z);
    fish.userData.baseX = fish.position.x;
    fish.userData.baseY = fish.position.y;
    fish.userData.phase = Math.random() * Math.PI * 2;
    fish.userData.caught = false;
    fish.visible = true;
  }

  _bindEvents() {
    this._onResize = () => this._resize();
    this._onBlur = () => this._clearTransientInput();
    this._onVisibility = () => { if (document.hidden) this._clearTransientInput(); };
    this._onKeyDown = (event) => {
      this.keys.add(event.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
      if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && !event.repeat) this._beginDive();
      if (event.code === "KeyT" && !event.repeat) this.rescue("RETURNED TO PERCH", 120);
      if (event.code === "KeyR" && !event.repeat) this.restartCurrentMode();
      if (event.code === "Escape" && !event.repeat && ["playing", "countdown", "paused"].includes(this.state)) this.setPaused(this.state !== "paused");
    };
    this._onKeyUp = (event) => {
      this.keys.delete(event.code);
      if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && !this.keys.has("ShiftLeft") && !this.keys.has("ShiftRight")) this._endDiveButton();
    };
    window.addEventListener("resize", this._onResize, { passive: true });
    window.addEventListener("blur", this._onBlur, { passive: true });
    document.addEventListener("visibilitychange", this._onVisibility, { passive: true });
    window.addEventListener("keydown", this._onKeyDown, { passive: false });
    window.addEventListener("keyup", this._onKeyUp, { passive: true });
  }

  _clearTransientInput() {
    this.keys.clear();
    this.pointerDive = false;
    this.pointerFlap = false;
    this.gamepadDive = false;
    this.gamepadFlap = false;
    if (!this.controlSettings.smartDive) this.smartDiveCommit = false;
    this.steering.x = 0;
    this.steering.y = 0;
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
    this._updateEnvironmentLook();
    this._spawnFish();
    this.currentTarget = null;
    this.lockedTarget = null;
    this._emitHud(true);
  }

  _updateEnvironmentLook() {
    if (!this.waterMaterial) return;
    const weather = this.habitat.weather;
    const clarity = this.habitat.waterClarity;
    this.waterMaterial.color.copy(new THREE.Color().setHSL(0.515, 0.54, lerp(0.3, 0.43, clarity)));
    this.waterMaterial.opacity = lerp(0.56, 0.74, clarity);
    this.waterMaterial.roughness = lerp(0.08, 0.34, weather);
    this.airColor.setHSL(0.54, lerp(0.32, 0.5, 1 - weather), lerp(0.61, 0.71, 1 - weather));
    this.underwaterColor.setHSL(0.51, 0.48, lerp(0.19, 0.29, clarity));
    if (this.sky?.material?.color) this.sky.material.color.copy(this.airColor);
  }

  setSteering(x = 0, y = 0) {
    this.steering.x = clamp(Number(x) || 0, -1, 1);
    this.steering.y = clamp(Number(y) || 0, -1, 1);
  }

  setDiving(value) {
    const next = Boolean(value);
    if (next && !this.pointerDive) this._beginDive();
    this.pointerDive = next;
    if (!next) this._endDiveButton();
  }

  _beginDive() {
    if (this.holdingFish || !["playing", "countdown"].includes(this.state)) return;
    this._chooseFishTarget(true);
    if (this.currentTarget?.visible) {
      this.lockedTarget = this.currentTarget;
      this.targetLockAge = 0;
      if (this.controlSettings.smartDive) this.smartDiveCommit = true;
      this.callbacks.onEvent?.({ type: "lock", message: `DIVE LOCK · ${this.currentTarget.userData.type.label}` });
      this._tone(560, 0.055, 0.018);
      this._haptic(8);
    } else if (this.controlSettings.smartDive) this.smartDiveCommit = true;
    this.diveAttempt = true;
    this.diveEnteredWater = false;
    this.diveCaught = false;
    this.diveStartHeight = Math.max(this.diveStartHeight, this.bird?.position.y || 0);
  }

  _endDiveButton() {
    if (!this.controlSettings.smartDive) {
      this.smartDiveCommit = false;
      this.lockedTarget = null;
    }
  }

  setFlapping(value) {
    this.pointerFlap = Boolean(value);
    if (value) this._cancelCommittedDive(false);
  }

  _cancelCommittedDive(clearTarget = true) {
    this.smartDiveCommit = false;
    if (clearTarget) this.lockedTarget = null;
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
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = volume;
      oscillator.connect(gain);
      gain.connect(this.audioContext.destination);
      const now = this.audioContext.currentTime;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch {}
  }

  _haptic(pattern = 12) {
    if (!this.controlSettings.haptics) return;
    try { navigator.vibrate?.(pattern); } catch {}
  }

  startHunt() {
    this._resetRun("hunt");
    this.state = "countdown";
    this.countdown = 3.2;
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
    this._clearTransientInput();
    this.smartDiveCommit = false;
    this.lockedTarget = null;
    this._resetBird();
    this._emitState();
    this._emitHud(true);
  }

  setPaused(value) {
    if (value) {
      if (!["playing", "countdown"].includes(this.state)) return;
      this.prePauseState = this.state;
      this.state = "paused";
      this._clearTransientInput();
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
    this.bird.position.copy(perch.position).add(new THREE.Vector3(0, 1.45, 4.8));
    this.previousBirdPosition.copy(this.bird.position);
    this.yaw = 0;
    this.pitch = -0.03;
    this.bank = 0;
    this.speed = 8.6;
    this.velocity.set(0, 0, -this.speed);
    this.energy = Math.max(this.energy, 0.76);
    this.air = 1;
    this.rescues += 1;
    this.score = Math.max(0, this.score - Math.max(0, penalty || 0));
    this._cancelCommittedDive(true);
    this.diveAttempt = false;
    this.diveEnteredWater = false;
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
    this._clearTransientInput();
    this.smartDiveCommit = false;
    this.lockedTarget = null;
    this.currentTarget = null;
    this.diveAttempt = false;
    this.diveEnteredWater = false;
    this.diveCaught = false;
    this._resetBird();
    this.fish.forEach((fish, index) => this._placeFish(fish, true, index));
  }

  _resetBird() {
    if (!this.bird) return;
    this.bird.position.set(-1.2, 7.2, 36);
    this.previousBirdPosition.copy(this.bird.position);
    this.yaw = 0;
    this.pitch = -0.035;
    this.bank = 0;
    this.speed = 9.2;
    this.velocity.set(0, 0, -this.speed);
    this.forward.set(0, 0, -1);
    this.wasUnderwater = false;
    this.air = 1;
    this.energy = Math.max(this.energy, 0.88);
    this.diveStartHeight = this.bird.position.y;
    this._updateBirdRotation();
    this.camera.position.copy(this.bird.position).add(new THREE.Vector3(0, 3.2, 8.2));
    this.cameraLook.copy(this.bird.position).add(new THREE.Vector3(0, 0, -8));
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
    const underwater = this.bird.position.y < WATER_Y - 0.08;
    const locked = Boolean(this.lockedTarget?.visible && (this.smartDiveCommit || this.pointerDive || this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.gamepadDive));

    this.callbacks.onHud?.({
      state: this.state, mode: this.mode, countdown: this.countdown, timeRemaining: this.timeRemaining,
      score: this.score, catches: this.catches, misses: this.misses, collisions: this.collisions, rescues: this.rescues,
      combo: this.combo, bestCombo: this.bestCombo, energy: this.energy, focus: this.focus, focusActive: this.focusActive,
      focusTime: this.focusTime, timeBonus: this.timeBonus, perfectDives: this.perfectDives, rareCatches: this.rareCatches,
      discoveredSpecies: Object.keys(this.discovered).length, discovered: { ...this.discovered }, totalSpecies: Object.keys(FISH_TYPES).length,
      lifetimeCatches: this.lifetimeCatches, lastDiveGrade: this.lastDiveGrade, air: this.air, underwater,
      depth: Math.max(0, -this.bird.position.y), altitude: Math.max(0, this.bird.position.y), speed: this.speed,
      holdingFish: this.holdingFish, holdingValue: this.holdingValue,
      targetLabel: this.holdingFish ? "GOLD PERCH" : locked && this.lockedTarget ? `LOCKED · ${this.lockedTarget.userData.type.label}` : this.currentTarget?.userData?.type?.label || "SCAN THE WATER",
      targetKind: this.holdingFish ? "perch" : this.currentTarget ? "fish" : "none", targetDistance, marker, targetLocked: locked,
      offCourse: Math.abs(this.bird.position.x) > RIVER_HALF_WIDTH + 1.8, activeFish, fishTotal: this.fish.length,
      bestScore: this.bestScore, speciesCaught: { ...this.speciesCaught }, habitat: { ...this.habitat },
    });
  }

  _resolveTarget() {
    if (this.holdingFish) {
      this.targetKind = "perch";
      return this._nearestPerch();
    }
    const target = this.lockedTarget?.visible ? this.lockedTarget : this.currentTarget;
    this.targetKind = target ? "fish" : "none";
    return target;
  }

  _projectMarker(position) {
    this.temp.copy(position).project(this.camera);
    this.camera.getWorldDirection(this.cameraDirection);
    this.temp2.copy(position).sub(this.camera.position);
    return { x: this.temp.x, y: this.temp.y, behind: this.temp2.dot(this.cameraDirection) < 0 };
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

  _chooseFishTarget(force = false) {
    if (this.holdingFish) {
      this.currentTarget = null;
      return;
    }
    if (!force && this.lockedTarget?.visible) {
      this.currentTarget = this.lockedTarget;
      return;
    }
    if (!force && this.currentTarget?.visible) {
      const distance = this.bird.position.distanceTo(this.currentTarget.position);
      const aheadVec = this.temp.copy(this.currentTarget.position).sub(this.bird.position);
      const ahead = distance > 0.001 ? aheadVec.normalize().dot(this.forward) : 1;
      if (distance < 78 && ahead > -0.18) return;
    }

    let best = null;
    let bestScore = Infinity;
    for (const fish of this.fish) {
      if (!fish.visible || fish.userData.caught) continue;
      const toFish = this.temp.copy(fish.position).sub(this.bird.position);
      const distance = toFish.length();
      if (distance > 76) continue;
      const horizontal = Math.hypot(toFish.x, toFish.z);
      const ahead = distance > 0.001 ? toFish.normalize().dot(this.forward) : 1;
      if (ahead < -0.18) continue;
      const centered = Math.abs(fish.position.x - this.bird.position.x);
      const startZoneBonus = fish.position.z < this.bird.position.z && fish.position.z > this.bird.position.z - 50 ? -11 : 0;
      const score = distance * 0.46 + horizontal * 0.31 + centered * 0.8 - Math.max(0, ahead) * 18 + fish.userData.type.rarity * 0.7 + startZoneBonus;
      if (score < bestScore) {
        bestScore = score;
        best = fish;
      }
    }
    this.currentTarget = best;
  }

  _readInput() {
    let x = this.steering.x;
    let y = this.steering.y;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y -= 1;

    let nextGamepadDive = false;
    let nextGamepadFlap = false;
    try {
      const pads = navigator.getGamepads?.() || [];
      const pad = Array.from(pads).find(Boolean);
      if (pad) {
        const dead = (value) => (Math.abs(value) < 0.1 ? 0 : value);
        x += dead(pad.axes?.[0] || 0);
        y += -dead(pad.axes?.[1] || 0);
        nextGamepadFlap = Boolean(pad.buttons?.[0]?.pressed);
        nextGamepadDive = Boolean(pad.buttons?.[1]?.pressed || pad.buttons?.[7]?.pressed);
      }
    } catch {}
    if (nextGamepadDive && !this.gamepadDive) this._beginDive();
    this.gamepadDive = nextGamepadDive;
    this.gamepadFlap = nextGamepadFlap;

    if (this.controlSettings.invertY) y *= -1;
    return {
      x: clamp(x, -1, 1),
      y: clamp(y, -1, 1),
      dive: this.pointerDive || this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.gamepadDive || this.smartDiveCommit,
      flap: this.pointerFlap || this.keys.has("Space") || this.gamepadFlap,
    };
  }

  _updateFlight(dt, elapsed, input) {
    const underwater = this.bird.position.y < WATER_Y - 0.06;
    this.previousBirdPosition.copy(this.bird.position);

    if (input.flap && this.smartDiveCommit) this._cancelCommittedDive(false);
    if (input.dive && !this.holdingFish && !this.lockedTarget?.visible) this._chooseFishTarget(true);
    if (input.dive && this.currentTarget?.visible && !this.lockedTarget) this.lockedTarget = this.currentTarget;

    const sensitivity = this.controlSettings.sensitivity;
    const yawRate = underwater ? 1.0 : lerp(1.05, 1.48, clamp(this.speed / AIR_DIVE, 0, 1));
    this.yaw -= input.x * yawRate * sensitivity * dt;
    this.bank = lerp(this.bank, -input.x * MAX_BANK * clamp(this.speed / 14, 0.55, 1), smooth(5.5, dt));

    let targetPitch = input.y * (underwater ? 0.52 : 0.46) * sensitivity;
    const locked = input.dive && !this.holdingFish && this.lockedTarget?.visible;

    if (locked) {
      const target = this.lockedTarget;
      const predicted = this.temp3.copy(target.position);
      predicted.z += target.userData.speed * this.habitat.riverCurrent * 0.35;
      const toTarget = this.temp2.copy(predicted).sub(this.bird.position);
      const horizontal = Math.hypot(toTarget.x, toTarget.z);
      const downward = Math.max(this.bird.position.y - predicted.y, horizontal * lerp(1.2, 2.4, this.controlSettings.assist));
      const diveAim = this.temp.copy(toTarget);
      diveAim.y = -Math.max(2.0, downward);
      diveAim.normalize();
      const desiredYaw = Math.atan2(diveAim.x, -diveAim.z);
      const yawDelta = Math.atan2(Math.sin(desiredYaw - this.yaw), Math.cos(desiredYaw - this.yaw));
      this.yaw += yawDelta * smooth(3.2 + this.controlSettings.assist * 5.5, dt);
      targetPitch = clamp(Math.asin(clamp(diveAim.y, -0.995, 0.9)), -1.48, -0.58);
      targetPitch = lerp(targetPitch, targetPitch + input.y * 0.18, 1 - clamp(this.controlSettings.assist, 0, 0.9) * 0.45);
      this.targetLockAge += dt;
    } else if (input.dive && !this.holdingFish) targetPitch = Math.min(targetPitch, -1.05);
    else if (input.flap) targetPitch = Math.max(targetPitch, underwater ? 0.7 : 0.38);
    else if (!underwater) targetPitch = lerp(targetPitch, this.bird.position.y < 2.3 ? 0.14 : -0.015, 0.38);

    this.pitch = lerp(this.pitch, clamp(targetPitch, -1.5, 0.78), smooth(locked ? 7.0 : underwater ? 4.3 : 5.5, dt));
    this.forward.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();

    const wingPower = this.habitat.wingPower;
    let targetSpeed = underwater ? UNDERWATER_CRUISE * wingPower : AIR_CRUISE * wingPower;
    if (input.dive && !this.holdingFish) {
      const diveFactor = clamp((-this.pitch - 0.2) / 1.25, 0, 1);
      targetSpeed = lerp(targetSpeed, AIR_DIVE * wingPower, 0.52 + diveFactor * 0.48);
    }
    if (input.flap && this.energy > 0.025) {
      targetSpeed += underwater ? 5.8 : 6.8;
      this.energy = Math.max(0, this.energy - dt * (underwater ? 0.24 : 0.16));
    } else this.energy = Math.min(1, this.energy + dt * (underwater ? 0.04 : 0.095));
    if (this.focusActive) targetSpeed *= 1.09;

    this.speed = lerp(this.speed, targetSpeed, smooth(input.dive ? 3.4 : input.flap ? 5.8 : underwater ? 2.6 : 2.2, dt));
    this.speed = clamp(this.speed, 4.2, AIR_DIVE * wingPower * 1.1);

    const desiredVelocity = this.temp.copy(this.forward).multiplyScalar(this.speed);
    if (!underwater) {
      desiredVelocity.x += Math.sin(elapsed * 0.52 + this.bird.position.z * 0.013) * this.habitat.wind * 0.95;
      desiredVelocity.x += Math.sin(elapsed * 2.2 + this.bird.position.z * 0.02) * this.habitat.wind * this.habitat.weather * 0.38;
      if (!input.dive && !input.flap) desiredVelocity.y -= 0.36;
    } else desiredVelocity.multiplyScalar(0.92);

    this.velocity.lerp(desiredVelocity, smooth(underwater ? 5.2 : 4.8, dt));
    this.bird.position.addScaledVector(this.velocity, dt);
    this.bird.position.y = clamp(this.bird.position.y, RIVERBED_Y - 0.05, 30);
    this.bird.position.z = this._wrapZ(this.bird.position.z);

    this._checkBoundaries();
    this._handleWaterTransition(input, dt);
    this._updateFocus(dt);
    this._updateBirdRotation();
  }

  _checkBoundaries() {
    if (Math.abs(this.bird.position.x) > RIVER_HALF_WIDTH + 10.5) {
      this.collisions += 1;
      this.callbacks.onEvent?.({ type: "collision", message: "BANK IMPACT · AUTO RECOVERY" });
      this._impactCamera(0.45);
      this.rescue("RETURNED TO THE RIVER", 120);
      return;
    }
    if (this.bird.position.y <= RIVERBED_Y + 0.12) {
      this.collisions += 1;
      this.callbacks.onEvent?.({ type: "collision", message: "RIVERBED IMPACT · SURFACING" });
      this._impactCamera(0.5);
      this.rescue("SURFACED AFTER IMPACT", 140);
    }
  }

  _handleWaterTransition(input, dt) {
    const underwater = this.bird.position.y < WATER_Y - 0.06;
    if (underwater && !this.wasUnderwater) {
      this.diveEnteredWater = true;
      this.diveAttempt = this.diveAttempt || input.dive;
      this._spawnSplash(this.bird.position, this.speed, false);
      this.callbacks.onEvent?.({ type: "water", message: input.dive ? "DIVE ENTRY" : "WATER ENTRY" });
      this._tone(245, 0.07, 0.027);
      this._haptic(14);
      this._impactCamera(0.18);
      this.diveStartHeight = Math.max(this.diveStartHeight, 3);
    }

    if (!underwater && this.wasUnderwater) {
      this._spawnSplash(this.bird.position, this.speed * 0.65, true);
      this.air = Math.max(this.air, 0.62);
      if (this.diveAttempt && this.diveEnteredWater && !this.diveCaught && !this.holdingFish) {
        this.misses += 1;
        this.combo = 0;
        this.callbacks.onEvent?.({ type: "miss", message: "DIVE MISSED · REPOSITION AND TRY AGAIN" });
      }
      this.diveAttempt = false;
      this.diveEnteredWater = false;
      this.diveCaught = false;
      this._cancelCommittedDive(true);
    }
    this.wasUnderwater = underwater;

    if (underwater) {
      this.air = Math.max(0, this.air - dt * 0.095);
      this.bubbleAccumulator += 1;
      if ((input.flap || input.dive) && this.bubbleAccumulator % 5 === 0) this._spawnBubble(this.bird.position);
      if (this.air <= 0) this.rescue("OUT OF AIR · RETURNED TO PERCH", 180);
    } else this.air = Math.min(1, this.air + dt * 0.48);
  }

  _updateFocus(dt) {
    if (this.focusActive) {
      this.focusTime = Math.max(0, this.focusTime - dt);
      if (this.focusTime <= 0) this.focusActive = false;
    } else if (this.focus >= 1 && this.combo >= 3) {
      this.focusActive = true;
      this.focusTime = 4.8;
      this.focus = 0;
      this.callbacks.onEvent?.({ type: "focus", message: "KINGFISHER FOCUS · SPEED + CONTROL" });
      this._tone(760, 0.12, 0.025);
    }
  }

  _updateBirdRotation() {
    this.bird.rotation.y = this.yaw;
    this.bird.rotation.x = -this.pitch;
    this.bird.rotation.z = this.bank;
  }

  _updateFish(dt, elapsed) {
    for (const fish of this.fish) {
      if (!fish.visible) continue;
      const phase = fish.userData.phase;
      const schoolPhase = fish.userData.school * 0.83;
      const flee = this.temp.copy(fish.position).sub(this.bird.position);
      const distance = flee.length();
      let fleeX = 0;
      let fleeZ = 0;
      if (distance < 7.5 && distance > 0.01) {
        flee.normalize();
        const response = (7.5 - distance) * 0.48;
        fleeX = flee.x * response;
        fleeZ = flee.z * response;
      }
      fish.position.z += (fish.userData.speed * this.habitat.riverCurrent + fleeZ) * dt;
      fish.position.x = clamp(fish.userData.baseX + Math.sin(elapsed * 1.25 * fish.userData.wiggle + phase + schoolPhase) * 1.0 + Math.sin(elapsed * 0.38 + schoolPhase) * 0.55 + fleeX, -RIVER_HALF_WIDTH + 0.6, RIVER_HALF_WIDTH - 0.6);
      fish.position.y = fish.userData.baseY + Math.sin(elapsed * 1.55 + phase) * 0.09;
      fish.position.z = this._wrapZ(fish.position.z);
      fish.rotation.y = Math.PI + Math.sin(elapsed * 0.48 + phase) * 0.12;
      fish.rotation.z = Math.sin(elapsed * 1.2 + phase) * 0.035;
      if (fish.userData.tail) fish.userData.tail.rotation.y = Math.sin(elapsed * 8.5 * fish.userData.wiggle + phase) * 0.55;
    }

    if (this.currentTarget?.visible) {
      this.targetRing.visible = true;
      this.targetRing.position.copy(this.currentTarget.position);
      this.targetRing.scale.setScalar((1 + Math.sin(elapsed * 5.4) * 0.08) * (this.currentTarget.userData.type.scale || 1));
    } else this.targetRing.visible = false;

    if (this.lockedTarget?.visible) {
      this.lockRing.visible = true;
      this.lockRing.position.copy(this.lockedTarget.position);
      this.lockRing.scale.setScalar((1.08 + Math.sin(elapsed * 8.2) * 0.12) * (this.lockedTarget.userData.type.scale || 1));
    } else this.lockRing.visible = false;
  }

  _checkCatchAndBank(elapsed) {
    if (!this.holdingFish && this.bird.position.y < -0.1) {
      const target = this.lockedTarget?.visible ? this.lockedTarget : this.currentTarget;
      let caught = null;
      let caughtDistance = Infinity;
      const assist = clamp(this.controlSettings.assist, 0, 0.9);
      const candidates = target ? [target, ...this.fish.filter((fish) => fish !== target && fish.visible)] : this.fish;
      for (const fish of candidates) {
        if (!fish.visible || fish.userData.caught) continue;
        const scale = fish.userData.type.scale || 1;
        const catchRadius = (fish === target ? lerp(1.35, 2.15, assist) : 1.05) * scale;
        const distance = pointSegmentDistance(fish.position, this.previousBirdPosition, this.bird.position, this.scratch);
        if (distance < catchRadius && distance < caughtDistance) {
          caught = fish;
          caughtDistance = distance;
          if (fish === target) break;
        }
      }
      if (caught && elapsed - this.lastCatchAt > 0.25) this._catchFish(caught, caughtDistance, elapsed);
    }

    if (this.holdingFish) {
      const perch = this._nearestPerch();
      if (this.bird.position.distanceTo(perch.position) < 3.15) this._bankFish();
    }
  }

  _catchFish(fish, distance, elapsed) {
    const type = fish.userData.type;
    const diveDrop = Math.max(0, this.diveStartHeight - this.bird.position.y);
    const targetRadius = lerp(1.35, 2.15, clamp(this.controlSettings.assist, 0, 0.9)) * (type.scale || 1);
    const precision = clamp(1 - distance / Math.max(0.1, targetRadius), 0, 1);
    const speedQuality = clamp((this.speed - 10) / 12, 0, 1);
    const dropQuality = clamp((diveDrop - 2.5) / 6, 0, 1);
    const quality = precision * 0.48 + speedQuality * 0.3 + dropQuality * 0.22;
    const perfect = quality > 0.76;
    const clean = quality > 0.47;
    const multiplier = perfect ? 1.85 : clean ? 1.42 : 1.14;

    this.lastDiveGrade = perfect ? "PERFECT" : clean ? "CLEAN" : "SOLID";
    if (perfect) this.perfectDives += 1;
    const gross = Math.round(type.value * multiplier);
    const immediate = Math.max(120, Math.round(gross * 0.43));
    this.score += immediate;
    this.holdingFish = type.label;
    this.holdingType = type;
    this.holdingValue = Math.max(0, gross - immediate);
    this.diveCaught = true;
    this.lastCatchAt = elapsed;
    fish.visible = false;
    fish.userData.caught = true;
    this.currentTarget = null;
    this.lockedTarget = null;
    this.smartDiveCommit = false;
    this.focus = Math.min(1, this.focus + (perfect ? 0.46 : 0.25));

    this.callbacks.onEvent?.({ type: "catch", message: `${this.lastDiveGrade} CATCH · ${type.label} · +${immediate.toLocaleString("en-US")} · RETURN TO GOLD PERCH` });
    this._tone(perfect ? 920 : clean ? 710 : 610, 0.13, 0.038);
    this._haptic(perfect ? [16, 18, 32] : [18, 18, 22]);
    this._impactCamera(perfect ? 0.22 : 0.12);
    this._emitHud(true);
  }

  _bankFish() {
    const type = this.holdingType;
    if (!type) return;
    this.catches += 1;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const comboMultiplier = 1 + Math.min(1.35, Math.max(0, this.combo - 1) * 0.14);
    const bankValue = Math.round(this.holdingValue * comboMultiplier + 110 + this.combo * 22);
    this.score += bankValue;
    this.lifetimeCatches += 1;
    this.runSpecies[type.id] = (this.runSpecies[type.id] || 0) + 1;
    this.speciesCaught[type.id] = (this.speciesCaught[type.id] || 0) + 1;
    this.discovered[type.id] = (this.discovered[type.id] || 0) + 1;
    if (type.rarity >= 3 || type.legendary) this.rareCatches += 1;

    const earnedTime = this.mode === "hunt" ? (this.lastDiveGrade === "PERFECT" ? 2.8 : type.legendary ? 4.5 : type.rarity >= 3 ? 1.7 : 0.7) : 0;
    if (earnedTime > 0) {
      this.timeRemaining += earnedTime;
      this.timeBonus += earnedTime;
    }

    safeWriteJSON("aspen-kingfisher-lifetime-v2", this.lifetimeCatches);
    safeWriteJSON("aspen-kingfisher-discovered-v2", this.discovered);
    safeWriteJSON("aspen-kingfisher-species-v2", this.speciesCaught);
    this.callbacks.onEvent?.({ type: "bank", message: `${type.label} BANKED · +${bankValue.toLocaleString("en-US")}${earnedTime ? ` · +${earnedTime.toFixed(1)}s` : ""} · STREAK ×${this.combo}` });
    this._tone(type.legendary ? 1040 : 790, 0.16, 0.04);
    this._haptic(type.legendary ? [24, 30, 24, 30, 42] : [16, 20, 30]);

    const caughtFish = this.fish.find((fish) => fish.userData.caught && fish.userData.type.id === type.id);
    if (caughtFish) this._placeFish(caughtFish, false);
    this.holdingFish = null;
    this.holdingValue = 0;
    this.holdingType = null;
    this.lastDiveGrade = "";
    this.energy = Math.min(1, this.energy + 0.2);
    this.focus = Math.min(1, this.focus + 0.14);
    this.diveStartHeight = this.bird.position.y;
    this._emitHud(true);
  }

  _impactCamera(amount) {
    if (!this.controlSettings.reducedMotion) this.cameraShake = Math.max(this.cameraShake, amount);
  }

  _updateCamera(dt) {
    if (!this.bird) return;
    const underwater = this.bird.position.y < WATER_Y - 0.08;
    const diveActive = (this.pointerDive || this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.gamepadDive || this.smartDiveCommit) && !this.holdingFish;
    const lockTarget = this.lockedTarget?.visible ? this.lockedTarget : null;
    const baseDistance = (underwater ? 6.5 : diveActive ? 7.0 : 8.2) * this.controlSettings.cameraDistance;
    const height = underwater ? 1.7 : diveActive ? 2.35 : 3.15;
    const sideOffset = this.bank * 1.15;

    const desired = this.temp.copy(this.forward).multiplyScalar(-baseDistance).add(this.bird.position);
    desired.y += height;
    desired.x += Math.cos(this.yaw) * sideOffset;
    desired.z += Math.sin(this.yaw) * sideOffset;
    if (this.cameraShake > 0.001 && !this.controlSettings.reducedMotion) {
      desired.x += rand(-1, 1) * this.cameraShake;
      desired.y += rand(-1, 1) * this.cameraShake * 0.55;
      desired.z += rand(-1, 1) * this.cameraShake * 0.45;
      this.cameraShake *= Math.exp(-8.5 * dt);
    }
    this.camera.position.lerp(desired, smooth(diveActive ? 7.2 : underwater ? 6.2 : 5.4, dt));

    this.cameraLookTarget.copy(this.bird.position).addScaledVector(this.forward, underwater ? 7 : 9);
    this.cameraLookTarget.y += underwater ? 0.1 : 0.35;
    if (lockTarget) this.cameraLookTarget.lerp(this.temp2.copy(lockTarget.position), diveActive ? 0.48 : 0.22);
    this.cameraLook.lerp(this.cameraLookTarget, smooth(diveActive ? 8.0 : 5.6, dt));
    this.camera.lookAt(this.cameraLook);

    this.camera.fov = lerp(this.camera.fov, underwater ? 72 : diveActive ? lerp(67, 76, clamp(this.speed / AIR_DIVE, 0, 1)) : 64, smooth(4.8, dt));
    this.camera.updateProjectionMatrix();
  }

  _animateWater(elapsed) {
    const position = this.water?.geometry?.attributes?.position;
    if (!position || !this.waterBase) return;
    const roughness = 1 + this.habitat.weather * 2.2;
    for (let i = 0; i < position.count; i += 1) {
      const index = i * 3;
      const x = this.waterBase[index];
      const y = this.waterBase[index + 1];
      const wave = Math.sin(y * 0.11 + elapsed * 1.9) * 0.055 + Math.cos(x * 0.72 + y * 0.025 + elapsed * 1.15) * 0.028 + Math.sin(y * 0.027 - elapsed * 0.8) * 0.035;
      position.setZ(i, wave * roughness);
    }
    position.needsUpdate = true;
  }

  _updateEnvironmentByDepth() {
    const underwater = this.bird.position.y < WATER_Y - 0.08;
    const depthBlend = underwater ? clamp((-this.bird.position.y) / 3.6, 0.2, 1) : 0;
    const background = this.tempColor || (this.tempColor = new THREE.Color());
    background.copy(this.airColor).lerp(this.underwaterColor, depthBlend);
    this.scene.background.copy(background);
    this.scene.fog.color.copy(background);
    this.scene.fog.density = underwater ? lerp(0.022, 0.07, depthBlend) * lerp(1.25, 0.8, this.habitat.waterClarity) : 0.0064 + this.habitat.weather * 0.0035;
    if (this.renderer) this.renderer.toneMappingExposure = underwater ? 0.92 : lerp(0.96, 1.1, 1 - this.habitat.weather);
  }

  _spawnSplash(position, strength, surfacing) {
    const count = clamp(Math.round(10 + strength * 0.65), 12, 28);
    for (let i = 0; i < count; i += 1) {
      const droplet = new THREE.Mesh(new THREE.SphereGeometry(rand(0.025, 0.075), 6, 4), new THREE.MeshBasicMaterial({ color: 0xd9fbff, transparent: true, opacity: 0.8, depthWrite: false }));
      droplet.position.set(position.x + rand(-0.28, 0.28), WATER_Y + 0.03, position.z + rand(-0.28, 0.28));
      const radial = rand(0.7, 2.8) + strength * 0.035;
      const angle = Math.random() * Math.PI * 2;
      droplet.userData.velocity = new THREE.Vector3(Math.cos(angle) * radial, rand(surfacing ? 1.4 : 2.1, surfacing ? 3.4 : 4.6), Math.sin(angle) * radial);
      droplet.userData.life = rand(0.5, 0.95);
      droplet.userData.maxLife = droplet.userData.life;
      droplet.userData.kind = "splash";
      this.scene.add(droplet);
      this.effectParticles.push(droplet);
    }

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.32, 28), new THREE.MeshBasicMaterial({ color: 0xd7f9ff, transparent: true, opacity: 0.64, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, WATER_Y + 0.025, position.z);
    ring.userData.life = 0.75;
    ring.userData.maxLife = 0.75;
    ring.userData.kind = "ring";
    this.scene.add(ring);
    this.effectParticles.push(ring);
  }

  _spawnBubble(position) {
    if (this.effectParticles.length > 90) return;
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(rand(0.025, 0.075), 7, 5), new THREE.MeshBasicMaterial({ color: 0xcffaff, transparent: true, opacity: 0.44, depthWrite: false }));
    bubble.position.set(position.x + rand(-0.45, 0.45), position.y + rand(-0.22, 0.18), position.z + rand(-0.5, 0.5));
    bubble.userData.velocity = new THREE.Vector3(rand(-0.18, 0.18), rand(0.55, 1.05), rand(-0.18, 0.18));
    bubble.userData.life = rand(0.7, 1.35);
    bubble.userData.maxLife = bubble.userData.life;
    bubble.userData.kind = "bubble";
    this.scene.add(bubble);
    this.effectParticles.push(bubble);
  }

  _updateEffects(dt) {
    for (let i = this.effectParticles.length - 1; i >= 0; i -= 1) {
      const particle = this.effectParticles[i];
      particle.userData.life -= dt;
      const lifeRatio = clamp(particle.userData.life / particle.userData.maxLife, 0, 1);
      if (particle.userData.kind === "ring") {
        const progress = 1 - lifeRatio;
        particle.scale.setScalar(1 + progress * 5.5);
        particle.material.opacity = 0.58 * lifeRatio;
      } else {
        const velocity = particle.userData.velocity;
        if (particle.userData.kind === "splash") velocity.y -= 6.2 * dt;
        particle.position.addScaledVector(velocity, dt);
        particle.material.opacity = (particle.userData.kind === "bubble" ? 0.4 : 0.76) * lifeRatio;
        if (particle.userData.kind === "bubble" && particle.position.y > WATER_Y - 0.02) particle.userData.life = 0;
      }
      if (particle.userData.life <= 0) {
        this.scene.remove(particle);
        particle.geometry?.dispose?.();
        particle.material?.dispose?.();
        this.effectParticles.splice(i, 1);
      }
    }
  }

  _animateBird(elapsed, input) {
    if (!this.bird?.userData.leftWing) return;
    const underwater = this.bird.position.y < WATER_Y - 0.08;
    const frequency = underwater ? 10 : input.flap ? 22 : this.speed > 17 ? 5.5 : 8.5;
    const phase = Math.sin(elapsed * frequency);
    const amplitude = underwater ? 0.38 : input.flap ? 0.92 : this.speed > 17 ? 0.18 : 0.36;
    const diveFold = input.dive && !this.holdingFish ? 0.74 : 0;
    this.bird.userData.leftWing.rotation.z = lerp(0.18 + phase * amplitude, 1.02, diveFold);
    this.bird.userData.rightWing.rotation.z = lerp(-0.18 - phase * amplitude, -1.02, diveFold);
    this.bird.userData.leftWing.rotation.x = -0.05 + Math.abs(phase) * 0.12;
    this.bird.userData.rightWing.rotation.x = -0.05 + Math.abs(phase) * 0.12;
    if (this.bird.userData.tailGroup) this.bird.userData.tailGroup.rotation.y = -this.bank * 0.25;
  }

  _wrapZ(value) {
    if (value < -WORLD_HALF_LENGTH) return value + WORLD_HALF_LENGTH * 2;
    if (value > WORLD_HALF_LENGTH) return value - WORLD_HALF_LENGTH * 2;
    return value;
  }

  _finishHunt() {
    if (this.state === "finished") return;
    this.state = "finished";
    this._clearTransientInput();
    this._cancelCommittedDive(true);
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
    const species = Object.entries(this.runSpecies).map(([id, count]) => ({ name: FISH_TYPES[id]?.label || id, count })).sort((a, b) => b.count - a.count);
    const result = {
      score: this.score, catches: this.catches, misses: this.misses, collisions: this.collisions, rescues: this.rescues,
      bestCombo: this.bestCombo, perfectDives: this.perfectDives, rareCatches: this.rareCatches, timeBonus: this.timeBonus,
      discoveredSpecies: Object.keys(this.discovered).length, totalSpecies: Object.keys(FISH_TYPES).length, bestScore: this.bestScore,
      precision, stars, medal, species, newBest,
    };
    this._emitState();
    this._emitHud(true);
    this.callbacks.onFinish?.(result);
    this._tone(stars === 3 ? 980 : stars === 2 ? 790 : stars === 1 ? 640 : 430, 0.22, 0.04);
  }

  _animate = () => {
    if (this.destroyed) return;
    this.frame = requestAnimationFrame(this._animate);
    const dt = Math.min(0.034, Math.max(0.001, this.clock.getDelta()));
    const elapsed = this.clock.elapsedTime;
    const input = this._readInput();

    if (this.state === "countdown") {
      this.countdown = Math.max(0, this.countdown - dt);
      this._chooseFishTarget();
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
      this._updateFlight(dt, elapsed, input);
      this._updateFish(dt, elapsed);
      this._checkCatchAndBank(elapsed);
    } else if (this.state === "menu") {
      this._chooseFishTarget();
      this.bird.position.y = 6.3 + Math.sin(elapsed * 1.55) * 0.24;
      this.yaw = Math.sin(elapsed * 0.24) * 0.16;
      this.pitch = Math.sin(elapsed * 0.68) * 0.035;
      this.bank = Math.sin(elapsed * 0.52) * 0.08;
      this.forward.set(Math.sin(this.yaw), this.pitch, -Math.cos(this.yaw)).normalize();
      this._updateBirdRotation();
      this._updateFish(dt, elapsed);
    }

    this._animateBird(elapsed, input);
    for (const perch of this.perches) if (perch.userData.marker) perch.userData.marker.rotation.z = elapsed * 0.42;
    this._animateWater(elapsed);
    this._updateEffects(dt);
    this._updateEnvironmentByDepth();
    this._updateCamera(dt);
    this._emitHud(false);
    this.renderer.render(this.scene, this.camera);
  };

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("blur", this._onBlur);
    document.removeEventListener("visibilitychange", this._onVisibility);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this.scene.traverse((object) => {
      object.geometry?.dispose?.();
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
