import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

type CinematicInkIntroProps = {
  uiRootRef: RefObject<HTMLDivElement | null>;
};

type IntroState = {
  progress: number;
  reveal: number;
  opacity: number;
};

const PAPER_COLOR = new THREE.Color('#F9F4E8');
const INK_COLOR = new THREE.Color('#1A1A1B');
const BORDER_COLOR = new THREE.Color('#C9A75A');
const paperVertexShader = `
uniform float uProgress;
varying vec2 vUv;

void main() {
  vUv = uv;

  vec3 transformed = position;
  float centerDist = abs(uv.x - 0.5) * 2.0;
  float curl = pow(centerDist, 2.1);
  float tension = 1.0 - smoothstep(0.0, 1.0, uProgress);

  transformed.z += curl * mix(0.2, 0.06, uProgress);
  transformed.z += sin(uv.y * 3.14159265) * 0.014 * tension;
  transformed.y += sin((uv.x - 0.5) * 3.14159265) * 0.02 * tension;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const paperFragmentShader = `
uniform sampler2D uTextMap;
uniform float uProgress;
uniform float uReveal;
uniform float uOpacity;
uniform vec3 uPaperColor;
uniform vec3 uInkColor;
uniform vec3 uBorderColor;
varying vec2 vUv;

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,
    0.366025403784439,
    -0.577350269189626,
    0.024390243902439
  );

  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);

  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * snoise(p);
    p *= 2.03;
    amplitude *= 0.54;
  }
  return value;
}

