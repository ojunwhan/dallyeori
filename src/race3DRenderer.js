/**
 * Three.js r128 — prototype/maduck_run_test.html 3D 장면만 모듈화.
 * 물리·소켓·입력은 raceV3Inline 등에서 담당하고, 여기서는 표시만 갱신한다.
 */
import * as THREE from 'three';
import { DUCK_3D_COLORS, RACE_ENGINE_PHYSICS } from './constants.js';

const PLAYER_LANE_X = -1.25;
const BOT_LANE_X = 1.25;
const LANE_LATERAL_MAX = 1.25;
const TRACK_WORLD_LEN = 400;
const TRACK_STRIPE_SPACING_M = 0.5;
const BASE_CAMERA_FOV = 63;
const IDLE_ENTER = 0.15;
const MAX_SPEED = RACE_ENGINE_PHYSICS.MAX_SPEED;

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
  tex.repeat.set(1, TRACK_WORLD_LEN / TRACK_STRIPE_SPACING_M);
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
    sp.position.set(-3.5, 1.5, -m);
    sp.scale.set(3.2, 1.6, 1);
    g.add(sp);
  }
  return g;
}

function makeDashedStripeGroup(x) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const half = TRACK_WORLD_LEN / 2;
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
    // 프로토타입과 동일: 씬에 붙는 최상위 leg Group에 rotation.x를 건다.
    const leg = new THREE.Group();
    leg.position.set(side * 0.22, 0.38, 0);
    bodySquash.add(leg);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.24, 12, 1), orange);
    upper.position.y = -0.12;
    upper.castShadow = true;
    leg.add(upper);
    const lower = new THREE.Group();
    lower.position.y = -0.22;
    leg.add(lower);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 10, 1), orange);
    shin.position.y = -0.1;
    shin.castShadow = true;
    lower.add(shin);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), orange);
    foot.scale.set(1.5, 0.35, 2.1);
    foot.position.y = -0.22;
    foot.castShadow = true;
    lower.add(foot);
    return { leg, lower, foot };
  }
  const L = makeLeg(-1);
  const R = makeLeg(1);

  const leftLeg = L.leg;
  console.log('[DUCK-TREE]', {
    leftLegParent: leftLeg.parent?.uuid,
    leftLegInScene: leftLeg.parent !== null,
    rootChildren: root.children.length,
    rootChildTypes: root.children.map((c) => c.constructor.name + ':' + (c.uuid?.slice(0, 4))),
  });

  return {
    root,
    body: bodySquash,
    head,
    hairGroup,
    leftLeg: L.leg,
    rightLeg: R.leg,
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
 * @param {{ terrainKey?: string, myDuckId?: string, oppDuckId?: string }} [options]
 */
export function createRace3DRenderer(hostEl, options = {}) {
  if (!hostEl) throw new Error('createRace3DRenderer: hostEl required');

  const optsTerrainKey = options.terrainKey;
  void optsTerrainKey;

  const myId = options.myDuckId || 'duri';
  const oppId = options.oppDuckId || 'tori';
  const myCol = duckColorsFromId(myId);
  const oppCol = duckColorsFromId(oppId);

  const prevHostPos = hostEl.style.position;
  if (!prevHostPos || prevHostPos === 'static') hostEl.style.position = 'relative';
  hostEl.style.overflow = 'hidden';

  const w0 = Math.max(1, hostEl.clientWidth || hostEl.offsetWidth || 300);
  const h0 = Math.max(1, hostEl.clientHeight || hostEl.offsetHeight || 150);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87c5ff);
  scene.fog = new THREE.Fog(0x87ceeb, 30, 80);

  const camera = new THREE.PerspectiveCamera(BASE_CAMERA_FOV, w0 / h0, 0.1, 650);
  camera.position.set(0, 4.5, 8);

  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
  renderer.setSize(w0, h0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  hostEl.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xfff5e6, 0x3d5c3a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.05);
  sun.position.set(4, 14, 6);
  sun.castShadow = false;
  sun.shadow.mapSize.set(2048, 2048);
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
  for (let i = -30; i <= 30; i += 2) {
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
  duckRoot.position.set(PLAYER_LANE_X, 0, 0);
  oppRoot.position.set(BOT_LANE_X, 0, 0);
  scene.add(duckRoot);
  scene.add(oppRoot);

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
    'pointer-events:none;z-index:25;font-size:min(18vw,96px);font-weight:900;color:#fff;text-align:center;' +
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
  let playerRunPhase = 0;
  let oppRunPhase = 0;
  let playerTapSquashEnd = 0;
  let oppTapSquashEnd = 0;
  let endingBtnTimer = 0;
  /** @type {HTMLElement | null} */
  let endingBtnWrap = null;

  let internalRacing = false;
  let boostTimer = 0;
  let animId = 0;
  let disposed = false;
  const clock = new THREE.Clock();

  function updatePlayer(state) {
    if (!state || typeof state !== 'object') return;
    if (state.squash) {
      playerTapSquashEnd = performance.now() + 80;
    }
    const { squash, runPhase: _rp, ...rest } = state;
    void _rp;
    Object.assign(playerState, rest);
  }

  function updateOpponent(state) {
    if (!state || typeof state !== 'object') return;
    if (state.squash) {
      oppTapSquashEnd = performance.now() + 80;
    }
    const { squash, runPhase: _ro, ...rest } = state;
    void _ro;
    Object.assign(oppState, rest);
  }

  function clearEndingButtons() {
    if (endingBtnTimer) {
      clearTimeout(endingBtnTimer);
      endingBtnTimer = 0;
    }
    if (endingBtnWrap && endingBtnWrap.parentNode) {
      endingBtnWrap.remove();
    }
    endingBtnWrap = null;
  }

  function setCountdown(val) {
    clearEndingButtons();
    resultOverlayEl.style.display = 'none';
    resultOverlayEl.style.pointerEvents = 'none';
    if (val === 0) {
      cdOverlayEl.textContent = 'GO!';
    } else if (val >= 1 && val <= 3) {
      cdOverlayEl.textContent = String(val);
    } else {
      cdOverlayEl.textContent = '';
    }
  }

  function setRacing() {
    clearEndingButtons();
    internalRacing = true;
    cdOverlayEl.textContent = '';
    boostTimer = 0.3;
  }

  /**
   * @param {{ winner?: string, myDist?: number, oppDist?: number }} result
   * @param {{ onRematch?: () => void, onViewRecord?: () => void }} [callbacks]
   */
  function setEnding(result, callbacks) {
    clearEndingButtons();
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
      `나: ${myD.toFixed(1)}m | 상대: ${opD.toFixed(1)}m</div>`;
    resultOverlayEl.style.display = 'flex';
    resultOverlayEl.style.pointerEvents = 'auto';

    endingBtnTimer = window.setTimeout(() => {
      endingBtnTimer = 0;
      const btnContainer = document.createElement('div');
      btnContainer.style.cssText =
        'position:absolute;bottom:25%;left:50%;transform:translateX(-50%);display:flex;gap:16px;z-index:26;pointer-events:auto;';

      const rematchBtn = document.createElement('button');
      rematchBtn.type = 'button';
      rematchBtn.textContent = '한판더';
      rematchBtn.style.cssText =
        'padding:14px 32px;font-size:18px;font-weight:bold;border:none;border-radius:12px;background:#4CAF50;color:#fff;cursor:pointer;font-family:system-ui;';
      rematchBtn.onclick = () => {
        if (callbacks && typeof callbacks.onRematch === 'function') callbacks.onRematch();
      };

      const recordBtn = document.createElement('button');
      recordBtn.type = 'button';
      recordBtn.textContent = '기록보기';
      recordBtn.style.cssText =
        'padding:14px 32px;font-size:18px;font-weight:bold;border:none;border-radius:12px;background:rgba(255,255,255,0.2);color:#fff;cursor:pointer;font-family:system-ui;border:1px solid rgba(255,255,255,0.4);';
      recordBtn.onclick = () => {
        if (callbacks && typeof callbacks.onViewRecord === 'function') callbacks.onViewRecord();
      };

      btnContainer.appendChild(rematchBtn);
      btnContainer.appendChild(recordBtn);
      resultOverlayEl.appendChild(btnContainer);
      endingBtnWrap = btnContainer;
    }, 2000);
  }

  function resize() {
    const w = Math.max(1, hostEl.clientWidth || hostEl.offsetWidth || 300);
    const h = Math.max(1, hostEl.clientHeight || hostEl.offsetHeight || 150);
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
    if (disposed) return;
    disposed = true;
    clearEndingButtons();
    if (animId) cancelAnimationFrame(animId);
    animId = 0;
    renderer.dispose();
    disposeObject3D(scene);
    trackStripeTex.dispose();
    if (!prevHostPos || prevHostPos === 'static') hostEl.style.position = '';
  }

  function renderLoop() {
    if (Math.random() < 0.01) {
      console.log('[3D-DBG]', {
        vP: playerState.v,
        vO: oppState.v,
        speedP: (playerState.v || 0) / 4.5,
        pPhase: playerRunPhase,
        hasLeftHip: !!playerDuck?.leftLeg?.hip,
        hasLeftLeg: !!playerDuck?.leftLeg,
        bodyType: typeof playerDuck?.body,
      });
    }
    animId = requestAnimationFrame(renderLoop);
    const dt = Math.min(clock.getDelta(), 0.05);

    const distP = playerState.dist;
    const distO = oppState.dist;
    const latP = Math.max(-LANE_LATERAL_MAX, Math.min(LANE_LATERAL_MAX, playerState.lateral));
    const latO = Math.max(-LANE_LATERAL_MAX, Math.min(LANE_LATERAL_MAX, oppState.lateral));
    duckRoot.position.z = -distP;
    duckRoot.position.x = PLAYER_LANE_X + latP;
    oppRoot.position.z = -distO;
    oppRoot.position.x = BOT_LANE_X + latO;

    duckRoot.rotation.y = Math.PI + (playerState.dirA || 0);
    oppRoot.rotation.y = Math.PI + (oppState.dirA || 0);

    const vP = playerState.v || 0;
    const vO = oppState.v || 0;
    const speedP = vP / MAX_SPEED;
    const speedO = vO / MAX_SPEED;
    // runPhase 증가: renderer.render 직전 FORCE LEG 블록에서 처리 (디버그/강제 경로)
    // if (vP > 0.01) playerRunPhase += vP * dt * 8;
    // if (vO > 0.01) oppRunPhase += vO * dt * 8;

    wobbleImpulse *= Math.pow(0.88, dt * 60);
    oppWobbleImpulse *= Math.pow(0.88, dt * 60);

    run.squashT = Math.max(0, run.squashT - dt * 5);
    const sq = run.squashT;
    const nowT = performance.now();
    const playerBodyY = nowT < playerTapSquashEnd ? 0.78 : 1 - sq * 0.28;
    playerDuck.body.scale.set(1 + sq * 0.22, playerBodyY, 1 + sq * 0.12);

    const bodySquashGroup = playerDuck.body;
    const headGroup = playerDuck.head;
    const tailPivot = playerDuck.tail;
    const wingL = playerDuck.leftWing;
    const wingR = playerDuck.rightWing;
    const hairGroup = playerDuck.hairGroup;

    const ph = playerRunPhase;
    // 다리: renderer.render 직전 FORCE LEG 블록이 최종 적용 (leftLeg/rightLeg = Group)
    // playerDuck.leftLeg.rotation.x = Math.sin(ph) * 0.8 * speedP;
    // playerDuck.rightLeg.rotation.x = Math.sin(ph + Math.PI) * 0.8 * speedP;
    bodySquashGroup.rotation.z = Math.sin(ph * 2) * 0.08 * speedP;
    bodySquashGroup.position.x = Math.sin(ph) * 0.06 * speedP;
    bodySquashGroup.rotation.x = -speedP * 0.15;
    headGroup.rotation.z = Math.sin(ph * 2 + 0.5) * 0.06 * speedP;
    headGroup.rotation.x = 0;
    headGroup.rotation.y = 0;
    headGroup.position.x = Math.sin(ph) * 0.04 * speedP;
    headGroup.position.z = 0.06;
    hairGroup.rotation.z = Math.sin(ph * 3) * 0.15 * speedP;
    hairGroup.rotation.x = 0;
    wingL.rotation.y = -0.15;
    wingR.rotation.y = 0.15;
    wingL.rotation.z = Math.sin(ph * 2) * 0.2 * speedP;
    wingR.rotation.z = -Math.sin(ph * 2) * 0.2 * speedP;
    tailPivot.rotation.y = Math.sin(ph * 3) * 0.3 * speedP;
    tailPivot.rotation.x = 0;
    duckRoot.position.y = Math.abs(Math.sin(ph)) * 0.15 * speedP;

    oppAnim.squashT = Math.max(0, oppAnim.squashT - dt * 5);
    const bsq = oppAnim.squashT;
    const oppBodyY = nowT < oppTapSquashEnd ? 0.78 : 1 - bsq * 0.28;
    oppDuck.body.scale.set(1 + bsq * 0.22, oppBodyY, 1 + bsq * 0.12);

    const bph = oppRunPhase;
    // 다리: renderer.render 직전 FORCE LEG 블록이 최종 적용 (leftLeg/rightLeg = Group)
    // oppDuck.leftLeg.rotation.x = Math.sin(bph) * 0.8 * speedO;
    // oppDuck.rightLeg.rotation.x = Math.sin(bph + Math.PI) * 0.8 * speedO;
    oppDuck.body.rotation.z = Math.sin(bph * 2) * 0.08 * speedO;
    oppDuck.body.position.x = Math.sin(bph) * 0.06 * speedO;
    oppDuck.body.rotation.x = -speedO * 0.15;
    oppDuck.head.rotation.z = Math.sin(bph * 2 + 0.5) * 0.06 * speedO;
    oppDuck.head.rotation.x = 0;
    oppDuck.head.rotation.y = 0;
    oppDuck.head.position.x = Math.sin(bph) * 0.04 * speedO;
    oppDuck.head.position.z = 0.06;
    oppDuck.hairGroup.rotation.z = Math.sin(bph * 3) * 0.15 * speedO;
    oppDuck.hairGroup.rotation.x = 0;
    oppDuck.leftWing.rotation.y = -0.15;
    oppDuck.rightWing.rotation.y = 0.15;
    oppDuck.leftWing.rotation.z = Math.sin(bph * 2) * 0.2 * speedO;
    oppDuck.rightWing.rotation.z = -Math.sin(bph * 2) * 0.2 * speedO;
    oppDuck.tail.rotation.y = Math.sin(bph * 3) * 0.3 * speedO;
    oppDuck.tail.rotation.x = 0;
    oppRoot.position.y = Math.abs(Math.sin(bph)) * 0.15 * speedO;

    const midDist = distP * 0.6 + distO * 0.4;
    const camTargetPos = new THREE.Vector3(0, 1.5, -midDist);
    const camDesired = new THREE.Vector3(0, 4.5, -midDist + 8);
    camera.position.lerp(camDesired, 0.05);
    camera.lookAt(camTargetPos);

    if (boostTimer > 0) {
      boostTimer -= dt;
      const t = Math.max(0, boostTimer) / 0.3;
      camera.fov = 55 + 10 * Math.sin(t * Math.PI);
      camera.updateProjectionMatrix();
    } else {
      camera.fov = BASE_CAMERA_FOV;
      camera.updateProjectionMatrix();
    }

    // ====== FORCE LEG ANIMATION START ======
    {
      if (Math.random() < 0.005) {
        const hip = playerDuck.leftLeg.hip || playerDuck.leftLeg;
        console.log('[LEG-DBG]', {
          legKeys: Object.keys(playerDuck.leftLeg),
          hipIsObject3D: hip instanceof THREE.Object3D,
          hipType: hip?.constructor?.name,
          hipParent: hip?.parent?.constructor?.name,
          currentRotX: hip?.rotation?.x,
          targetRotX:
            Math.sin(playerRunPhase) * 0.8 * Math.min((playerState.spd || playerState.v || 0) / 4.5, 1),
          oppV: oppState.spd || oppState.v || 0,
          oppPhase: oppRunPhase,
        });
      }
      const _dt = clock.getDelta ? 0.016 : 0.016; // 대략 60fps
      const _vP = playerState.v || playerState.spd || 0;
      const _vO = oppState.v || oppState.spd || 0;
      const _sP = Math.min(_vP / 4.5, 1);
      const _sO = Math.min(_vO / 4.5, 1);

      if (_vP > 0.01) playerRunPhase += _vP * 0.016 * 8;
      if (_vO > 0.01) oppRunPhase += _vO * 0.016 * 8;

      // 테스트: 다리를 극단적으로 벌려서 보이는지 확인
      playerDuck.leftLeg.rotation.x = 1.5; // 약 86도 — 앞으로 뻗기
      playerDuck.rightLeg.rotation.x = -1.5; // 약 86도 — 뒤로 뻗기

      oppDuck.leftLeg.rotation.x = 1.5;
      oppDuck.rightLeg.rotation.x = -1.5;

      // 플레이어 뒤뚱거림
      if (playerDuck.body) {
        playerDuck.body.rotation.z = Math.sin(playerRunPhase * 2) * 0.08 * _sP;
        playerDuck.body.rotation.x = -_sP * 0.15;
      }

      // 수직 바운스
      if (playerDuck.root) {
        playerDuck.root.position.y = Math.abs(Math.sin(playerRunPhase)) * 0.15 * _sP;
      }
      if (oppDuck.root) {
        oppDuck.root.position.y = Math.abs(Math.sin(oppRunPhase)) * 0.15 * _sO;
      }
    }
    // ====== FORCE LEG ANIMATION END ======

    if (Math.random() < 0.02) {
      console.log('[LEG-PRE-RENDER]', { leftLegRotX: playerDuck.leftLeg?.rotation?.x });
    }
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
