/**
 * Three.js r128 — prototype/maduck_run_test.html 3D 장면만 모듈화.
 * 물리·소켓·입력은 raceV3Inline 등에서 담당하고, 여기서는 표시만 갱신한다.
 */
import * as THREE from 'three';
import { DUCK_3D_COLORS, RACE_ENGINE_PHYSICS, TAP_STRIDE_M } from './constants.js';

const PLAYER_LANE_X = -0.82;
const BOT_LANE_X = 0.82;
const LANE_LATERAL_MAX = 0.6;
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

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeDistanceLabelTexture(m, flash) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const W = 256, H = 128, pad = 12, r = 30;
  const bg = ctx.createLinearGradient(0, pad, 0, H - pad);
  if (flash) { bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#ffe64d'); }
  else { bg.addColorStop(0, '#48a8ff'); bg.addColorStop(1, '#1f6fd0'); }
  roundRectPath(ctx, pad, pad, W - pad * 2, H - pad * 2, r);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = flash ? '#ff8a1e' : '#ffffff';
  ctx.stroke();
  ctx.fillStyle = flash ? '#e23a1e' : '#ffffff';
  ctx.font = '900 60px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.28)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.fillText(m + 'm', W / 2, H / 2 + 3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

function makeSoftGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,150,0.9)');
  g.addColorStop(1, 'rgba(255,200,60,0)');
  x.fillStyle = g;
  x.beginPath(); x.arc(64, 64, 64, 0, 7); x.fill();
  return new THREE.CanvasTexture(c);
}

function makeCrowdStands() {
  const group = new THREE.Group();
  const chash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const TIERS = 4, PER = 130;
  const Z0 = -3, Z1 = -324;
  const spacingZ = (Z1 - Z0) / PER;
  const baseX = 7.2, tierDX = 1.0, tierDY = 0.74;
  const palette = [
    0xffd54f, 0xff8a65, 0xfff176, 0x4fc3f7, 0xaed581, 0xf06292,
    0xba68c8, 0xffffff, 0x90caf9, 0xffcc80, 0x80deea, 0xef9a9a,
  ];
  const sides = [-1, 1];
  const total = TIERS * PER * sides.length;

  // 앞을 보는 오리: 통통한 몸통 + 부리 + 눈 2개 (전부 InstancedMesh = draw call 소수, 폰 안전)
  // 응원 흔들림 — GPU 셰이더로(각자 랜덤 위상). CPU 부담 0, uTime uniform 하나만 매 프레임 갱신
  const bodyMat = clayMat(0xffffff, 0.92);
  const beakMat = clayMat(0xff7a1a, 0.8);
  const cheerShaders = [];
  const addCheer = (mat) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uCheer = { value: 0.08 };
      shader.vertexShader = 'uniform float uTime;\nuniform float uCheer;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        [
          'vec4 mvPosition = vec4( transformed, 1.0 );',
          '#ifdef USE_INSTANCING',
          '  mvPosition = instanceMatrix * mvPosition;',
          '  float _seed = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 0.9;',
          '  mvPosition.y += abs(sin(uTime * 9.0 + _seed)) * 0.34 * uCheer;',
          '  mvPosition.x += sin(uTime * 6.0 + _seed * 1.3) * 0.14 * uCheer;',
          '#endif',
          'mvPosition = modelViewMatrix * mvPosition;',
          'gl_Position = projectionMatrix * mvPosition;',
        ].join('\n')
      );
      cheerShaders.push(shader);
    };
  };
  addCheer(bodyMat);
  addCheer(beakMat);
  const bodies = new THREE.InstancedMesh(new THREE.SphereGeometry(0.44, 8, 6), bodyMat, total);
  const beaks = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), beakMat, total);
  const standMat = clayMat(0x9aa7b0, 0.95);
  const railMat = clayMat(0xd34f4f, 0.85);

  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const sVec = new THREE.Vector3();
  const beakScale = new THREE.Vector3();
  const qId = new THREE.Quaternion();
  const col = new THREE.Color();
  let idx = 0;
  for (const side of sides) {
    const inward = -side; // 관중은 트랙(중앙)을 바라본다 → 얼굴이 안쪽
    for (let t = 0; t < TIERS; t++) {
      const y = 0.7 + t * tierDY;
      const x = side * (baseX + t * tierDX);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.4, Math.abs(Z1 - Z0)), standMat);
      stand.position.set(x, y - 0.5, (Z0 + Z1) / 2);
      group.add(stand);
      if (t === 0) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, Math.abs(Z1 - Z0)), railMat);
        rail.position.set(side * (baseX - 0.62), y - 0.15, (Z0 + Z1) / 2);
        group.add(rail);
      }
      for (let r = 0; r < PER; r++) {
        const z = Z0 + r * spacingZ;
        const jz = (chash(idx) - 0.5) * 0.32;
        const jx = (chash(idx + 3) - 0.5) * 0.32;
        const s = 0.95 + chash(idx + 7) * 0.6; // 더 큼
        const bx = x + jx, by = y + s * 0.06, bz = z + jz;
        sVec.set(s, s, s);
        // 몸통
        v.set(bx, by, bz);
        m.compose(v, qId, sVec);
        bodies.setMatrixAt(idx, m);
        col.setHex(palette[Math.floor(chash(idx + 11) * palette.length)]);
        bodies.setColorAt(idx, col);
        // 넙적한 오리 주둥이(눌린 구) — 트랙 향해
        beakScale.set(0.46 * s, 0.13 * s, 0.36 * s);
        v.set(bx + inward * 0.42 * s, by - 0.03 * s, bz);
        m.compose(v, qId, beakScale);
        beaks.setMatrixAt(idx, m);
        idx++;
      }
    }
  }
  bodies.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  beaks.instanceMatrix.needsUpdate = true;
  group.add(bodies);
  group.add(beaks);
  group.userData.cheerShaders = cheerShaders;
  return group;
}

function makeBannerTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  roundRectPath(x, 4, 4, 504, 120, 26); x.fill();
  x.lineWidth = 8; x.strokeStyle = 'rgba(255,255,255,.85)'; x.stroke();
  x.fillStyle = fg;
  x.font = '900 82px system-ui,sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 70);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

function makeFinishArch() {
  const g = new THREE.Group();
  const z = -100 * STRIDE_VISUAL_SCALE;
  const postMat = clayMat(0xffffff, 0.9);
  const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 5.2, 10);
  const pL = new THREE.Mesh(postGeo, postMat); pL.position.set(-3.7, 2.6, z); g.add(pL);
  const pR = new THREE.Mesh(postGeo, postMat); pR.position.set(3.7, 2.6, z); g.add(pR);
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(8.2, 1.4),
    new THREE.MeshBasicMaterial({ map: makeBannerTexture('FINISH', '#e23a2e', '#ffffff'), transparent: true, side: THREE.DoubleSide }),
  );
  banner.position.set(0, 5.0, z);
  g.add(banner);
  return g;
}

function makeFlagLine() {
  const g = new THREE.Group();
  const flagCols = [0xff5252, 0xffca28, 0x42a5f5, 0x66bb6a, 0xab47bc, 0xff7043];
  const poleMat = clayMat(0xf5f5f5, 0.9);
  const zEnd = -100 * STRIDE_VISUAL_SCALE;
  const step = 6;
  let k = 0;
  for (let side = -1; side <= 1; side += 2) {
    for (let z = -2; z >= zEnd - 2; z -= step) {
      const x = side * 4.3;
      const ph = 2.6;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, ph, 6), poleMat);
      pole.position.set(x, ph / 2, z);
      g.add(pole);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(0, 0.55); shape.lineTo(-side * 0.7, 0.27); shape.lineTo(0, 0);
      const flag = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: flagCols[k % flagCols.length], side: THREE.DoubleSide }),
      );
      flag.position.set(x, ph - 0.12, z);
      g.add(flag);
      k++;
    }
  }
  return g;
}

function makeStartText() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.font = '900 150px system-ui,sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 16; x.strokeStyle = 'rgba(0,0,0,0.4)';
  x.strokeText('START', 256, 140);
  x.fillStyle = '#ffffff';
  x.fillText('START', 256, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 2.7),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.03, -3.4);
  return mesh;
}

