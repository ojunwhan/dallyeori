/**
 * Three.js r128 — prototype/maduck_run_test.html 3D 장면만 모듈화.
 * 물리·소켓·입력은 raceV3Inline 등에서 담당하고, 여기서는 표시만 갱신한다.
 */
import * as THREE from 'three';
import { DUCK_3D_COLORS, RACE_ENGINE_PHYSICS, TAP_STRIDE_M } from './constants.js';

const PLAYER_LANE_X = -1.25;
const BOT_LANE_X = 1.25;
const LANE_LATERAL_MAX = 1.25;
const TRACK_WORLD_LEN = 400;
/**
 * 게임 dist(m)·탭당 TAP_STRIDE_M 과 3D 전진량 비율 — 몸통 길이에 가깝게 한 걸음이 보이도록 소폭 확대
 * 줄무늬 텍스처 주기도 동일 배율로 맞춤(한 탭 = 한 줄 주기 유지)
 */
const STRIDE_VISUAL_SCALE = 1.38;
const TRACK_STRIPE_CYCLE_M = TAP_STRIDE_M * STRIDE_VISUAL_SCALE;
const BASE_CAMERA_FOV = 63;
const IDLE_ENTER = 0.15;
const MAX_SPEED = RACE_ENGINE_PHYSICS.MAX_SPEED;
/** 몸통 좌우 횡 이동·머리 y — 기존식 유지, 신규 waddle 진폭에 맞게 축소 배율만 곱함 */
const BODY_SIDE_SWAY_MUL = 1.58;
/** 구 waddleAmp 최대(~1.46rad) 대비 신규 최대(~0.49×1.12rad) 비율로 횡 흔들림 정합 */
const LATERAL_SWAY_MATCH_WADDLE = 0.38;
/** 저속·고속 기우뚱 목표(도) → 라디안; 탭마다 waddleJitter(±12%) 곱해 다음 탭까지 유지 */
const WADDLE_DEG_SLOW = 12;
const WADDLE_DEG_FAST = 28;
const WADDLE_RAD_SLOW = (WADDLE_DEG_SLOW * Math.PI) / 180;
const WADDLE_RAD_FAST = (WADDLE_DEG_FAST * Math.PI) / 180;
const WADDLE_JITTER_FRAC = 0.12;
/** 탭 킥 목표 ≈11° + 탭마다 ±15% (다음 탭까지 유지 아님·순간량만; 감쇠는 기존 유지) */
const WOBBLE_IMPULSE_DEG = 11;
const WOBBLE_IMPULSE_BASE_RAD = (WOBBLE_IMPULSE_DEG * Math.PI) / 180;
const WOBBLE_JITTER_FRAC = 0.15;

/**
 * 경주 호스트가 방금 붙은 직후 clientWidth=0 인 브라우저 대비 — WebGL 0크기·검정 화면 방지
 * @param {HTMLElement} hostEl
 */
function hostViewportSize(hostEl) {
  const cw = hostEl.clientWidth || 0;
  const ch = hostEl.clientHeight || 0;
  if (cw >= 32 && ch >= 32) return { w: cw, h: ch };
  const iw = typeof window !== 'undefined' ? window.innerWidth : 300;
  const ih = typeof window !== 'undefined' ? window.innerHeight : 150;
  return { w: Math.max(320, cw || iw), h: Math.max(240, ch || ih) };
}

function clayMat(hex, r = 0.88, m = 0.04) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness: r,
    metalness: m,
  });
}

function duckColorsFromId(id) {
  const sid = (id && String(id).toLowerCase()) || 'duri';
  return DUCK_3D_COLORS[sid] || DUCK_3D_COLORS.duri;
}

function makeTrackStripeTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 32;
  const cx = c.getContext('2d');
  const h = 16;
  cx.fillStyle = '#3e2723';
  cx.fillRect(0, 0, 4, h);
  cx.fillStyle = '#8d6e63';
  cx.fillRect(0, h, 4, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.repeat.set(1, TRACK_WORLD_LEN / TRACK_STRIPE_CYCLE_M);
  return tex;
}

function makeDistanceLabelSprites() {
  const g = new THREE.Group();
  for (let m = 10; m <= 100; m += 10) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#ffc107';
    ctx.font = 'bold 56px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m + 'm', 128, 64);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sp = new THREE.Sprite(mat);
    sp.position.set(-3.5, 1.5, -m * STRIDE_VISUAL_SCALE);
    sp.scale.set(3.2, 1.6, 1);
    g.add(sp);
  }
  return g;
}

