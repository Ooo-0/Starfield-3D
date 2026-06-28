import * as THREE from "./vendor/three.module.min.js";

const canvas = document.querySelector("#space");
const cursorStar = document.querySelector(".cursor-star");

const TAU = Math.PI * 2;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const smallScreen = window.matchMedia("(max-width: 760px)").matches;
const verificationMode = new URLSearchParams(window.location.search).has("verify");

const starCount = smallScreen ? 9000 : 17000;
const dustCount = smallScreen ? 460 : 820;
const streakCount = smallScreen ? 90 : 160;
const settings = {
  density: 0.92,
  glow: 0.42,
  speed: prefersReducedMotion ? 0.025 : 0.105
};

let renderer;
let scene;
let camera;
let fieldGroup;
let starGeometry;
let dustGeometry;
let starMaterial;
let dustMaterial;
let streakGeometry;
let streakMaterial;
let lastFrameTime = 0;
let elapsed = 0;
let frameCount = 0;
let warp = 0;
let pointerActive = false;

const pointer = new THREE.Vector2(0, 0);
const targetPointer = new THREE.Vector2(0, 0);
const nebulaSprites = [];
const streakData = [];
const streakPositions = new Float32Array(streakCount * 2 * 3);
const streakColors = new Float32Array(streakCount * 2 * 3);

const particleVertexShader = `
  attribute float aSize;
  attribute float aSeed;
  attribute float aSpeed;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uWarp;
  uniform float uGlow;
  uniform float uIntroTime;

  varying vec3 vColor;
  varying float vPulse;
  varying float vReveal;

  void main() {
    vec3 p = position;
    float depth = 154.0;
    float travel = uTime * mix(0.72, 9.4, uWarp) * aSpeed;
    p.z = mod(p.z + travel + 134.0 + aSeed * depth, depth) - 134.0;

    float twist = sin((p.z + uTime * 1.12) * 0.026) * (0.035 + uWarp * 0.085);
    mat2 spin = mat2(cos(twist), -sin(twist), sin(twist), cos(twist));
    p.xy = spin * p.xy;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float perspective = 86.0 / max(5.0, -mvPosition.z);
    float shimmer = 0.82 + 0.18 * sin(uTime * (0.58 + aSpeed * 0.72) + aSeed * 6.2831853);
    float start = aSeed * 8.8;
    vReveal = smoothstep(start, start + 3.15, uIntroTime);
    vPulse = shimmer;
    vColor = color;
    gl_PointSize = aSize * perspective * uPixelRatio * (0.72 + uGlow * 0.25) * (0.92 + uWarp * 0.22) * shimmer * max(0.001, vReveal);
  }
`;

const particleFragmentShader = `
  uniform float uGlow;
  uniform float uOpacity;

  varying vec3 vColor;
  varying float vPulse;
  varying float vReveal;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    float halo = smoothstep(0.5, 0.0, d);
    float core = smoothstep(0.16, 0.0, d);
    float alpha = halo * uOpacity * vReveal * (0.84 + vPulse * 0.16);

    if (alpha < 0.01) {
      discard;
    }

    vec3 color = vColor * (0.58 + halo * 0.42 + core * (0.86 + uGlow * 0.74));
    gl_FragColor = vec4(color, alpha);
  }
`;

function rng(seed) {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(836715);

function signedRandom() {
  return rand() * 2 - 1;
}

function colorFromPalette(index, warmth, intensity) {
  const palette = [
    new THREE.Color("#f8fbff"),
    new THREE.Color("#66efff"),
    new THREE.Color("#9f8cff"),
    new THREE.Color("#ff8dc8"),
    new THREE.Color("#ffe196"),
    new THREE.Color("#a8ffd0")
  ];
  const color = palette[index % palette.length].clone();
  color.lerp(new THREE.Color("#ffffff"), warmth);
  color.multiplyScalar(intensity);
  return color;
}

function makeParticleGeometry(count, kind) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const speeds = new Float32Array(count);
  const arms = 5;

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    let x;
    let y;
    let z;
    let radius;

    if (kind === "dust") {
      radius = Math.pow(rand(), 0.5) * 82 + 10;
      const theta = rand() * TAU;
      x = Math.cos(theta) * radius + signedRandom() * 14;
      y = signedRandom() * (20 + rand() * 24);
      z = -rand() * 154 + 8;
      sizes[i] = 12 + rand() * 36;
      speeds[i] = 0.18 + rand() * 0.46;
    } else {
      const halo = rand() < 0.16;

      if (halo) {
        radius = 18 + Math.pow(rand(), 0.74) * 90;
        const theta = rand() * TAU;
        const lift = Math.acos(signedRandom());
        x = Math.sin(lift) * Math.cos(theta) * radius;
        y = Math.cos(lift) * radius * 0.34 + signedRandom() * 6;
        z = -rand() * 154 + 10;
      } else {
        const arm = Math.floor(rand() * arms);
        radius = Math.pow(rand(), 0.55) * 76 + rand() * 5;
        const theta = (arm / arms) * TAU + radius * 0.112 + signedRandom() * (0.15 + radius * 0.0045);
        const flatness = 1 - Math.min(radius / 82, 1);
        x = Math.cos(theta) * radius + signedRandom() * (1.1 + radius * 0.024);
        y = signedRandom() * (1.6 + flatness * 8.2) + Math.sin(theta * 2.0) * 0.72;
        z = -rand() * 154 + 10;
      }

      sizes[i] = 1.4 + Math.pow(rand(), 2.7) * 6.2;
      speeds[i] = 0.34 + rand() * 0.92;
    }

    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;

    const coreBias = Math.max(0, 1 - Math.abs(x) / 72 - Math.abs(y) / 44);
    const paletteIndex = Math.floor(rand() * 6) + (coreBias > 0.55 ? 4 : 0);
    const intensity = kind === "dust" ? 0.34 : 0.58 + coreBias * 0.35;
    const color = colorFromPalette(paletteIndex, rand() * 0.34, intensity);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    seeds[i] = rand();
    speeds[i] *= 0.76 + rand() * 0.58;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
  geometry.setDrawRange(0, count);
  return geometry;
}