void main() {
  vec2 uv = vUv;
  float edgeDistance = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float halfOpen = mix(0.016, 0.5, smoothstep(0.0, 1.0, uProgress));
  float unfoldMask = 1.0 - smoothstep(halfOpen, halfOpen + 0.04, abs(uv.x - 0.5));

  float grainA = fbm(vec2(uv.x * 12.0, uv.y * 58.0));
  float grainB = fbm(vec2(uv.x * 72.0, uv.y * 16.0) + 9.2);
  float grainC = fbm(uv * 24.0 + 16.0);
  vec3 paper = uPaperColor + vec3((grainA - 0.5) * 0.05 + (grainB - 0.5) * 0.025 + (grainC - 0.5) * 0.012);

  float borderBand = 1.0 - smoothstep(0.056, 0.11, edgeDistance);
  float brocade = smoothstep(0.16, 0.84, fbm(uv * vec2(20.0, 28.0) + 11.7));
  vec3 border = mix(uBorderColor * 0.85, vec3(0.98, 0.93, 0.76), brocade * 0.55);
  paper = mix(paper, border, borderBand * 0.9);

  float innerFrame = 1.0 - smoothstep(0.084, 0.098, edgeDistance);
  paper *= 1.0 - innerFrame * 0.04;

  float ao = 1.0 - pow(abs(uv.x - 0.5) * 2.0, 2.4) * 0.08;
  paper *= ao;

  float textSample = texture2D(uTextMap, uv).a;
  float centerInk = smoothstep(0.42, 0.94, textSample);
  float edgeInk = smoothstep(0.04, 0.62, textSample);
  float diffusionNoise = snoise(uv * 18.0 + vec2(0.0, uProgress * 4.6)) * 0.5 + 0.5;
  float revealThreshold = uReveal + centerInk * 0.34 + diffusionNoise * 0.18 - 0.24;
  float inkBleed = edgeInk * smoothstep(0.02, 0.98, revealThreshold);
  float inkCore = centerInk * smoothstep(0.0, 0.2, uReveal + centerInk * 0.2);
  float inkAmount = clamp(max(inkBleed, inkCore), 0.0, 1.0);

  float inkTexture = 0.92 + (fbm(uv * 92.0 + 4.8) - 0.5) * 0.12;
  vec3 color = mix(paper, uInkColor, inkAmount * inkTexture);

  float wetHalo = max(inkBleed - inkCore, 0.0);
  color = mix(color, mix(uInkColor, paper, 0.34), wetHalo * 0.12);

  gl_FragColor = vec4(color, unfoldMask * uOpacity);
}
`;

function createCalligraphyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1800;
  canvas.height = 900;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create calligraphy canvas');
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const fontFamily = "'STXingkai','Xingkai SC','HanziPen SC','STKaiti','Kaiti SC','KaiTi',serif";
  const chars = [
    { value: '\u8bba', x: canvas.width * 0.35, y: canvas.height * 0.54, rotate: -0.11, size: 372 },
    { value: '\u8bed', x: canvas.width * 0.67, y: canvas.height * 0.5, rotate: 0.06, size: 384 },
  ];

  chars.forEach(({ value, x, y, rotate, size }) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotate);

    ctx.font = `700 ${Math.round(size * 1.02)}px ${fontFamily}`;
    ctx.fillStyle = 'rgba(26,26,27,0.08)';
    ctx.filter = 'blur(8px)';
    ctx.fillText(value, 0, 0);

    ctx.font = `700 ${Math.round(size * 1.005)}px ${fontFamily}`;
    ctx.fillStyle = 'rgba(26,26,27,0.12)';
    ctx.filter = 'blur(3px)';
    ctx.fillText(value, 0, 0);

    ctx.font = `700 ${size}px ${fontFamily}`;
    ctx.filter = 'none';
    ctx.strokeStyle = 'rgba(26,26,27,0.08)';
    ctx.lineWidth = 3;
    ctx.strokeText(value, 0, 0);
    ctx.fillStyle = 'rgba(26,26,27,0.98)';
    ctx.fillText(value, 0, 0);
    ctx.restore();
  });

  ctx.save();
  ctx.translate(canvas.width * 0.5, canvas.height * 0.72);
  ctx.font = `600 84px ${fontFamily}`;
  ctx.fillStyle = 'rgba(26,26,27,0.8)';
  ctx.fillText('\u6587\u5fc3\u8bc6\u5178', 0, 0);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createBackgroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1200;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create background canvas');
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#FBF7EE');
  gradient.addColorStop(0.58, '#F4EEDF');
  gradient.addColorStop(1, '#ECE3D1');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  for (let i = 0; i < 3200; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = Math.random() * 1.4 + 0.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.globalAlpha = 0.095;
  ctx.strokeStyle = '#8D8B82';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  for (let layer = 0; layer < 3; layer += 1) {
    ctx.beginPath();
    const baseY = canvas.height * (0.56 + layer * 0.07);
    ctx.moveTo(-80, baseY);
    for (let x = -80; x <= canvas.width + 80; x += 80) {
      const amplitude = 26 + layer * 12;
      const y = baseY + Math.sin(x * 0.006 + layer * 1.3) * amplitude;
      ctx.quadraticCurveTo(x - 30, y - amplitude * 0.6, x, y);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 0.055;
  ctx.fillStyle = '#9D9787';
  for (let i = 0; i < 7; i += 1) {
    const x = 140 + i * 200;
    const y = 560 + (i % 2) * 60;
    ctx.beginPath();
    ctx.moveTo(x - 90, y + 60);
    ctx.quadraticCurveTo(x - 20, y - 50, x + 30, y + 30);
    ctx.quadraticCurveTo(x + 70, y - 20, x + 120, y + 70);
    ctx.lineTo(x - 90, y + 70);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createEbonyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 2048;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create wood canvas');
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#2A1B17');
  gradient.addColorStop(0.5, '#150F0E');
  gradient.addColorStop(1, '#2C1F1A');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 180; i += 1) {
    const x = Math.random() * canvas.width;
    const width = Math.random() * 12 + 3;
    ctx.fillStyle = `rgba(95, 66, 52, ${Math.random() * 0.22 + 0.06})`;
    ctx.fillRect(x, 0, width, canvas.height);
  }

  ctx.globalAlpha = 0.26;
  for (let i = 0; i < 18; i += 1) {
    ctx.strokeStyle = `rgba(120, 86, 68, ${Math.random() * 0.5 + 0.18})`;
    ctx.lineWidth = Math.random() * 14 + 6;
    ctx.beginPath();
    ctx.moveTo(Math.random() * canvas.width, 0);
    for (let y = 0; y <= canvas.height; y += 140) {
      const x = canvas.width * 0.5 + Math.sin(y * 0.004 + i) * 120 + (Math.random() - 0.5) * 80;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1.4);
  return texture;
}

function createDustSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create dust sprite');
  }

  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.28, 'rgba(255,255,255,0.68)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildRoller(
  rollerMaterial: THREE.Material,
  accentMaterial: THREE.Material,
  jadeMaterial: THREE.Material,
  radius: number,
  height: number,
) {
  const group = new THREE.Group();

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 64), rollerMaterial);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  const centralSleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.13, radius * 1.13, height * 0.18, 10),
    accentMaterial,
  );
  centralSleeve.castShadow = true;
  group.add(centralSleeve);

  [-height * 0.31, height * 0.31].forEach((y) => {
    const jadeBand = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, radius * 0.34, 24),
      jadeMaterial,
    );
    jadeBand.position.y = y;
    jadeBand.castShadow = true;
    group.add(jadeBand);
  });

  [-height * 0.44, height * 0.44].forEach((y) => {
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.06, radius * 0.96, radius * 0.42, 16),
      accentMaterial,
    );
    collar.position.y = y;
    collar.castShadow = true;
    group.add(collar);
  });

  [-height * 0.52, height * 0.52].forEach((y) => {
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, radius * 0.16, 20),
      accentMaterial,
    );
    plate.position.y = y;
    plate.castShadow = true;
    group.add(plate);
  });

  [-height * 0.56, height * 0.56].forEach((y) => {
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.02, radius * 0.1, 18, 48),
      accentMaterial,
    );
    torus.rotation.x = Math.PI / 2;
    torus.position.y = y;
    torus.castShadow = true;
    group.add(torus);
  });

  [-height * 0.63, height * 0.63].forEach((y) => {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.56, radius * 0.84, radius * 0.46, 14),
      accentMaterial,
    );
    cap.position.y = y;
    cap.castShadow = true;
    group.add(cap);

    const jewel = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.28, 22, 18), jadeMaterial);
    jewel.position.y = y + Math.sign(y) * radius * 0.4;
    jewel.castShadow = true;
    group.add(jewel);
  });

  [-height * 0.22, height * 0.22].forEach((y, ringIndex) => {
    const beadCount = 10;
    for (let index = 0; index < beadCount; index += 1) {
      const angle = (index / beadCount) * Math.PI * 2 + ringIndex * 0.14;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.1, 14, 14), accentMaterial);
      bead.position.set(Math.cos(angle) * radius * 1.12, y, Math.sin(angle) * radius * 1.12);
      bead.castShadow = true;
      group.add(bead);
    }
  });

  return group;
}

export default function CinematicInkIntro({ uiRootRef }: CinematicInkIntroProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [finished, setFinished] = useState(false);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const uiRoot = uiRootRef.current;

    if (!host || !uiRoot) {
      return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      gsap.set(uiRoot, { opacity: 1, clearProps: 'all' });
      setFinished(true);
      return;
    }

    let animationFrame = 0;
    let disposed = false;
    let running = true;

    gsap.set(uiRoot, {
      opacity: 0.02,
      filter: 'blur(18px)',
      y: 20,
      scale: 0.988,
      pointerEvents: 'none',
      transformOrigin: '50% 50%',
    });
    gsap.set(host, { opacity: 1, scale: 1, transformOrigin: '50% 50%' });

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 100);
    camera.setFocalLength(50);
    camera.position.set(0.78, 0.12, 3.1);

    const backgroundTexture = createBackgroundTexture();
    const calligraphyTexture = createCalligraphyTexture();
    const ebonyTexture = createEbonyTexture();
    const dustTexture = createDustSprite();

    const ambientLight = new THREE.AmbientLight('#F3E8D8', 0.98);
    const hemisphere = new THREE.HemisphereLight('#FFF8EE', '#C8B79D', 0.6);
    const warmSpot = new THREE.SpotLight('#FFE6B5', 2.9, 24, Math.PI / 6.5, 0.72, 1.3);
    warmSpot.position.set(0, 2.3, 7.4);
    warmSpot.castShadow = true;
    warmSpot.shadow.mapSize.set(1536, 1536);
    warmSpot.shadow.radius = 8;
    warmSpot.shadow.bias = -0.00015;
    warmSpot.target.position.set(0, 0.1, 0);

    const fillLight = new THREE.DirectionalLight('#F6E9D3', 0.78);
    fillLight.position.set(-2.8, 1.4, 3.4);

    scene.add(ambientLight, hemisphere, warmSpot, warmSpot.target, fillLight);

    const backgroundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 12),
      new THREE.MeshBasicMaterial({
        map: backgroundTexture,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
      }),
    );
    backgroundPlane.position.set(0, 0.06, -7);
    scene.add(backgroundPlane);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(10.6, 6.2),
      new THREE.ShadowMaterial({ color: '#000000', opacity: 0.14 }),
    );
    shadowPlane.position.set(0, -0.08, -0.72);
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    const scrollGroup = new THREE.Group();
    scrollGroup.position.y = 0.06;
    scene.add(scrollGroup);

    const aspectHint = host.clientWidth / Math.max(host.clientHeight, 1);
    const rollerRadius = 0.16;
    const rollerHeight = 3.86;
    const closedRollerX = 0.16;
    const finalRollerX = THREE.MathUtils.clamp(aspectHint * 2.0, 3.45, 4.15);
    const paperWidth = finalRollerX * 2.0 - rollerRadius * 0.24;
    const paperHeight = 3.36;

    const rollerMaterial = new THREE.MeshPhysicalMaterial({
      map: ebonyTexture,
      color: '#241613',
      roughness: 0.5,
      metalness: 0.04,
      clearcoat: 0.18,
      clearcoatRoughness: 0.7,
    });
    const accentMaterial = new THREE.MeshPhysicalMaterial({
      color: '#B7965A',
      roughness: 0.24,
      metalness: 0.76,
      clearcoat: 0.34,
    });
    const jadeMaterial = new THREE.MeshPhysicalMaterial({
      color: '#7D9B8F',
      roughness: 0.3,
      metalness: 0.08,
      transmission: 0.06,
      thickness: 0.4,
      clearcoat: 0.4,
    });

    const leftRoller = buildRoller(rollerMaterial, accentMaterial, jadeMaterial, rollerRadius, rollerHeight);
    const rightRoller = buildRoller(rollerMaterial, accentMaterial, jadeMaterial, rollerRadius, rollerHeight);
    leftRoller.position.set(-closedRollerX, 0, 0.08);
    rightRoller.position.set(closedRollerX, 0, 0.08);
    scrollGroup.add(leftRoller, rightRoller);

    const paperMaterial = new THREE.ShaderMaterial({
      vertexShader: paperVertexShader,
      fragmentShader: paperFragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        uTextMap: { value: calligraphyTexture },
        uProgress: { value: 0 },
        uReveal: { value: 0 },
        uOpacity: { value: 1 },
        uPaperColor: { value: PAPER_COLOR.clone() },
        uInkColor: { value: INK_COLOR.clone() },
        uBorderColor: { value: BORDER_COLOR.clone() },
      },
    });

    const paperMesh = new THREE.Mesh(new THREE.PlaneGeometry(paperWidth, paperHeight, 140, 28), paperMaterial);
    paperMesh.scale.x = 0.03;
    paperMesh.position.z = 0.015;
    paperMesh.renderOrder = 2;
    scrollGroup.add(paperMesh);

    const dustCount = 320;
    const dustPositions = new Float32Array(dustCount * 3);
    const dustDrift = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i += 1) {
      const stride = i * 3;
      dustPositions[stride + 0] = (Math.random() - 0.5) * 9.2;
      dustPositions[stride + 1] = (Math.random() - 0.5) * 5.4;
      dustPositions[stride + 2] = Math.random() * 3.2 - 0.6;

      dustDrift[stride + 0] = (Math.random() - 0.5) * 0.035;
      dustDrift[stride + 1] = Math.random() * 0.045 + 0.012;
      dustDrift[stride + 2] = (Math.random() - 0.5) * 0.01;
    }

    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));

    const dustMaterial = new THREE.PointsMaterial({
      color: '#E5DAC7',
      map: dustTexture,
      alphaMap: dustTexture,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      size: 0.085,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    });

    const dust = new THREE.Points(dustGeometry, dustMaterial);
    dust.frustumCulled = false;
    scene.add(dust);

    const state: IntroState = {
      progress: 0,
      reveal: 0,
      opacity: 1,
    };

    const cameraFocus = { x: 0.46, y: 0.1, z: 0 };
    const clock = new THREE.Clock();
    let previousElapsed = 0;
    function resizeScene() {
      const rect = host.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    }

    function updateDust(delta: number) {
      const positions = dustGeometry.getAttribute('position') as THREE.BufferAttribute;
      const array = positions.array as Float32Array;
      for (let i = 0; i < dustCount; i += 1) {
        const stride = i * 3;
        array[stride + 0] += dustDrift[stride + 0] * delta;
        array[stride + 1] += dustDrift[stride + 1] * delta;
        array[stride + 2] += dustDrift[stride + 2] * delta;

        if (array[stride + 1] > 3.4) {
          array[stride + 1] = -3.2;
          array[stride + 0] = (Math.random() - 0.5) * 9.2;
          array[stride + 2] = Math.random() * 3.2 - 0.6;
        }
      }
      positions.needsUpdate = true;
    }

    resizeScene();

    const timeline = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      onComplete: () => {
        running = false;
        window.cancelAnimationFrame(animationFrame);
        gsap.set(uiRoot, { clearProps: 'all' });
        uiRoot.style.pointerEvents = '';
        setFinished(true);
      },
    });

    timeline
      .to(
        camera.position,
        {
          x: 0,
          y: 0.04,
          z: 8.05,
          duration: 2.2,
          ease: 'power2.out',
        },
        0,
      )
      .to(
        cameraFocus,
        {
          x: 0,
          y: 0.02,
          z: 0,
          duration: 2.1,
          ease: 'power2.out',
        },
        0,
      )
      .to(
        state,
        {
          progress: 1,
          duration: 2.75,
          ease: 'power2.out',
        },
        0.42,
      )
      .to(
        paperMesh.scale,
        {
          x: 1,
          duration: 2.75,
          ease: 'power2.out',
        },
        0.42,
      )
      .to(
        leftRoller.position,
        {
          x: -finalRollerX,
          duration: 2.75,
          ease: 'power2.out',
        },
        0.42,
      )
      .to(
        rightRoller.position,
        {
          x: finalRollerX,
          duration: 2.75,
          ease: 'power2.out',
        },
        0.42,
      )
      .to(
        state,
        {
          reveal: 1,
          duration: 1.08,
          ease: 'power2.out',
        },
        1.55,
      )
      .to({}, { duration: 1.4 }, 3.45)
      .to(
        leftRoller.position,
        {
          x: -closedRollerX,
          duration: 1.05,
          ease: 'power3.inOut',
        },
        4.6,
      )
      .to(
        rightRoller.position,
        {
          x: closedRollerX,
          duration: 1.05,
          ease: 'power3.inOut',
        },
        4.6,
      )
      .to(
        paperMesh.scale,
        {
          x: 0.03,
          duration: 1.05,
          ease: 'power3.inOut',
        },
        4.6,
      )
      .to(
        state,
        {
          progress: 0.05,
          duration: 1.05,
          ease: 'power3.inOut',
        },
        4.6,
      )
      .to(
        scrollGroup.scale,
        {
          x: 0.985,
          y: 0.985,
          z: 0.985,
          duration: 1.05,
          ease: 'power3.inOut',
        },
        4.6,
      )
      .to(
        state,
        {
          opacity: 0,
          duration: 0.48,
          ease: 'power2.out',
        },
        5.2,
      )
      .to(
        host,
        {
          opacity: 0,
          scale: 0.99,
          duration: 0.48,
          ease: 'power2.out',
        },
        5.2,
      )
      .to(
        uiRoot,
        {
          opacity: 1,
          filter: 'blur(0px)',
          y: 0,
          scale: 1,
          duration: 0.9,
          ease: 'power2.out',
        },
        5.0,
      );

    function render() {
      if (disposed || !running) {
        return;
      }

      animationFrame = window.requestAnimationFrame(render);

      const elapsed = clock.getElapsedTime();
      const delta = Math.min(elapsed - previousElapsed, 1 / 24);
      previousElapsed = elapsed;

      updateDust(delta);
      paperMaterial.uniforms.uProgress.value = state.progress;
      paperMaterial.uniforms.uReveal.value = state.reveal;
      paperMaterial.uniforms.uOpacity.value = state.opacity;

      camera.lookAt(cameraFocus.x, cameraFocus.y, cameraFocus.z);
      renderer.render(scene, camera);
    }

    render();

    const onResize = () => {
      resizeScene();
    };

    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      running = false;
      window.removeEventListener('resize', onResize);
      timeline.kill();
      window.cancelAnimationFrame(animationFrame);
      gsap.set(uiRoot, { clearProps: 'all' });
      uiRoot.style.pointerEvents = '';

      backgroundTexture.dispose();
      calligraphyTexture.dispose();
      ebonyTexture.dispose();
      dustTexture.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      paperMesh.geometry.dispose();
      paperMaterial.dispose();
      renderer.dispose();

      if (host.contains(renderer.domElement)) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [uiRootRef]);

  if (finished) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[140] overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="absolute inset-x-0 top-10 flex justify-center">
        <div className="rounded-full border border-[rgba(199,169,91,0.26)] bg-[rgba(249,244,232,0.36)] px-5 py-2 text-[11px] tracking-[0.32em] text-[rgba(50,39,30,0.6)] backdrop-blur-[2px]">
          {'\u5377\u8212\u6210\u7ae0'}
        </div>
      </div>
    </div>
  );
}