function makeDashedStripeGroup(x) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const half = TRACK_WORLD_LEN / 2;
  /** 간격 촘촘하면 메쉬 수백~수천 개로 폰 WebGL 다운(검정 화면) — 장식선만 소간격 유지 */
  for (let z = -half; z < half; z += 1) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.5, 1, 1), mat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.021, z + 0.25);
    grp.add(dash);
  }
  return grp;
}

/**
 * @param {number} bodyColor
 * @param {number} collarColor
 */
function createDuck(bodyColor, collarColor) {
  const bodyMat = clayMat(bodyColor);
  const bellyCol = new THREE.Color(bodyColor);
  bellyCol.lerp(new THREE.Color(0xffffff), 0.1);
  const bellyMat = clayMat(bellyCol.getHex());
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(bodyColor).getHSL(hsl);
  const browHex = hsl.l > 0.5 ? 0x333333 : bodyColor;
  const browMat = clayMat(browHex);
  const orange = clayMat(0xff6b00, 0.82);
  const white = clayMat(0xffffff, 0.9);
  const pupil = clayMat(0x0a0a0a, 0.75);
  const collarMat = clayMat(collarColor, 0.82);
  const emblemMat = clayMat(collarColor, 0.82);

  const root = new THREE.Group();
  root.position.set(0, 0, 0);

  const bodySquash = new THREE.Group();
  root.add(bodySquash);

  const bodyGeo = new THREE.SphereGeometry(0.52, 48, 40);
  bodyGeo.scale(1.05, 1.18, 0.92);
  const belly = new THREE.Mesh(bodyGeo, bellyMat);
  belly.position.y = 0.62;
  belly.castShadow = true;
  bodySquash.add(belly);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.09, 16, 48), collarMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 1.12, 0);
  collar.castShadow = true;
  bodySquash.add(collar);

  const logo = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 12, 24), emblemMat);
  logo.position.set(0, 1.12, 0.36);
  logo.rotation.y = 0;
  bodySquash.add(logo);

  const head = new THREE.Group();
  head.position.set(0, 1.38, 0.06);
  bodySquash.add(head);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.44, 40, 32), bodyMat);
  headMesh.castShadow = true;
  head.add(headMesh);

  const hairGroup = new THREE.Group();
  head.add(hairGroup);
  for (let i = -1; i <= 1; i++) {
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), browMat);
    tuft.position.set(i * 0.12, 0.46, -0.02);
    tuft.scale.set(0.7, 1.15, 0.65);
    hairGroup.add(tuft);
  }

  const browGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8, 1);
  const browL = new THREE.Mesh(browGeo, browMat);
  browL.rotation.z = 0.55;
  browL.rotation.x = 0.2;
  browL.position.set(-0.16, 0.08, 0.38);
  head.add(browL);
  const browR = new THREE.Mesh(browGeo, browMat);
  browR.rotation.z = -0.55;
  browR.rotation.x = 0.2;
  browR.position.set(0.16, 0.08, 0.38);
  head.add(browR);

  const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), white);
  eyeWhite.position.set(-0.17, 0.02, 0.39);
  head.add(eyeWhite);
  const eyeWhite2 = eyeWhite.clone();
  eyeWhite2.position.x = 0.17;
  head.add(eyeWhite2);
  const pup = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), pupil);
  pup.position.set(-0.15, 0.02, 0.47);
  head.add(pup);
  const pup2 = pup.clone();
  pup2.position.set(0.19, 0.02, 0.47);
  head.add(pup2);

  const beak = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), orange);
  beak.scale.set(1.35, 0.65, 0.85);
  beak.position.set(0, -0.06, 0.48);
  head.add(beak);

  const wingGeo = new THREE.SphereGeometry(0.22, 16, 12);
  wingGeo.scale(0.35, 0.75, 1);
  const leftWing = new THREE.Mesh(wingGeo, bodyMat);
  leftWing.position.set(-0.52, 0.75, -0.02);
  leftWing.rotation.z = 0.25;
  leftWing.rotation.y = -0.15;
  leftWing.castShadow = true;
  bodySquash.add(leftWing);
  const rightWing = leftWing.clone();
  rightWing.position.x = 0.52;
  rightWing.rotation.z = -0.25;
  rightWing.rotation.y = 0.15;
  bodySquash.add(rightWing);

  const tail = new THREE.Group();
  tail.position.set(0, 0.72, -0.48);
  bodySquash.add(tail);
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 12), bodyMat);
  tailMesh.rotation.x = -Math.PI / 2 + 0.35;
  tailMesh.position.set(0, 0.05, -0.12);
  tailMesh.castShadow = true;
  tail.add(tailMesh);

  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.22, 0.38, 0);
    bodySquash.add(hip);
    const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 0.24, 12, 1),
    orange,
  );
    upper.position.y = -0.12;
    upper.castShadow = true;
    hip.add(upper);
    const lower = new THREE.Group();
    lower.position.y = -0.22;
    hip.add(lower);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 10, 1), orange);
    shin.position.y = -0.1;
    shin.castShadow = true;
    lower.add(shin);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), orange);
    foot.scale.set(1.5, 0.35, 2.1);
    foot.position.y = -0.22;
    foot.castShadow = true;
    lower.add(foot);
    return { hip, lower, foot };
  }
  const L = makeLeg(-1);
  const R = makeLeg(1);

  return {
    root,
    body: bodySquash,
    head,
    hairGroup,
    leftLeg: { hip: L.hip, lower: L.lower, foot: L.foot },
    rightLeg: { hip: R.hip, lower: R.lower, foot: R.foot },
    leftWing,
    rightWing,
    tail,
    belly,
  };
}