function makeParticleMaterial(opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.85) },
      uWarp: { value: settings.speed },
      uGlow: { value: settings.glow },
      uIntroTime: { value: 0 },
      uOpacity: { value: opacity }
    },
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    vertexColors: true
  });
}

function makeRadialTexture(stops) {
  const size = 256;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addNebulaSprites() {
  const textures = [
    makeRadialTexture([
      [0, "rgba(90, 230, 255, 0.58)"],
      [0.32, "rgba(160, 140, 255, 0.2)"],
      [0.7, "rgba(255, 140, 200, 0.07)"],
      [1, "rgba(0, 0, 0, 0)"]
    ]),
    makeRadialTexture([
      [0, "rgba(255, 225, 150, 0.42)"],
      [0.36, "rgba(150, 255, 205, 0.13)"],
      [0.72, "rgba(90, 230, 255, 0.05)"],
      [1, "rgba(0, 0, 0, 0)"]
    ])
  ];

  [
    { texture: textures[0], position: [-16, 5, -72], scale: [50, 28, 1], opacity: 0.18, rotation: 0.32 },
    { texture: textures[1], position: [26, -10, -92], scale: [58, 32, 1], opacity: 0.12, rotation: -0.46 },
    { texture: textures[0], position: [3, -3, -118], scale: [92, 45, 1], opacity: 0.08, rotation: 0.08 }
  ].forEach((config) => {
    const material = new THREE.SpriteMaterial({
      map: config.texture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(...config.position);
    sprite.scale.set(...config.scale);
    sprite.material.rotation = config.rotation;
    sprite.userData.baseOpacity = config.opacity;
    nebulaSprites.push(sprite);
    fieldGroup.add(sprite);
  });
}

function initStreaks() {
  const geometry = new THREE.BufferGeometry();
  const colorChoices = [
    new THREE.Color("#66efff"),
    new THREE.Color("#ff8dc8"),
    new THREE.Color("#ffe196"),
    new THREE.Color("#9f8cff"),
    new THREE.Color("#f8fbff")
  ];

  for (let i = 0; i < streakCount; i += 1) {
    const radius = 12 + Math.pow(rand(), 0.66) * 82;
    const theta = rand() * TAU;
    const color = colorChoices[Math.floor(rand() * colorChoices.length)].clone().multiplyScalar(0.38 + rand() * 0.28);
    streakData.push({
      x: Math.cos(theta) * radius + signedRandom() * 3,
      y: Math.sin(theta) * radius * 0.42 + signedRandom() * 8,
      z: -rand() * 150 + 10,
      length: 3 + rand() * 9,
      speed: 0.28 + rand() * 0.74,
      spread: 1.01 + rand() * 0.03
    });

    const c = i * 6;
    streakColors[c] = color.r;
    streakColors[c + 1] = color.g;
    streakColors[c + 2] = color.b;
    streakColors[c + 3] = color.r;
    streakColors[c + 4] = color.g;
    streakColors[c + 5] = color.b;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(streakPositions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(streakColors, 3));
  streakGeometry = geometry;
  streakMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false
  });

  fieldGroup.add(new THREE.LineSegments(streakGeometry, streakMaterial));
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function updateStreaks(time, reveal) {
  const depth = 154;
  const speed = 1.15 + warp * 7.2;

  for (let i = 0; i < streakData.length; i += 1) {
    const item = streakData[i];
    const z = ((item.z + time * speed * item.speed + 134) % depth) - 134;
    const stretch = item.spread + warp * 0.035;
    const len = item.length * (0.28 + warp * 0.72);
    const p = i * 6;

    streakPositions[p] = item.x;
    streakPositions[p + 1] = item.y;
    streakPositions[p + 2] = z;
    streakPositions[p + 3] = item.x * stretch;
    streakPositions[p + 4] = item.y * stretch;
    streakPositions[p + 5] = z - len;
  }

  streakGeometry.attributes.position.needsUpdate = true;
  streakMaterial.opacity = reveal * (0.012 + warp * 0.058);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.85);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  starMaterial.uniforms.uPixelRatio.value = pixelRatio;
  dustMaterial.uniforms.uPixelRatio.value = pixelRatio;
}

function onPointerMove(event) {
  const point = event.touches ? event.touches[0] : event;
  const x = Math.min(window.innerWidth, Math.max(0, point.clientX));
  const y = Math.min(window.innerHeight, Math.max(0, point.clientY));

  targetPointer.x = (x / window.innerWidth) * 2 - 1;
  targetPointer.y = -((y / window.innerHeight) * 2 - 1);
  pointerActive = true;

  cursorStar.classList.add("is-active");
  cursorStar.style.left = `${x}px`;
  cursorStar.style.top = `${y}px`;
}

function animate() {
  window.requestAnimationFrame(animate);

  const now = performance.now();
  const frameDelta = Math.min((now - lastFrameTime) / 1000, 0.034);
  lastFrameTime = now;
  elapsed += frameDelta;
  frameCount += 1;

  const reveal = smoothstep(0.6, 11.5, elapsed);
  const nebulaReveal = smoothstep(4.8, 15.0, elapsed);
  const introTime = Math.max(0, elapsed - 0.55);

  warp += (settings.speed - warp) * 0.035;
  pointer.lerp(targetPointer, pointerActive ? 0.04 : 0.018);

  fieldGroup.rotation.y = elapsed * 0.0048 + pointer.x * 0.12;
  fieldGroup.rotation.x = pointer.y * 0.062;
  fieldGroup.rotation.z = Math.sin(elapsed * 0.028) * 0.018;

  camera.position.x += (pointer.x * 8.4 - camera.position.x) * 0.026;
  camera.position.y += (pointer.y * 4.8 - camera.position.y) * 0.026;
  camera.position.z += (29.5 + Math.sin(elapsed * 0.07) * 1.2 - camera.position.z) * 0.018;
  camera.lookAt(pointer.x * 3.8, pointer.y * 2.2, -58);

  starMaterial.uniforms.uTime.value = elapsed;
  dustMaterial.uniforms.uTime.value = elapsed * 0.58;
  starMaterial.uniforms.uWarp.value = warp;
  dustMaterial.uniforms.uWarp.value = warp * 0.62;
  starMaterial.uniforms.uIntroTime.value = introTime;
  dustMaterial.uniforms.uIntroTime.value = Math.max(0, introTime - 2.6);
  starMaterial.uniforms.uOpacity.value = 0.88;
  dustMaterial.uniforms.uOpacity.value = 0.075;

  for (let i = 0; i < nebulaSprites.length; i += 1) {
    const sprite = nebulaSprites[i];
    sprite.material.opacity = sprite.userData.baseOpacity * nebulaReveal * (1 - i * 0.12);
    sprite.material.rotation += 0.00008 * (i + 1);
  }

  updateStreaks(elapsed, reveal);
  renderer.render(scene, camera);

  window.__starfield = {
    canvasHeight: renderer.domElement.height,
    canvasWidth: renderer.domElement.width,
    cursorActive: pointerActive,
    elapsed,
    frameCount,
    lookX: pointer.x,
    lookY: pointer.y,
    reveal,
    stars: starGeometry.drawRange.count,
    warp
  };

  if (verificationMode) {
    canvas.dataset.buffer = `${renderer.domElement.width}x${renderer.domElement.height}`;
    canvas.dataset.cursorActive = String(pointerActive);
    canvas.dataset.elapsed = elapsed.toFixed(3);
    canvas.dataset.frames = String(frameCount);
    canvas.dataset.look = `${pointer.x.toFixed(3)},${pointer.y.toFixed(3)}`;
    canvas.dataset.reveal = reveal.toFixed(3);
    canvas.dataset.warp = warp.toFixed(3);
  }
}

function init() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: verificationMode
  });
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.009);

  camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 240);
  camera.position.set(0, 0, 30);
  lastFrameTime = performance.now();

  fieldGroup = new THREE.Group();
  scene.add(fieldGroup);

  starGeometry = makeParticleGeometry(starCount, "stars");
  dustGeometry = makeParticleGeometry(dustCount, "dust");
  starGeometry.setDrawRange(0, Math.floor(starCount * settings.density));
  dustGeometry.setDrawRange(0, Math.floor(dustCount * (0.5 + settings.density * 0.5)));

  starMaterial = makeParticleMaterial(0.88);
  dustMaterial = makeParticleMaterial(0.075);

  fieldGroup.add(new THREE.Points(starGeometry, starMaterial));
  fieldGroup.add(new THREE.Points(dustGeometry, dustMaterial));

  addNebulaSprites();
  initStreaks();
  resize();

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("touchmove", onPointerMove, { passive: true });

  animate();
}

try {
  init();
} catch (error) {
  console.error(error);
}