function makeDistanceLabelSprites() {
  const g = new THREE.Group();
  const glowTex = makeSoftGlowTexture();
  for (let m = 10; m <= 100; m += 10) {
    const normalTex = makeDistanceLabelTexture(m, false);
    const flashTex = makeDistanceLabelTexture(m, true);
    const mat = new THREE.SpriteMaterial({ map: normalTex, transparent: true });
    const sp = new THREE.Sprite(mat);
    sp.position.set(-3.5, 1.6, -m * STRIDE_VISUAL_SCALE);
    const bsx = 3.4, bsy = 1.7;
    sp.scale.set(bsx, bsy, 1);
    // 통과 순간 터지는 발광 후광 — 팻말은 안 커지고(오리 안 가림) 빛만 확 터진다
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    const glowSp = new THREE.Sprite(glowMat);
    glowSp.scale.set(bsx * 1.7, bsy * 2.2, 1);
    glowSp.position.z = 0.01;
    sp.add(glowSp);
    sp.userData = { m, normalTex, flashTex, bsx, bsy, glowMat, popT0: -1, passed: false };
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
    collar,
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

  // 출발선 — 흑백 체크무늬 바 (오리 바로 앞, 고해상도로 선명하게)
  {
    const sc = document.createElement('canvas');
    sc.width = 256;
    sc.height = 64;
    const sx = sc.getContext('2d');
    const cols = 16,
      rows = 4;
    const cw = sc.width / cols,
      ch = sc.height / rows;
    for (let a = 0; a < cols; a++)
      for (let b = 0; b < rows; b++) {
        sx.fillStyle = (a + b) % 2 ? '#141414' : '#ffffff';
        sx.fillRect(a * cw, b * ch, cw, ch);
      }
    const stex = new THREE.CanvasTexture(sc);
    stex.magFilter = THREE.NearestFilter;
    stex.anisotropy = 8;
    const startBar = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 1.15),
      new THREE.MeshBasicMaterial({ map: stex }),
    );
    startBar.rotation.x = -Math.PI / 2;
    startBar.position.set(0, 0.04, -0.6);
    scene.add(startBar);
  }

  scene.add(makeDashedStripeGroup(0));
  scene.add(makeDashedStripeGroup(-2.5));
  scene.add(makeDashedStripeGroup(2.5));

  const distLabels = makeDistanceLabelSprites();
  scene.add(distLabels);

  const decorGroup = new THREE.Group();
  scene.add(decorGroup);
  const dhash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const leafMats = [
    clayMat(0x2e7d32, 0.9), // 진초록
    clayMat(0x43a047, 0.9), // 초록
    clayMat(0x66bb6a, 0.9), // 민트초록
    clayMat(0x7cb342, 0.9), // 라임
    clayMat(0x9ccc65, 0.9), // 연두
    clayMat(0xf48fb1, 0.9), // 벚꽃 분홍
    clayMat(0xffb74d, 0.9), // 가을 단풍
  ];
  const trunkMats = [clayMat(0x5d4037), clayMat(0x6d4c41), clayMat(0x795548), clayMat(0x8d6e63)];
  // 나무를 관중석 바깥(더 멀리)으로 — 종류·색·크기 다양하게 (그림자 제외로 성능 유지)
  for (let i = -60; i <= 60; i++) {
    if (i === 0) continue;
    const r1 = dhash(i), r2 = dhash(i + 100), r3 = dhash(i + 200), r4 = dhash(i + 300);
    const z = i * 3.2 - 1.4;
    const side = i % 2 === 0 ? -1 : 1;
    const tx = side * (12.0 + r4 * 3.5);
    const th = 1.8 + r1 * 1.8;
    const trunkMat = trunkMats[Math.floor(r3 * trunkMats.length)];
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, th, 6), trunkMat);
    trunk.position.set(tx, th / 2, z);
    decorGroup.add(trunk);
    let li;
    if (r2 > 0.9) li = 5 + (r1 > 0.5 ? 1 : 0); // 가끔 벚꽃/단풍
    else li = Math.floor(r1 * 5);              // 대개 초록 계열
    const leafMat = leafMats[li];
    const leafR = 1.0 + r2 * 0.8;
    if (r3 > 0.8) {
      // 침엽수(원뿔 3층)
      for (let c = 0; c < 3; c++) {
        const cr = leafR * (1.05 - c * 0.26);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(cr, leafR * 1.15, 7), leafMat);
        cone.position.set(tx, th + leafR * 0.2 + c * leafR * 0.6, z);
        decorGroup.add(cone);
      }
    } else {
      // 활엽수(구 잎 덩이 2~3)
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(leafR, 8, 6), leafMat);
      leaf.position.set(tx, th + leafR * 0.6, z);
      leaf.scale.y = 0.92;
      decorGroup.add(leaf);
      const leaf2 = new THREE.Mesh(new THREE.SphereGeometry(leafR * 0.72, 7, 5), leafMat);
      leaf2.position.set(tx + (r1 - 0.5) * leafR * 0.9, th + leafR * 1.0, z - leafR * 0.2);
      decorGroup.add(leaf2);
      if (r4 > 0.6) {
        const leaf3 = new THREE.Mesh(new THREE.SphereGeometry(leafR * 0.6, 7, 5), leafMat);
        leaf3.position.set(tx - (r2 - 0.5) * leafR * 0.9, th + leafR * 1.15, z + leafR * 0.25);
        decorGroup.add(leaf3);
      }
    }
  }

  const crowd = makeCrowdStands();
  scene.add(crowd);
  let crowdCheer = 0.08;
  let crowdCheerTarget = 0.08;
  scene.add(makeFlagLine());
  scene.add(makeStartText());

  // 하늘 구름 — 허전한 하늘 채우기 (뭉게구름 여러 겹)
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  for (let i = 0; i < 11; i++) {
    const cg = new THREE.Group();
    const puffs = 3 + (i % 2);
    for (let p = 0; p < puffs; p++) {
      const r = 1.7 + Math.abs(Math.sin(i * 3.1 + p * 1.7)) * 1.3;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), cloudMat);
      puff.position.set(p * 2.0 - puffs, Math.sin(i + p) * 0.6, 0);
      puff.scale.y = 0.68;
      cg.add(puff);
    }
    const side = i % 2 === 0 ? -1 : 1;
    cg.position.set(side * (11 + (i % 4) * 6), 12 + (i % 3) * 3.5, -i * 34 - 8);
    scene.add(cg);
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

  const playerCollarMat = /** @type {THREE.MeshStandardMaterial} */ (playerDuck.collar.material);
  const originalCollarColor = playerCollarMat.color.clone();
  const oppCollarMat = /** @type {THREE.MeshStandardMaterial} */ (oppDuck.collar.material);
  const originalOppCollarColor = oppCollarMat.color.clone();
  const whiteColorReused = new THREE.Color(0xffffff);
  const redCollarPulse = new THREE.Color(0xff2222);

  let collarPulseActive = false;
  function setFloorRingVisible(v) {
    collarPulseActive = !!v;
    if (!collarPulseActive) {
      playerCollarMat.color.copy(originalCollarColor);
    }
  }

  /** 승리 피날레 — 진짜 불꽃놀이(연쇄 로켓 발사 → 방사형 폭발+글로우) + 색종이 낙하 */
  function launchConfetti() {
    const rs = hostViewportSize(hostEl);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const flash = document.createElement('div');
    flash.style.cssText =
      'position:absolute;inset:0;z-index:94;pointer-events:none;opacity:0;transition:opacity .12s;' +
      'background:radial-gradient(circle at 50% 45%,rgba(255,240,170,.7),rgba(255,190,60,.12) 45%,rgba(255,170,40,0) 72%);';
    hostEl.appendChild(flash);
    requestAnimationFrame(() => {
      flash.style.opacity = '1';
      setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 450); }, 150);
    });
    const cvs = document.createElement('canvas');
    cvs.style.cssText = 'position:absolute;inset:0;z-index:95;pointer-events:none;';
    cvs.width = rs.w * dpr;
    cvs.height = rs.h * dpr;
    const cx = cvs.getContext('2d');
    cx.scale(dpr, dpr);
    hostEl.appendChild(cvs);
    const cCols = ['#ff4d6d', '#ffd23f', '#4dd4ac', '#5aa9ff', '#c77dff', '#ff9f43', '#ffffff'];
    // 미리 구운 색색 발광 스프라이트 — shadowBlur 없이 additive로 찬란하게(성능 핵심)
    const SPRN = 12, SPRPX = 48;
    const glowSpr = [];
    for (let h = 0; h < SPRN; h++) {
      const gc = document.createElement('canvas');
      gc.width = gc.height = SPRPX;
      const g2 = gc.getContext('2d');
      const hue = h * (360 / SPRN);
      const c0 = SPRPX / 2;
      // 코어 발광(원형)
      const grd = g2.createRadialGradient(c0, c0, 0, c0, c0, c0);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.28, `hsla(${hue},100%,74%,0.95)`);
      grd.addColorStop(1, `hsla(${hue},100%,55%,0)`);
      g2.fillStyle = grd;
      g2.beginPath(); g2.arc(c0, c0, c0, 0, 7); g2.fill();
      // 십자 광채(4방향 빛줄기) — 보석·별처럼 찬란하게
      g2.globalCompositeOperation = 'lighter';
      const hlg = g2.createLinearGradient(0, c0, SPRPX, c0);
      hlg.addColorStop(0, 'rgba(255,255,255,0)');
      hlg.addColorStop(0.5, `hsla(${hue},100%,90%,0.95)`);
      hlg.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = hlg; g2.fillRect(0, c0 - 1.6, SPRPX, 3.2);
      const vlg = g2.createLinearGradient(c0, 0, c0, SPRPX);
      vlg.addColorStop(0, 'rgba(255,255,255,0)');
      vlg.addColorStop(0.5, `hsla(${hue},100%,90%,0.95)`);
      vlg.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = vlg; g2.fillRect(c0 - 1.6, 0, 3.2, SPRPX);
      glowSpr.push(gc);
    }
    // 하늘에서 우수수 쏟아지는 반짝이 별똥별
    const stars = [];
    function spawnStar() {
      stars.push({
        x: Math.random() * rs.w, y: -30 - Math.random() * rs.h * 0.5,
        vx: (Math.random() * 2 - 1) * 0.5, vy: rs.h * (0.0035 + Math.random() * 0.006),
        ax: Math.random() * 6.28, aspd: 0.02 + Math.random() * 0.04, amp: 0.4 + Math.random() * 1.0,
        size: 12 + Math.random() * 20, h: Math.floor(Math.random() * SPRN),
        tw: Math.random() * 6.28, twspd: 7 + Math.random() * 8, trail: 1.2 + Math.random() * 2.0,
      });
    }
    // 퍼레이드 색종이 — 살랑살랑 낙하(가벼운 사각 채우기)
    const confetti = [];
    function spawnConfetti() {
      confetti.push({
        x: Math.random() * rs.w, y: -20 - Math.random() * rs.h * 0.4,
        vx: (Math.random() * 2 - 1) * 1.2, vy: 1.5 + Math.random() * 2.5,
        w: 6 + Math.random() * 7, h: 9 + Math.random() * 8,
        rot: Math.random() * 6.28, vr: (Math.random() * 2 - 1) * 0.22,
        color: cCols[Math.floor(Math.random() * cCols.length)],
        sway: Math.random() * 6.28, swspd: 0.03 + Math.random() * 0.04,
      });
    }
    for (let i = 0; i < 70; i++) { spawnStar(); spawnConfetti(); }
    const DURATION = 4.5;
    const t0 = clock.getElapsedTime();
    (function frame() {
      const elapsed = clock.getElapsedTime() - t0;
      cx.clearRect(0, 0, rs.w, rs.h);
      const pouring = elapsed < DURATION;
      if (pouring) { for (let k = 0; k < 3; k++) { spawnStar(); spawnConfetti(); } }
      const fade = pouring ? 1 : Math.max(0, 1 - (elapsed - DURATION) / 2);
      // 색종이 — 일반 블렌드(가벼움)
      cx.globalCompositeOperation = 'source-over';
      for (let i = confetti.length - 1; i >= 0; i--) {
        const p = confetti[i];
        p.sway += p.swspd; p.x += p.vx + Math.sin(p.sway) * 0.8; p.y += p.vy; p.vy += 0.015; p.rot += p.vr;
        if (p.y > rs.h + 30) { confetti.splice(i, 1); continue; }
        const shine = Math.abs(Math.sin(p.rot)); // 회전하며 정면일 때 흰빛 반사(홀로그램 시머)
        cx.save(); cx.globalAlpha = fade; cx.translate(p.x, p.y); cx.rotate(p.rot);
        cx.fillStyle = p.color; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        if (shine > 0.55) {
          cx.globalAlpha = fade * ((shine - 0.55) / 0.45) * 0.95;
          cx.fillStyle = '#ffffff';
          cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        cx.restore();
      }
      // 별똥별 — additive('lighter')로 겹치면 찬란, 구운 스프라이트라 가볍다
      cx.globalCompositeOperation = 'lighter';
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i];
        s.ax += s.aspd; s.x += s.vx + Math.sin(s.ax) * s.amp; s.y += s.vy; s.vy += 0.02;
        if (s.y > rs.h + 40) { stars.splice(i, 1); continue; }
        const tw = Math.pow(0.5 + 0.5 * Math.sin(elapsed * s.twspd + s.tw), 2); // 뾰족한 반짝임(대부분 어둡다 순간 확)
        const sz = s.size * (0.62 + tw * 0.7);
        cx.globalAlpha = (0.35 + tw * 0.65) * fade;
        cx.drawImage(glowSpr[s.h], s.x - sz / 2, s.y - sz * s.trail / 2, sz, sz * s.trail);
      }
      cx.globalAlpha = 1;
      cx.globalCompositeOperation = 'source-over';
      if (elapsed < DURATION + 2.5 || stars.length > 0 || confetti.length > 0) requestAnimationFrame(frame);
      else cvs.remove();
    })();
  }

  /** setEnding 이후 승패 연출 — draw 제외 */
  let endingAnimActive = false;
  let endingAnimT0 = 0;
  /** true면 플레이어 오리가 승자 */
  let endingWinnerIsPlayer = true;

  const END_BOUNCE_PERIOD = 0.3;
  const END_SWAY_Z_PERIOD = 0.2;
  const END_SCALE_PULSE_PERIOD = 0.25;
  const END_COLLAR_PULSE_PERIOD = 0.15;
  const END_CAM_SHAKE = 0.05;
  const LOSER_SCALE_DURATION = 0.5;
  const LOSER_FINAL_SCALE = 0.85;
  const LOSER_TILT_RAD = (15 * Math.PI) / 180;

  function resetEndingCelebration() {
    endingAnimActive = false;
    duckRoot.rotation.z = 0;
    oppRoot.rotation.z = 0;
    duckRoot.scale.set(1, 1, 1);
    oppRoot.scale.set(1, 1, 1);
    playerCollarMat.color.copy(originalCollarColor);
    oppCollarMat.color.copy(originalOppCollarColor);
    if (typeof distLabels !== 'undefined' && distLabels) {
      for (let i = 0; i < distLabels.children.length; i++) {
        const sp = distLabels.children[i];
        sp.userData.passed = false;
        sp.userData.popT0 = -1;
        sp.material.map = sp.userData.normalTex;
        sp.material.needsUpdate = true;
        sp.scale.set(sp.userData.bsx, sp.userData.bsy, 1);
        if (sp.userData.glowMat) sp.userData.glowMat.opacity = 0;
      }
    }
  }

  const cdOverlayEl = document.createElement('div');
  cdOverlayEl.setAttribute('aria-hidden', 'true');
  cdOverlayEl.style.cssText =
    'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'pointer-events:none;z-index:20;font-size:min(22vw,120px);font-weight:900;color:#fff;' +
    'text-shadow:0 4px 24px rgba(0,0,0,.5);letter-spacing:-0.02em;gap:12px;';
  hostEl.appendChild(cdOverlayEl);

  // 출발 신호등 (상단 중앙) — 카운트다운마다 빨강 점등 → GO 초록
  const trafficEl = document.createElement('div');
  trafficEl.setAttribute('aria-hidden', 'true');
  trafficEl.style.cssText =
    'position:absolute;top:16px;left:50%;transform:translateX(-50%);display:none;gap:12px;' +
    'padding:11px 16px;background:rgba(18,20,24,.74);border-radius:18px;z-index:23;box-shadow:0 6px 22px rgba(0,0,0,.42);';
  const trafficLamps = [];
  for (let i = 0; i < 3; i++) {
    const lamp = document.createElement('div');
    lamp.style.cssText =
      'width:min(7vw,30px);height:min(7vw,30px);border-radius:50%;background:#3a1414;' +
      'box-shadow:inset 0 0 7px rgba(0,0,0,.65);transition:background .12s,box-shadow .12s;';
    trafficEl.appendChild(lamp);
    trafficLamps.push(lamp);
  }
  hostEl.appendChild(trafficEl);

  const resultOverlayEl = document.createElement('div');
  resultOverlayEl.setAttribute('aria-hidden', 'true');
  resultOverlayEl.style.cssText =
    'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;' +
    'pointer-events:none;z-index:100;font-size:min(18vw,96px);font-weight:900;color:#fff;text-align:center;' +
    'text-shadow:0 4px 24px rgba(0,0,0,.5);padding:16px;box-sizing:border-box;';
  hostEl.appendChild(resultOverlayEl);
  if (!document.getElementById('dlyr-gamefont')) {
    const lk = document.createElement('link');
    lk.id = 'dlyr-gamefont';
    lk.rel = 'stylesheet';
    lk.href = 'https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Jua&display=swap';
    document.head.appendChild(lk);
  }

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

  function setTrafficLamps(kind) {
    if (kind === 'off') {
      trafficEl.style.display = 'none';
      return;
    }
    if (!document.getElementById('dlyr-lamp-kf')) {
      const st = document.createElement('style');
      st.id = 'dlyr-lamp-kf';
      st.textContent =
        '@keyframes dlyrLampPop{0%{transform:scale(.55)}45%{transform:scale(1.42)}72%{transform:scale(.9)}100%{transform:scale(1)}}';
      document.head.appendChild(st);
    }
    trafficEl.style.display = 'flex';
    const go = kind === 'go';
    const litRed = typeof kind === 'number' ? kind : 0;
    trafficLamps.forEach((l, i) => {
      const wasOn = l.dataset.on === '1';
      if (go) {
        l.style.background = 'radial-gradient(circle at 38% 30%,#d6ffe0,#25e04c 62%)';
        l.style.boxShadow = '0 0 26px #38ff6e,0 0 46px #25e04c,inset 0 0 6px rgba(0,0,0,.2)';
        if (!wasOn) l.style.animation = 'dlyrLampPop .34s cubic-bezier(.2,1.6,.4,1)';
        l.dataset.on = '1';
      } else if (i < litRed) {
        l.style.background = 'radial-gradient(circle at 38% 30%,#ffbcbc,#ff2e2e 62%)';
        l.style.boxShadow = '0 0 22px #ff6a6a,0 0 40px #ff2e2e,inset 0 0 6px rgba(0,0,0,.2)';
        if (!wasOn) l.style.animation = 'dlyrLampPop .34s cubic-bezier(.2,1.6,.4,1)';
        l.dataset.on = '1';
      } else {
        l.style.background = '#3a1414';
        l.style.boxShadow = 'inset 0 0 7px rgba(0,0,0,.65)';
        l.style.animation = '';
        l.dataset.on = '0';
      }
    });
  }
  function setCountdown(val) {
    resetEndingCelebration();
    resultOverlayEl.style.display = 'none';
    if (val === 0) {
      cdOverlayEl.textContent = 'GO!';
      setTrafficLamps('go');
      crowdCheerTarget = 1.0;
    } else if (val >= 1 && val <= 3) {
      cdOverlayEl.textContent = String(val);
      setTrafficLamps(4 - val);
      crowdCheerTarget = 0.14;
    } else {
      cdOverlayEl.textContent = '';
      setTrafficLamps('off');
      crowdCheerTarget = 0.08;
    }
  }

  function setRacing() {
    resetEndingCelebration();
    internalRacing = true;
    cdOverlayEl.textContent = '';
    setTrafficLamps('off');
    crowdCheerTarget = 1.0;
  }

  function setEnding(result, callbacks = {}) {
    resetEndingCelebration();
    internalRacing = false;
    crowdCheerTarget = 1.0;
    const w = result && result.winner;
    let main = 'DRAW!';
    let fill = '#C6F24D', stroke = '#3f9e2f', shadow = '#2e7d32';
    if (w === 'win') {
      main = 'WIN!';
      fill = '#FFE24D'; stroke = '#E8611C'; shadow = '#B8430A';
    } else if (w === 'lose') {
      main = 'LOSE!';
      fill = '#9ACEFF'; stroke = '#2A6BD6'; shadow = '#1B4C9E';
    }
    const myD = result && Number.isFinite(result.myDist) ? result.myDist : playerState.dist;
    const opD = result && Number.isFinite(result.oppDist) ? result.oppDist : oppState.dist;
    if (!document.getElementById('dlyr-win-kf')) {
      const stx = document.createElement('style');
      stx.id = 'dlyr-win-kf';
      stx.textContent =
        '@keyframes dlyrWinPop{0%{transform:scale(.3);opacity:0}55%{transform:scale(1.28)}75%{transform:scale(.94)}100%{transform:scale(1);opacity:1}}' +
        '@keyframes dlyrGlow{0%,100%{filter:drop-shadow(0 0 10px #fff)}50%{filter:drop-shadow(0 0 26px #ffe680) drop-shadow(0 0 42px #ffd23f)}}';
      document.head.appendChild(stx);
    }
    resultOverlayEl.innerHTML =
      `<span style="font-family:'Luckiest Guy',system-ui,cursive;letter-spacing:2px;color:${fill};-webkit-text-stroke:2px ${stroke};paint-order:stroke fill;` +
      `text-shadow:0 4px 0 ${shadow},0 8px 18px rgba(0,0,0,.35);display:inline-block;` +
      `animation:dlyrWinPop .6s cubic-bezier(.2,1.5,.4,1) both,dlyrGlow 1.1s .6s ease-in-out infinite">${main}</span>` +
      `<div style="font-family:'Jua',system-ui;font-size:min(5vw,27px);margin-top:16px;color:#fff;` +
      `background:linear-gradient(180deg,#48a8ff,#1f6fd0);padding:8px 24px;border-radius:999px;` +
      `border:2px solid #fff;box-shadow:0 4px 0 #17559f,0 7px 14px rgba(0,0,0,.28)">` +
      `나 <span style="color:#ffe24d">${myD.toFixed(3)}m</span> · 상대 <span style="color:#ffe24d">${opD.toFixed(3)}m</span></div>`;
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

    if (w === 'win' || w === 'lose') {
      endingAnimActive = true;
      endingAnimT0 = clock.getElapsedTime();
      endingWinnerIsPlayer = w === 'win';
      if (w === 'win') launchConfetti();
    }
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
    resetEndingCelebration();
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

    // 거리 팻말: 오리가 지나는 순간 노랗게 번쩍 + 팝
    {
      const nowL = clock.getElapsedTime();
      crowdCheer += (crowdCheerTarget - crowdCheer) * 0.06;
      if (crowd.userData.cheerShaders) {
        for (let ci = 0; ci < crowd.userData.cheerShaders.length; ci++) {
          crowd.userData.cheerShaders[ci].uniforms.uTime.value = nowL;
          crowd.userData.cheerShaders[ci].uniforms.uCheer.value = crowdCheer;
        }
      }
      for (let i = 0; i < distLabels.children.length; i++) {
        const sp = distLabels.children[i];
        const ud = sp.userData;
        if (!ud.passed && distP >= ud.m) {
          ud.passed = true;
          ud.popT0 = nowL;
          sp.material.map = ud.flashTex;
          sp.material.needsUpdate = true;
        }
        if (ud.popT0 >= 0) {
          const pe = nowL - ud.popT0;
          const FLASH = 0.34;
          if (pe >= FLASH) {
            ud.popT0 = -1;
            sp.material.map = ud.normalTex;
            sp.material.needsUpdate = true;
            ud.glowMat.opacity = 0;
          } else {
            // 사이즈 고정 — 색(노랑)과 발광만으로 강렬·짧게. 빠른 점멸로 "번쩍"
            const k = pe / FLASH;
            const decay = Math.pow(1 - k, 1.4);
            const flick = 0.55 + 0.45 * Math.sin(pe * 90);
            ud.glowMat.opacity = decay * flick;
          }
        }
      }
    }

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
      const swing = 0.95 + speedNP * 0.6;
      const thighAmp = 1.12 + speedNP * 0.55;
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
      if (!endingAnimActive) {
        duckRoot.position.y = duckRoot.position.y * (1 - dt * 6);
      }
    }

    oppAnim.squashT = Math.max(0, oppAnim.squashT - dt * 5);
    const bsq = oppAnim.squashT;
    oppDuck.body.scale.set(1 + bsq * 0.22, 1 - bsq * 0.28, 1 + bsq * 0.12);

    if (runningO) {
      const bswing = 0.95 + speedNO * 0.6;
      const bthigh = 1.12 + speedNO * 0.55;
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
      if (!endingAnimActive) {
        oppRoot.position.y = oppRoot.position.y * (1 - dt * 6);
      }
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

    if (collarPulseActive && !endingAnimActive) {
      const t = clock.getElapsedTime();
      const pulse = (Math.sin(t * Math.PI * 2.8) + 1) / 2;
      playerCollarMat.color.copy(originalCollarColor).lerp(whiteColorReused, pulse * 0.85);
    }

    if (endingAnimActive) {
      const tE = clock.getElapsedTime() - endingAnimT0;
      const wRoot = endingWinnerIsPlayer ? duckRoot : oppRoot;
      const lRoot = endingWinnerIsPlayer ? oppRoot : duckRoot;
      wRoot.position.y = Math.sin(tE * ((2 * Math.PI) / END_BOUNCE_PERIOD)) * 0.3;
      wRoot.rotation.z = Math.sin(tE * ((2 * Math.PI) / END_SWAY_Z_PERIOD)) * 0.25;
      const sc = 1 + Math.sin(tE * ((2 * Math.PI) / END_SCALE_PULSE_PERIOD)) * 0.14;
      wRoot.scale.set(sc, sc, sc);
      const collarPulseT = (Math.sin(tE * ((2 * Math.PI) / END_COLLAR_PULSE_PERIOD)) + 1) / 2;
      const winCollar = endingWinnerIsPlayer ? playerCollarMat : oppCollarMat;
      const winOrig = endingWinnerIsPlayer ? originalCollarColor : originalOppCollarColor;
      winCollar.color.copy(winOrig).lerp(redCollarPulse, collarPulseT);
      const kL = Math.min(1, tE / LOSER_SCALE_DURATION);
      const sL = 1 + (LOSER_FINAL_SCALE - 1) * kL;
      lRoot.scale.set(sL, sL, sL);
      const tiltSign = endingWinnerIsPlayer ? 1 : -1;
      lRoot.rotation.z = tiltSign * LOSER_TILT_RAD;
    }

    /** 선두 오리 기준 추적 — 앞선 쪽을 가깝게 뒤에서, 둘 다 화면에 남게. 카메라는 낮춰 뒤뚱거림·궁둥이 부각 */
    const distLead = Math.max(
      Number.isFinite(distP) ? distP : 0,
      Number.isFinite(distO) ? distO : 0,
    );
    const camX = 0;
    const camFollowDist = Math.max(0, distLead) * STRIDE_VISUAL_SCALE;
    const camTargetPos = new THREE.Vector3(camX, 0.95, -camFollowDist - 1.0);
    const camDesired = new THREE.Vector3(camX, 1.95, -camFollowDist + 4.2);
    if (endingAnimActive) {
      // 승리 세리머니: 카메라를 뒤·위로 빼서 커진 승자 오리 전체(발까지) 보이게
      camTargetPos.y += 0.5;
      camDesired.y += 1.35;
      camDesired.z += 2.6;
    }
    camera.position.lerp(camDesired, 0.06);
    if (endingAnimActive) {
      camera.position.x += (Math.random() * 2 - 1) * END_CAM_SHAKE;
      camera.position.y += (Math.random() * 2 - 1) * END_CAM_SHAKE;
      camera.position.z += (Math.random() * 2 - 1) * END_CAM_SHAKE;
    }
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
    setFloorRingVisible,
    resize,
    dispose,
    getCanvas: () => renderer.domElement,
  };
}