function defaultDuckState() {
  return {
    dist: 0,
    lateral: 0,
    dirA: 0,
    v: 0,
    lastFoot: null,
    runPhase: null,
  };
}

/**
 * @param {HTMLElement} hostEl
 * @param {{ terrainKey?: string, myDuckId?: string, oppDuckId?: string, myServerSlot?: 0 | 1 }} [options]
 */
export function createRace3DRenderer(hostEl, options = {}) {
  if (!hostEl) throw new Error('createRace3DRenderer: hostEl required');

  const optsTerrainKey = options.terrainKey;
  void optsTerrainKey;

  /** 서버 슬롯 0=월드 왼쪽(-), 1=오른쪽(+) — 두 클라이언트 동일 월드 */
  const mySlot = options.myServerSlot === 0 || options.myServerSlot === 1 ? options.myServerSlot : 0;
  const myLaneX = mySlot === 1 ? BOT_LANE_X : PLAYER_LANE_X;
  const oppLaneX = mySlot === 1 ? PLAYER_LANE_X : BOT_LANE_X;

  const myId = options.myDuckId || 'duri';
  const oppId = options.oppDuckId || 'tori';
  const myCol = duckColorsFromId(myId);
  const oppCol = duckColorsFromId(oppId);

  /** 부모가 position:fixed full-screen 이면 절대 relative 로 깨지 않게 */
  const posBefore = hostEl.style.position;
  if (posBefore !== 'fixed' && (!posBefore || posBefore === 'static')) {
    hostEl.style.position = 'relative';
  }
  hostEl.style.overflow = 'hidden';

  const { w: w0, h: h0 } = hostViewportSize(hostEl);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87c5ff);
  scene.fog = new THREE.Fog(0xa8dcff, 15, 120);

  const camera = new THREE.PerspectiveCamera(BASE_CAMERA_FOV, w0 / h0, 0.1, 650);
  camera.position.set(0, 4.15, 8);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'default',
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setSize(w0, h0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  hostEl.appendChild(renderer.domElement);
  const cEl = renderer.domElement;
  cEl.style.cssText =
    'display:block;width:100%;height:100%;vertical-align:top;touch-action:none;outline:none;';

  const hemi = new THREE.HemisphereLight(0xfff5e6, 0x3d5c3a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.05);
  sun.position.set(4, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 220;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 200;
  sun.shadow.camera.bottom = -200;
  scene.add(sun);

  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(520, TRACK_WORLD_LEN + 40, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x4caf6a, roughness: 0.95, metalness: 0 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0;
  grass.receiveShadow = true;
  scene.add(grass);

  const trackStripeTex = makeTrackStripeTexture();
  const trackMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6, TRACK_WORLD_LEN, 1, 1),
    new THREE.MeshStandardMaterial({
      map: trackStripeTex,
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.02,
    }),
  );
  trackMesh.rotation.x = -Math.PI / 2;
  trackMesh.position.y = 0.01;
  trackMesh.receiveShadow = true;
  scene.add(trackMesh);

  const laneLineGeo = new THREE.PlaneGeometry(0.08, TRACK_WORLD_LEN);
  const laneLineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 });
  const laneLineL = new THREE.Mesh(laneLineGeo, laneLineMat);
  laneLineL.rotation.x = -Math.PI / 2;
  laneLineL.position.set(-2.5, 0.02, 0);
  scene.add(laneLineL);
  const laneLineGeoR = new THREE.PlaneGeometry(0.08, TRACK_WORLD_LEN);
  const laneLineMatR = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 });
  const laneLineR = new THREE.Mesh(laneLineGeoR, laneLineMatR);
  laneLineR.rotation.x = -Math.PI / 2;
  laneLineR.position.set(2.5, 0.02, 0);
  scene.add(laneLineR);

  scene.add(makeDashedStripeGroup(0));
  scene.add(makeDashedStripeGroup(-2.5));
  scene.add(makeDashedStripeGroup(2.5));

  scene.add(makeDistanceLabelSprites());

  const decorGroup = new THREE.Group();
  scene.add(decorGroup);
  const trunkMat = clayMat(0x5d4037);
  const leafMat = clayMat(0x2e7d32, 0.9);
  for (let i = -70; i <= 70; i++) {
    if (i === 0) continue;
    const z = i * 2.8 - 1.4;
    const side = i % 2 === 0 ? -1 : 1;
    const tx = side * (5.2 + (Math.abs(i) % 3) * 0.45);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.0, 8), trunkMat);
    trunk.position.set(tx, 0.5, z);
    trunk.castShadow = true;
    decorGroup.add(trunk);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), leafMat);
    leaf.position.set(tx, 1.15, z);
    leaf.scale.y = 0.85;
    leaf.castShadow = true;
    decorGroup.add(leaf);
  }

  const playerDuck = createDuck(myCol.body, myCol.collar);
  const oppDuck = createDuck(oppCol.body, oppCol.collar);
  const duckRoot = playerDuck.root;
  const oppRoot = oppDuck.root;
  duckRoot.position.set(myLaneX, 0, 0);
  oppRoot.position.set(oppLaneX, 0, 0);
  scene.add(duckRoot);
  scene.add(oppRoot);

  function makeFootContactShadowMesh() {
    const geo = new THREE.CircleGeometry(0.14, 20);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -0.5,
      polygonOffsetUnits: -0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }
  const playerFootShL = makeFootContactShadowMesh();
  const playerFootShR = makeFootContactShadowMesh();
  const oppFootShL = makeFootContactShadowMesh();
  const oppFootShR = makeFootContactShadowMesh();
  scene.add(playerFootShL, playerFootShR, oppFootShL, oppFootShR);

  const cdOverlayEl = document.createElement('div');
  cdOverlayEl.setAttribute('aria-hidden', 'true');
  cdOverlayEl.style.cssText =
    'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'pointer-events:none;z-index:20;font-size:min(22vw,120px);font-weight:900;color:#fff;' +
    'text-shadow:0 4px 24px rgba(0,0,0,.5);letter-spacing:-0.02em;gap:12px;';
  hostEl.appendChild(cdOverlayEl);

  const resultOverlayEl = document.createElement('div');
  resultOverlayEl.setAttribute('aria-hidden', 'true');
  resultOverlayEl.style.cssText =
    'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;' +
    'pointer-events:none;z-index:100;font-size:min(18vw,96px);font-weight:900;color:#fff;text-align:center;' +
    'text-shadow:0 4px 24px rgba(0,0,0,.5);padding:16px;box-sizing:border-box;';
  hostEl.appendChild(resultOverlayEl);

  let playerState = defaultDuckState();
  let oppState = defaultDuckState();

  const run = {
    phase: 0,
    idleT: 0,
    squashT: 0,
    dipImpulse: 0,
    wasContact: false,
  };
  const oppAnim = {
    idleT: 0,
    squashT: 0,
    dipImpulse: 0,
    wasContact: false,
  };

  let wobbleImpulse = 0;
  let oppWobbleImpulse = 0;
  /** 탭마다 굴려 다음 탭까지 유지 — waddle 진폭만 변조(wobble 킥은 별도 랜덤) */
  let playerWaddleJitter = 1;
  let oppWaddleJitter = 1;
  let playerPhaseAccum = 0;
  let oppRunPhase = 0;
  /** prototype/maduck_run_test.html — 카운트다운·출발 전 제자리 조깅(run.phase += dt*cadence) */
  let countdownJogT = 0;

  let internalRacing = false;
  /** 출발 시 화면이 흔들리던 원인: 짧은 FOV 사인 펄스(55±10°) — 제거 */
  let animId = 0;
  const clock = new THREE.Clock();
  const _vFootWorld = new THREE.Vector3();

  function updatePlayer(state) {
    if (!state || typeof state !== 'object') return;
    const { squash, ...rest } = state;
    Object.assign(playerState, rest);
    if (squash === true) {
      run.squashT = 1;
      if (!internalRacing) countdownJogT = 0.38;
      /** 픽시 스타일: 위상·착지 연출 모두 탭(squash) 시점에만 전진 */
      playerPhaseAccum += Math.PI;
      playerWaddleJitter = 1 + (Math.random() * 2 - 1) * WADDLE_JITTER_FRAC;
      const vNow =
        typeof playerState.v === 'number' && Number.isFinite(playerState.v) ? playerState.v : 0;
      const snTap = Math.min(1, vNow / MAX_SPEED);
      run.dipImpulse = 0.16 + snTap * 0.12;
      const foot = state.lastFoot;
      const wobMag =
        WOBBLE_IMPULSE_BASE_RAD * (1 + (Math.random() * 2 - 1) * WOBBLE_JITTER_FRAC);
      if (foot === 'R' || foot === 'right') wobbleImpulse = -wobMag;
      else if (foot === 'L' || foot === 'left') wobbleImpulse = wobMag;
    }
  }

  function updateOpponent(state) {
    if (!state || typeof state !== 'object') return;
    const { squash, ...rest } = state;
    Object.assign(oppState, rest);
    if (squash === true) {
      oppAnim.squashT = 1;
      oppRunPhase += Math.PI;
      oppWaddleJitter = 1 + (Math.random() * 2 - 1) * WADDLE_JITTER_FRAC;
      const vNow =
        typeof oppState.v === 'number' && Number.isFinite(oppState.v) ? oppState.v : 0;
      const snTapO = Math.min(1, vNow / MAX_SPEED);
      oppAnim.dipImpulse = 0.16 + snTapO * 0.12;
      const foot = state.lastFoot;
      const owobMag =
        WOBBLE_IMPULSE_BASE_RAD * (1 + (Math.random() * 2 - 1) * WOBBLE_JITTER_FRAC);
      if (foot === 'R' || foot === 'right') oppWobbleImpulse = -owobMag;
      else if (foot === 'L' || foot === 'left') oppWobbleImpulse = owobMag;
    }
  }

  function setCountdown(val) {
    resultOverlayEl.style.display = 'none';
    if (val === 0) {
      cdOverlayEl.textContent = 'GO!';
    } else if (val >= 1 && val <= 3) {
      cdOverlayEl.textContent = String(val);
    } else {
      cdOverlayEl.textContent = '';
    }
  }

  function setRacing() {
    internalRacing = true;
    cdOverlayEl.textContent = '';
  }

  function setEnding(result, callbacks = {}) {
    internalRacing = false;
    const w = result && result.winner;
    let main = 'DRAW!';
    let col = '#FFD700';
    if (w === 'win') {
      main = 'WIN!';
      col = '#4CAF50';
    } else if (w === 'lose') {
      main = 'LOSE!';
      col = '#f44336';
    }
    const myD = result && Number.isFinite(result.myDist) ? result.myDist : playerState.dist;
    const opD = result && Number.isFinite(result.oppDist) ? result.oppDist : oppState.dist;
    resultOverlayEl.innerHTML =
      `<span style="color:${col}">${main}</span>` +
      `<div style="font-size:min(5vw,28px);font-weight:600;opacity:0.95;margin-top:12px;color:#fff">` +
      `나: ${myD.toFixed(3)}m | 상대: ${opD.toFixed(3)}m</div>`;
    resultOverlayEl.style.display = 'flex';

    const btnWrap = document.createElement('div');
    btnWrap.style.cssText =
      'display:flex;gap:16px;margin-top:20px;pointer-events:all;';
    btnWrap.addEventListener('pointerdown', (e) => e.stopPropagation());
    btnWrap.addEventListener('touchstart', (e) => e.stopPropagation());

    const btnRematch = document.createElement('button');
    btnRematch.textContent = '한판더';
    btnRematch.style.cssText =
      'padding:12px 28px;font-size:18px;font-weight:700;border-radius:12px;border:none;background:#4CAF50;color:#fff;cursor:pointer;';
    btnRematch.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (typeof callbacks.onRematch === 'function') callbacks.onRematch();
    };

    const btnRecord = document.createElement('button');
    btnRecord.textContent = '기록보기';
    btnRecord.style.cssText =
      'padding:12px 28px;font-size:18px;font-weight:700;border-radius:12px;border:none;background:rgba(255,255,255,0.25);color:#fff;cursor:pointer;';
    btnRecord.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (typeof callbacks.onViewRecord === 'function') callbacks.onViewRecord();
    };

    btnWrap.appendChild(btnRematch);
    btnWrap.appendChild(btnRecord);
    resultOverlayEl.appendChild(btnWrap);
    resultOverlayEl.style.pointerEvents = 'all';
  }

  function resize() {
    const { w, h } = hostViewportSize(hostEl);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function disposeObject3D(obj) {
    if (!obj) return;
    const seenGeom = new Set();
    const seenMat = new Set();
    obj.traverse((o) => {
      if (o.geometry && !seenGeom.has(o.geometry)) {
        seenGeom.add(o.geometry);
        o.geometry.dispose();
      }
      const mat = o.material;
      if (!mat) return;
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        if (seenMat.has(m)) continue;
        seenMat.add(m);
        if (m.map) m.map.dispose();
        m.dispose();
      }
    });
  }

  function dispose() {
    if (animId) cancelAnimationFrame(animId);
    animId = 0;
    renderer.dispose();
    disposeObject3D(scene);
    trackStripeTex.dispose();
    // canvas는 DOM에 남겨두고 renderer만 dispose — 검은 화면 방지
    // if (renderer.domElement.parentNode) {
    //   renderer.domElement.parentNode.removeChild(renderer.domElement);
    // }
    if (cdOverlayEl.parentNode) cdOverlayEl.parentNode.removeChild(cdOverlayEl);
    if (resultOverlayEl.parentNode) resultOverlayEl.parentNode.removeChild(resultOverlayEl);
    if (!prevHostPos || prevHostPos === 'static') hostEl.style.position = '';
  }

  function renderLoop() {
    animId = requestAnimationFrame(renderLoop);
    const dt = Math.min(clock.getDelta(), 0.05);

    const distP = playerState.dist;
    const distO = oppState.dist;
    const latP = Math.max(-LANE_LATERAL_MAX, Math.min(LANE_LATERAL_MAX, playerState.lateral));
    const latO = Math.max(-LANE_LATERAL_MAX, Math.min(LANE_LATERAL_MAX, oppState.lateral));
    duckRoot.position.z = -distP * STRIDE_VISUAL_SCALE;
    duckRoot.position.x = myLaneX + latP;
    oppRoot.position.z = -distO * STRIDE_VISUAL_SCALE;
    oppRoot.position.x = oppLaneX + latO;

    const dirP = playerState.dirA;
    const dirO = oppState.dirA;
    duckRoot.rotation.y = Math.PI + dirP;
    oppRoot.rotation.y = Math.PI + dirO;

    const vP = playerState.v;
    const vO = oppState.v;
    countdownJogT = Math.max(0, countdownJogT - dt);
    const runningP =
      (internalRacing && vP >= IDLE_ENTER) || (!internalRacing && countdownJogT > 0);
    const runningO = internalRacing && vO >= IDLE_ENTER;

    if (runningP) {
      run.idleT = 0;
    } else {
      run.idleT += dt;
    }
    if (runningO) {
      oppAnim.idleT = 0;
    } else {
      oppAnim.idleT += dt;
    }

    const speedNP = Math.min(1, vP / MAX_SPEED);
    const speedNO = Math.min(1, vO / MAX_SPEED);

    if (playerState.runPhase != null && Number.isFinite(playerState.runPhase)) {
      playerPhaseAccum = playerState.runPhase;
    }
    if (oppState.runPhase != null && Number.isFinite(oppState.runPhase)) {
      oppRunPhase = oppState.runPhase;
    }

    const ph = playerState.runPhase != null ? playerState.runPhase : playerPhaseAccum;
    const bph = oppState.runPhase != null ? oppState.runPhase : oppRunPhase;

    wobbleImpulse *= Math.pow(0.88, dt * 60);
    oppWobbleImpulse *= Math.pow(0.88, dt * 60);

    run.squashT = Math.max(0, run.squashT - dt * 5);
    const sq = run.squashT;
    playerDuck.body.scale.set(1 + sq * 0.22, 1 - sq * 0.28, 1 + sq * 0.12);

    const bodySquashGroup = playerDuck.body;
    const headGroup = playerDuck.head;
    const tailPivot = playerDuck.tail;
    const wingL = playerDuck.leftWing;
    const wingR = playerDuck.rightWing;
    const legLU = playerDuck.leftLeg.hip;
    const legLL = playerDuck.leftLeg.lower;
    const legRU = playerDuck.rightLeg.hip;
    const legRL = playerDuck.rightLeg.lower;

    if (runningP) {
      const swing = 0.85 + speedNP * 0.55;
      const thighAmp = 0.95 + speedNP * 0.5;
      const leftPhase = ph;
      const rightPhase = ph + Math.PI;
      legLU.rotation.x = Math.sin(leftPhase) * thighAmp;
      /** 발뒤꿈치 스윙 시 발목 굽힘 — 발바닥 노출 살짝 강화(~25%) */
      const shankBend = swing * 0.9 * 1.25;
      legLL.rotation.x = Math.max(0, -Math.sin(leftPhase + 0.4) * shankBend);
      legRU.rotation.x = Math.sin(rightPhase) * thighAmp;
      legRL.rotation.x = Math.max(0, -Math.sin(rightPhase + 0.4) * shankBend);
      const waddleAmpBase =
        WADDLE_RAD_SLOW + speedNP * (WADDLE_RAD_FAST - WADDLE_RAD_SLOW);
      const waddleAmp = waddleAmpBase * playerWaddleJitter;
      const waddle = waddleAmp * Math.sin(ph) + wobbleImpulse;
      bodySquashGroup.rotation.z = waddle + dirP * 1.75;
      bodySquashGroup.position.x =
        Math.sin(ph) *
        (0.07 + speedNP * 0.22) *
        1.85 *
        BODY_SIDE_SWAY_MUL *
        LATERAL_SWAY_MATCH_WADDLE;
      const leanF = speedNP * 0.38;
      bodySquashGroup.rotation.x = leanF + Math.sin(ph * 2) * 0.055 * speedNP;
      headGroup.rotation.x = Math.sin(ph * 2) * (0.18 + speedNP * 0.2) * 2.0 * 1.2;
      headGroup.rotation.y =
        Math.sin(ph) *
        (0.1 + speedNP * 0.075) *
        2.0 *
        speedNP *
        BODY_SIDE_SWAY_MUL *
        LATERAL_SWAY_MATCH_WADDLE;
      tailPivot.rotation.y = Math.sin(ph + 0.5) * (0.55 + speedNP * 0.65);
      tailPivot.rotation.x = Math.sin(ph * 2) * 0.12 * speedNP;
      run.dipImpulse *= Math.pow(0.82, dt * 60);
      duckRoot.position.y = -run.dipImpulse * 0.35;
      const wingOpen = speedNP * 0.55;
      wingL.rotation.y = -0.15 - wingOpen * 0.35;
      wingR.rotation.y = 0.15 + wingOpen * 0.35;
      wingL.rotation.z = 0.25 + Math.sin(ph * 2) * 0.06 * speedNP;
      wingR.rotation.z = -0.25 - Math.sin(ph * 2) * 0.06 * speedNP;
    } else {
      const id = run.idleT;
      headGroup.rotation.y = Math.sin(id * 1.1) * 0.35;
      headGroup.rotation.x = Math.sin(id * 0.7) * 0.06;
      bodySquashGroup.rotation.z = Math.sin(id * 0.9) * 0.06 + dirP * 1.5;
      bodySquashGroup.rotation.x = Math.sin(id * 0.5) * 0.03;
      legLU.rotation.x = Math.sin(id * 2.2) * 0.12;
      legRU.rotation.x = Math.sin(id * 2.2 + Math.PI) * 0.12;
      legLL.rotation.x = 0.05;
      legRL.rotation.x = 0.05;
      tailPivot.rotation.y = Math.sin(id * 1.3) * 0.15;
      wingL.rotation.y = -0.15;
      wingR.rotation.y = 0.15;
      duckRoot.position.y = duckRoot.position.y * (1 - dt * 6);
    }

    oppAnim.squashT = Math.max(0, oppAnim.squashT - dt * 5);
    const bsq = oppAnim.squashT;
    oppDuck.body.scale.set(1 + bsq * 0.22, 1 - bsq * 0.28, 1 + bsq * 0.12);

    if (runningO) {
      const bswing = 0.85 + speedNO * 0.55;
      const bthigh = 0.95 + speedNO * 0.5;
      oppDuck.leftLeg.hip.rotation.x = Math.sin(bph) * bthigh;
      const oppShankBend = bswing * 0.9 * 1.25;
      oppDuck.leftLeg.lower.rotation.x = Math.max(0, -Math.sin(bph + 0.4) * oppShankBend);
      oppDuck.rightLeg.hip.rotation.x = Math.sin(bph + Math.PI) * bthigh;
      oppDuck.rightLeg.lower.rotation.x = Math.max(
        0,
        -Math.sin(bph + Math.PI + 0.4) * oppShankBend,
      );
      const bwadBase =
        WADDLE_RAD_SLOW + speedNO * (WADDLE_RAD_FAST - WADDLE_RAD_SLOW);
      const bwad = bwadBase * oppWaddleJitter;
      const bwaddle = bwad * Math.sin(bph) + oppWobbleImpulse;
      oppDuck.body.rotation.z = bwaddle + dirO * 1.75;
      oppDuck.body.position.x =
        Math.sin(bph) *
        (0.07 + speedNO * 0.22) *
        1.85 *
        BODY_SIDE_SWAY_MUL *
        LATERAL_SWAY_MATCH_WADDLE;
      const blev = speedNO * 0.38;
      oppDuck.body.rotation.x = blev + Math.sin(bph * 2) * 0.055 * speedNO;
      oppDuck.head.rotation.x = Math.sin(bph * 2) * (0.18 + speedNO * 0.2) * 2.0 * 1.2;
      oppDuck.head.rotation.y =
        Math.sin(bph) *
        (0.1 + speedNO * 0.075) *
        2.0 *
        speedNO *
        BODY_SIDE_SWAY_MUL *
        LATERAL_SWAY_MATCH_WADDLE;
      oppDuck.tail.rotation.y = Math.sin(bph + 0.5) * (0.55 + speedNO * 0.65);
      oppDuck.tail.rotation.x = Math.sin(bph * 2) * 0.12 * speedNO;
      const bwingO = speedNO * 0.55;
      oppDuck.leftWing.rotation.y = -0.15 - bwingO * 0.35;
      oppDuck.rightWing.rotation.y = 0.15 + bwingO * 0.35;
      oppDuck.leftWing.rotation.z = 0.25 + Math.sin(bph * 2) * 0.06 * speedNO;
      oppDuck.rightWing.rotation.z = -0.25 - Math.sin(bph * 2) * 0.06 * speedNO;
      oppAnim.dipImpulse *= Math.pow(0.82, dt * 60);
      oppRoot.position.y = -oppAnim.dipImpulse * 0.35;
    } else {
      const bid = oppAnim.idleT;
      oppDuck.head.rotation.y = Math.sin(bid * 1.1) * 0.35;
      oppDuck.head.rotation.x = Math.sin(bid * 0.7) * 0.06;
      oppDuck.body.rotation.z = Math.sin(bid * 0.9) * 0.06 + dirO * 1.5;
      oppDuck.body.rotation.x = Math.sin(bid * 0.5) * 0.03;
      oppDuck.leftLeg.hip.rotation.x = Math.sin(bid * 2.2) * 0.12;
      oppDuck.rightLeg.hip.rotation.x = Math.sin(bid * 2.2 + Math.PI) * 0.12;
      oppDuck.leftLeg.lower.rotation.x = 0.05;
      oppDuck.rightLeg.lower.rotation.x = 0.05;
      oppDuck.tail.rotation.y = Math.sin(bid * 1.3) * 0.15;
      oppDuck.leftWing.rotation.y = -0.15;
      oppDuck.rightWing.rotation.y = 0.15;
      oppRoot.position.y = oppRoot.position.y * (1 - dt * 6);
    }

    duckRoot.updateMatrixWorld(true);
    oppRoot.updateMatrixWorld(true);
    playerDuck.leftLeg.foot.getWorldPosition(_vFootWorld);
    playerFootShL.position.set(_vFootWorld.x, 0.01, _vFootWorld.z);
    playerDuck.rightLeg.foot.getWorldPosition(_vFootWorld);
    playerFootShR.position.set(_vFootWorld.x, 0.01, _vFootWorld.z);
    oppDuck.leftLeg.foot.getWorldPosition(_vFootWorld);
    oppFootShL.position.set(_vFootWorld.x, 0.01, _vFootWorld.z);
    oppDuck.rightLeg.foot.getWorldPosition(_vFootWorld);
    oppFootShR.position.set(_vFootWorld.x, 0.01, _vFootWorld.z);

    /** 트랙 X 중앙 고정, Z만 내 오리 거리(시각 스케일) 따라 추적 */
    const distSafe = Number.isFinite(distP) ? distP : 0;
    const camX = 0;
    const camFollowDist = Math.max(0, distSafe) * STRIDE_VISUAL_SCALE;
    const camTargetPos = new THREE.Vector3(camX, 1.35, -camFollowDist);
    const camDesired = new THREE.Vector3(camX, 4.15, -camFollowDist + 8);
    camera.position.lerp(camDesired, 0.05);
    camera.lookAt(camTargetPos);

    renderer.render(scene, camera);
  }

  renderLoop();

  return {
    updatePlayer,
    updateOpponent,
    setCountdown,
    setRacing,
    setEnding,
    resize,
    dispose,
    getCanvas: () => renderer.domElement,
  };
}
