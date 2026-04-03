/**
 * Pseudo-3D 도로 (jakesgordon/javascript-racer 스타일) + 고정 P1 / 투영 P2
 */

import { computeBottomPadLayout } from './input.js';
import { GamePhase } from './ui.js';
import {
  WORLD_Z_PER_METER,
  progressToMeters,
  FINISH_SEQUENCE_TIMINGS,
  finishSequenceTotalSec,
  TRACK_DISTANCE_M,
  TAP_STRIDE_CM,
} from './constants.js';
import {
  sprites,
  drawSpriteRect,
  drawDuckFrame,
  loadSpriteSheet,
} from './sprites/spriteSheet.js';
import { loadOri10PartPack } from './sprites/ori10Parts.js';
import { DESIGN_W, DESIGN_H, getPortraitLetterbox, getPadLayoutDesign } from './layoutPortrait.js';

const TAP_TEXTS = ['꽥!', '빠악!', '삐약!', '고고!', '달려!'];
const CONFETTI_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FF8C00', '#C084FC', '#FB7185'];

const SEGMENT_LENGTH = 200;
const DRAW_SEGMENTS = 95;
const CAMERA_DEPTH = 0.84;
/** 도로 좌우 절반 폭 (월드 X, 정규화) */
const ROAD_WIDTH = 0.42;

const COLORS = {
  SKY_TOP: '#87CEEB',
  SKY_BOT: '#B8E0F0',
  /** 잔디·꽃밭 */
  GRASS_LIGHT: '#7CB342',
  GRASS_DARK: '#558B2F',
  ROAD: '#D2B48C',
  ROAD_ALT: '#C4A574',
  RUMBLE_LIGHT: '#F5F0E6',
  RUMBLE_EDGE: '#E8DDD0',
  LANE: '#FFFFFF',
  TREE_FAR: '#33691E',
};

/** 도로 중심(0) 기준 좌·우 잔디 위 오브젝트 — 도로 가장자리(±ROAD_WIDTH) 바깥 */
const ROADSIDE_LEFT_X = -ROAD_WIDTH * 2.0;
const ROADSIDE_RIGHT_X = ROAD_WIDTH * 2.0;

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  x = clamp(x, 0, 1);
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

/**
 * @param {number} t — finishSequence 경과(초)
 * @returns {{ ribbonPop: number, fall01: number, headLift01: number, eyeMode: 'normal'|'x'|'dazed' }}
 */
function computeFinishAnim(t) {
  const S = FINISH_SEQUENCE_TIMINGS;
  const ribbon01 = Math.min(1, t / S.ribbon);
  const ribbonPop = easeOutBack(ribbon01);

  let fall01 = 0;
  if (t > S.tumbleStart) {
    const d = S.tumbleEnd - S.tumbleStart;
    fall01 = d > 0 ? Math.min(1, (t - S.tumbleStart) / d) : 1;
    fall01 *= fall01;
  }

  const faceDownEnd = S.tumbleEnd + S.facePlantHold;
  let headLift01 = 0;
  if (t > faceDownEnd) {
    const hl = S.headLift;
    headLift01 = hl > 0 ? Math.min(1, (t - faceDownEnd) / hl) : 1;
    headLift01 = headLift01 * headLift01 * (3 - 2 * headLift01);
  }

  let eyeMode = 'normal';
  if (t >= S.tumbleEnd && t < faceDownEnd) eyeMode = 'x';
  else if (t >= faceDownEnd) eyeMode = 'dazed';

  return { ribbonPop, fall01, headLift01, eyeMode };
}

/** 운동회 결승 테이프 — 바닥 cy에서 위로 탁 튀어나옴 */
function drawFinishRibbon(ctx, cx, cyGround, baseSize, pop) {
  if (pop < 0.03) return;
  const tapeW = baseSize * 2.65;
  const tapeH = baseSize * 0.48 * pop;
  ctx.save();
  ctx.translate(cx, cyGround);
  ctx.transform(1, 0, -0.09 * pop, 1, 0, 0);
  const strips = 10;
  const sw = tapeW / strips;
  for (let i = 0; i < strips; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#C62828' : '#FFEBEE';
    ctx.fillRect(-tapeW / 2 + i * sw, -tapeH, sw + 1.5, tapeH);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-tapeW / 2, -tapeH, tapeW, tapeH);
  ctx.restore();
}

function rndPick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function roundRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * 평지 도로용 투영 — X·폭은 scale, Y는 dz만으로 지평선~화면 하단 배치
 * (CAMERA_Y 방식은 y가 캔버스 밖으로 나가 밀색 도로가 안 보이는 문제가 있었음)
 */
function projectRow(camX, camZ, worldX, worldZ, width, height, roadWidthNorm) {
  const dz = worldZ - camZ;
  if (dz <= 8) return null;
  const scale = CAMERA_DEPTH / dz;
  const horizon = height * 0.38;
  const span = height * 0.97 - horizon;
  const d0 = SEGMENT_LENGTH * 14;
  const y = horizon + span * (1 - dz / (dz + d0));
  return {
    x: width / 2 + scale * (worldX - camX) * width * 0.5,
    y,
    w: Math.max(3, scale * roadWidthNorm * width * 0.5),
    scale,
    dz,
  };
}

function polygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function rumbleWidth(projectedRoadHalf) {
  return Math.max(6, projectedRoadHalf / 9);
}

/**
 * 세그먼트: 잔디·럼블·도로·중앙선
 * pNear: 카메라에 가까운 쪽(화면 아래, y 큼) / pFar: 먼 쪽(위, y 작음)
 * worldNear/worldFar: 월드 Z — 럼블·잔디 줄무늬가 카메라와 함께 흐르도록 세그먼트 인덱스 사용
 */
function drawRoadSegment(ctx, w, h, pNear, pFar, worldNear, worldFar, _lanes) {
  void _lanes;
  if (!pNear || !pFar || pNear.y <= pFar.y) return;

  const x1 = pNear.x;
  const w1 = pNear.w;
  const y1 = pNear.y;
  const x2 = pFar.x;
  const w2 = pFar.w;
  const y2 = pFar.y;

  const segGrass = Math.floor(((worldNear + worldFar) * 0.5) / SEGMENT_LENGTH);
  const grassCol = segGrass % 2 === 0 ? COLORS.GRASS_LIGHT : COLORS.GRASS_DARK;
  ctx.fillStyle = grassCol;
  ctx.fillRect(0, y2, w, y1 - y2);

  const r1 = rumbleWidth(w1) * 0.65;
  const r2 = rumbleWidth(w2) * 0.65;
  const segRumble = Math.floor(worldNear / SEGMENT_LENGTH);
  const rum = segRumble % 2 === 0 ? COLORS.RUMBLE_LIGHT : COLORS.RUMBLE_EDGE;

  polygon(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, rum);
  polygon(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, rum);

  const segRoad = Math.floor(worldNear / SEGMENT_LENGTH);
  const roadFill = segRoad % 2 === 0 ? COLORS.ROAD : COLORS.ROAD_ALT;
  polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, roadFill);

  ctx.strokeStyle = 'rgba(160, 120, 80, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1 - w1, y1);
  ctx.lineTo(x2 - w2, y2);
  ctx.moveTo(x1 + w1, y1);
  ctx.lineTo(x2 + w2, y2);
  ctx.stroke();

  ctx.strokeStyle = COLORS.LANE;
  ctx.lineWidth = Math.max(2.5, w1 * 0.055);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1 - w1, y1);
  ctx.lineTo(x2 - w2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1 + w1, y1);
  ctx.lineTo(x2 + w2, y2);
  ctx.stroke();

  const worldMid = (worldNear + worldFar) * 0.5;
  if (Math.floor(worldMid / (SEGMENT_LENGTH * 0.5)) % 2 === 0) {
    const strip = w1 * 0.035;
    polygon(ctx, x1 - strip, y1, x1 + strip, y1, x2 + strip, y2, x2 - strip, y2, COLORS.LANE);
  }
}

/** 원근 멀리 — 나무 결승 게이트 */
function drawFinishArch(ctx, cx, y, roadHalfW) {
  const archH = Math.max(48, roadHalfW * 1.25);
  const postW = Math.max(6, roadHalfW * 0.07);
  const baseY = y;
  ctx.fillStyle = '#5D4037';
  ctx.fillRect(cx - roadHalfW - postW * 0.2, baseY - postW * 2.2, postW, postW * 2.2);
  ctx.fillRect(cx + roadHalfW - postW * 0.8, baseY - postW * 2.2, postW, postW * 2.2);
  ctx.beginPath();
  ctx.strokeStyle = '#4E342E';
  ctx.lineWidth = Math.max(3, roadHalfW * 0.04);
  ctx.lineCap = 'round';
  ctx.arc(cx, baseY - archH * 0.05, roadHalfW * 0.92, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  const banH = Math.max(14, archH * 0.2);
  const banW = roadHalfW * 1.75;
  ctx.fillStyle = '#FF6D00';
  ctx.beginPath();
  roundRectPath(ctx, cx - banW / 2, baseY - archH * 0.38 - banH, banW, banH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#FFF';
  ctx.font = `bold ${Math.max(12, roadHalfW * 0.11)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FINISH', cx, baseY - archH * 0.38 - banH * 0.5);
}

function drawStartStrip(ctx, cx, y, roadHalfW) {
  const thick = Math.max(5, roadHalfW * 0.06);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillRect(cx - roadHalfW, y - thick * 0.5, roadHalfW * 2, thick);
  ctx.fillStyle = 'rgba(40,40,40,0.85)';
  ctx.font = `bold ${Math.max(11, roadHalfW * 0.09)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('달려라 START', cx, y - thick * 0.65);
}

const LEFT_SIDE_KINDS = ['flower', 'tree', 'flag'];
const RIGHT_SIDE_KINDS = ['crowd', 'flower', 'flag'];

/** 도로변 오브젝트 — 높이 화면의 8~12% (원근에 따라 약간만 변화). cx는 이미 잔디 쪽 투영 */
function drawRoadsideObject(ctx, kind, cx, footY, hScreen, scale, side) {
  const sign = side < 0 ? -1 : 1;
  const depthFade = clamp(0.35 + scale * 18, 0, 1);
  const tall = clamp(hScreen * (0.08 + 0.04 * depthFade), hScreen * 0.08, hScreen * 0.12);
  /** 도로 쪽으로 당기지 않음 — 잔디 바깥에 유지 */
  const footX = cx + sign * tall * 0.08;
  const topY = footY - tall;

  ctx.save();
  if (kind === 'tree') {
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(footX - tall * 0.06, footY - tall * 0.55, tall * 0.12, tall * 0.55);
    ctx.fillStyle = '#2E7D32';
    ctx.beginPath();
    ctx.arc(footX, topY + tall * 0.25, tall * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#43A047';
    ctx.beginPath();
    ctx.arc(footX - tall * 0.1, topY + tall * 0.35, tall * 0.18, 0, Math.PI * 2);
    ctx.arc(footX + tall * 0.1, topY + tall * 0.35, tall * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'flag') {
    ctx.fillStyle = '#6D4C41';
    ctx.fillRect(footX - 2, footY - tall * 0.92, 4, tall * 0.92);
    ctx.fillStyle = '#FF9800';
    ctx.beginPath();
    ctx.moveTo(footX + 2, topY + tall * 0.12);
    ctx.lineTo(footX + sign * tall * 0.45, topY + tall * 0.28);
    ctx.lineTo(footX + 2, topY + tall * 0.42);
    ctx.fill();
  } else if (kind === 'flower') {
    ctx.fillStyle = '#558B2F';
    ctx.fillRect(footX - 2, footY - tall * 0.25, 4, tall * 0.25);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.fillStyle = i % 2 === 0 ? '#FFFDE7' : '#FFEB3B';
      ctx.beginPath();
      ctx.arc(footX + Math.cos(a) * tall * 0.09, footY - tall * 0.4 + Math.sin(a) * tall * 0.09, tall * 0.065, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#F9A825';
    ctx.beginPath();
    ctx.arc(footX, footY - tall * 0.4, tall * 0.045, 0, Math.PI * 2);
    ctx.fill();
  } else {
    /* 관중 오리 */
    ctx.fillStyle = '#ECEFF1';
    ctx.beginPath();
    ctx.ellipse(footX, footY - tall * 0.2, tall * 0.14, tall * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#CFD8DC';
    ctx.beginPath();
    ctx.arc(footX, footY - tall * 0.4, tall * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFAB91';
    ctx.beginPath();
    ctx.arc(footX - tall * 0.08, footY - tall * 0.48, tall * 0.04, 0, Math.PI * 2);
    ctx.arc(footX + tall * 0.08, footY - tall * 0.48, tall * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = `${Math.max(8, tall * 0.14)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('꽥!', footX, footY - tall * 0.72);
  }
  ctx.restore();
}

function drawSkyAndSun(ctx, w, h, scroll) {
  const horizon = h * 0.38;
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, COLORS.SKY_TOP);
  g.addColorStop(0.55, '#B0E0E6');
  g.addColorStop(1, COLORS.SKY_BOT);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, horizon);

  ctx.fillStyle = COLORS.TREE_FAR;
  for (let i = 0; i < 28; i++) {
    const t = i / 27;
    const x = t * w * 1.15 - w * 0.05 + (scroll * 0.08) % (w * 0.25);
    const tw = w * (0.022 + (i % 3) * 0.006);
    const th = horizon * (0.12 + ((i * 7) % 5) * 0.02);
    ctx.beginPath();
    ctx.moveTo(x - tw, horizon);
    ctx.lineTo(x, horizon - th);
    ctx.lineTo(x + tw, horizon);
    ctx.closePath();
    ctx.fill();
  }

  const gField = ctx.createLinearGradient(0, horizon, 0, h);
  gField.addColorStop(0, COLORS.GRASS_LIGHT);
  gField.addColorStop(1, COLORS.GRASS_DARK);
  ctx.fillStyle = gField;
  ctx.fillRect(0, horizon, w, h - horizon);

  const sunR = w * 0.028;
  ctx.fillStyle = 'rgba(255, 248, 200, 0.4)';
  ctx.beginPath();
  ctx.arc(w * 0.88, h * 0.06, sunR * 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 253, 231, 0.95)';
  ctx.beginPath();
  ctx.arc(w * 0.88, h * 0.06, sunR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  for (let i = 0; i < 4; i++) {
    const cx = ((i * w * 0.4 + scroll * 0.25) % (w * 1.4)) - w * 0.2;
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.1 + (i % 2) * 10, w * 0.055, h * 0.018, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.03, h * 0.09 + (i % 2) * 10, w * 0.035, h * 0.014, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHudFull(ctx, w, h, ducks) {
  const boxW = w * 0.38;
  const boxH = Math.max(40, h * 0.055);
  const padding = w * 0.03;
  const y0 = h * 0.018;

  for (let i = 0; i < 2; i++) {
    const p = ducks[i];
    const x = i === 0 ? padding : w - padding - boxW;
    const meters = progressToMeters(p.progress);

    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    ctx.beginPath();
    roundRectPath(ctx, x, y0, boxW, boxH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = `bold ${Math.min(w, h) * 0.028}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = i === 0 ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    if (i === 0) {
      ctx.fillStyle = '#FFEB3B';
      ctx.fillText(`형님: ${meters.toFixed(1)}m`, x + 14, y0 + boxH * 0.38);
      ctx.font = `${Math.min(w, h) * 0.02}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillText(`Mori · ${p.tapCount ?? 0} tap`, x + 14, y0 + boxH * 0.72);
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`상대: ${meters.toFixed(1)}m`, x + boxW - 14, y0 + boxH * 0.38);
      ctx.font = `${Math.min(w, h) * 0.02}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillText('Ori · CPU', x + boxW - 14, y0 + boxH * 0.72);
    }
  }
}

/** 레이스 중 상단 중앙 — 남은 거리(평균) */
function drawHudRaceCenter(ctx, w, h, ducks) {
  const m0 = progressToMeters(ducks[0].progress);
  const m1 = progressToMeters(ducks[1].progress);
  const avgRem = TRACK_DISTANCE_M - (m0 + m1) * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = `bold ${Math.min(w, h) * 0.034}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeText(`${Math.max(0, avgRem).toFixed(0)}m 남음 · ${TRACK_DISTANCE_M}m`, w / 2, h * 0.068);
  ctx.fillText(`${Math.max(0, avgRem).toFixed(0)}m 남음 · ${TRACK_DISTANCE_M}m`, w / 2, h * 0.068);
  ctx.font = `${Math.min(w, h) * 0.02}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(`탭 1회 ≈ ${TAP_STRIDE_CM}cm`, w / 2, h * 0.098);
}

function drawCountdown(ctx, w, h, countdownElapsed) {
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, w, h);
  let text;
  if (countdownElapsed < 1.0) text = 'READY...';
  else if (countdownElapsed < 2.0) text = '3';
  else if (countdownElapsed < 3.0) text = '2';
  else if (countdownElapsed < 4.0) text = '1';
  else text = 'GO!';
  const size =
    text === 'READY...' ? Math.min(w, h) * 0.12 : Math.min(w, h) * 0.26;
  ctx.fillStyle =
    text === 'GO!' ? '#FFD700' : text === 'READY...' ? '#FFFFFF' : '#FFFFFF';
  ctx.font = `bold ${size}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h * 0.42);
  ctx.font = `bold ${Math.min(w, h) * 0.056}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  if (countdownElapsed < 1.0) {
    ctx.fillText('3 · 2 · 1', w / 2, h * 0.52);
  }
  ctx.textBaseline = 'alphabetic';
}

function drawFinish(ctx, w, h, confetti, resultLines, raceElapsed) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, w, h);
  confetti.forEach((c) => {
    ctx.fillStyle = c.color;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.r);
    ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.4);
    ctx.restore();
  });
  if (!resultLines?.length) return;
  const size = Math.min(w, h) * 0.075;
  ctx.fillStyle = '#FFD700';
  ctx.font = `bold ${size}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`🏆 ${resultLines[0]} 🏆`, w / 2, h * 0.36);
  ctx.fillStyle = '#fff';
  ctx.font = `${size * 0.4}px -apple-system, sans-serif`;
  let lineY = h * 0.44;
  for (let i = 1; i < resultLines.length; i++) {
    ctx.fillText(resultLines[i], w / 2, lineY);
    lineY += size * 0.55;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `${size * 0.34}px -apple-system, sans-serif`;
  ctx.fillText(`${raceElapsed?.toFixed(1) ?? 0}초 · 탭하면 다시 시작`, w / 2, lineY + size * 0.35);
}

function drawTapEffects(ctx, effects) {
  effects.forEach((e) => {
    ctx.fillStyle = `rgba(255,255,255,${e.life * 0.8})`;
    ctx.font = `bold ${16 + (1 - e.life) * 20}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(e.text, e.x, e.y);
  });
}

function drawDustParticles(ctx, particles) {
  particles.forEach((d) => {
    const a = d.a * clamp(d.life * 2.2, 0, 1);
    const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 2.4);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.5, `rgba(245,240,230,${a * 0.45})`);
    g.addColorStop(1, 'rgba(220,210,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * 2.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** 하단 물갈퀴 터치 패드 (타원 레이아웃과 동일 중심) */
function drawWebFootPad(ctx, pad, label) {
  const { cx, cy, rx, ry } = pad;
  ctx.save();
  ctx.translate(cx, cy + ry * 0.06);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#FF9800';
  ctx.strokeStyle = '#E65100';
  ctx.lineWidth = Math.max(2, rx * 0.06);
  ctx.beginPath();
  ctx.moveTo(-rx * 0.88, ry * 0.18);
  ctx.quadraticCurveTo(-rx, -ry * 0.55, -rx * 0.32, -ry * 0.78);
  ctx.lineTo(0, -ry * 0.58);
  ctx.quadraticCurveTo(rx * 0.32, -ry * 0.78, rx, -ry * 0.55);
  ctx.quadraticCurveTo(rx * 0.88, ry * 0.22, rx * 0.52, ry * 0.72);
  ctx.quadraticCurveTo(0, ry * 0.92, -rx * 0.52, ry * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = 'transparent';

  ctx.strokeStyle = '#E65100';
  ctx.lineWidth = Math.max(1.8, rx * 0.055);
  ctx.lineCap = 'round';
  for (const sx of [-0.42, 0, 0.42]) {
    ctx.beginPath();
    ctx.moveTo(sx * rx * 0.15, -ry * 0.32);
    ctx.lineTo(sx * rx * 0.72 + sx * rx * 0.12, ry * 0.58);
    ctx.stroke();
  }

  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const len = 8 + (i % 3) * 4;
    ctx.strokeStyle = 'rgba(255,235,120,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * (rx + 4), Math.sin(ang) * (ry + 4));
    ctx.lineTo(Math.cos(ang) * (rx + len), Math.sin(ang) * (ry + len));
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2.5;
  ctx.font = `bold ${clamp(rx * 0.34, 15, 28)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(label, cx, cy - ry * 0.02);
  ctx.fillText(label, cx, cy - ry * 0.02);
}

/** 결승 넘어짐 때만 호출 — 'x' | 'dazed' */
function drawDuckEyesFinish(ctx, headY, baseSize, eyeMode) {
  const ex = baseSize * 0.12;
  const ey = headY - baseSize * 0.02;
  ctx.lineCap = 'round';
  if (eyeMode === 'x') {
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = Math.max(2, baseSize * 0.07);
    for (const sx of [-1, 1]) {
      const cx = sx * ex;
      ctx.beginPath();
      ctx.moveTo(cx - baseSize * 0.07, ey - baseSize * 0.06);
      ctx.lineTo(cx + baseSize * 0.07, ey + baseSize * 0.06);
      ctx.moveTo(cx + baseSize * 0.07, ey - baseSize * 0.06);
      ctx.lineTo(cx - baseSize * 0.07, ey + baseSize * 0.06);
      ctx.stroke();
    }
  } else if (eyeMode === 'dazed') {
    ctx.strokeStyle = '#37474F';
    ctx.lineWidth = Math.max(1.5, baseSize * 0.05);
    for (const sx of [-1, 1]) {
      const cx = sx * ex;
      ctx.beginPath();
      ctx.arc(cx, ey + baseSize * 0.02, baseSize * 0.06, 0.35, Math.PI - 0.35);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(55,71,79,0.45)';
    ctx.beginPath();
    ctx.arc(0, ey - baseSize * 0.04, baseSize * 0.04, 2.6, 5.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, ey - baseSize * 0.02, baseSize * 0.035, 2.3, 5.1);
    ctx.stroke();
  }
}

/**
 * 뒤에서 본 한쪽 다리 + 물갈퀴 (hipY 기준 아래로)
 * @param {number} legHalfSpread — 엉덩이 중심에서 다리 축까지 거리
 * @param {'left'|'right'} side
 * @param {number} stridePx — 앞(+)/뒤(-) 스텝(픽셀), 앞발은 화면 아래로
 * @param {boolean} isRearLeg — 뒤로 접힌 쪽: 발바닥이 카메라 쪽으로
 */
function drawDuckLegAndWebFoot(ctx, baseSize, legHalfSpread, side, hipY, legLen, stridePx, isRearLeg) {
  const legW = baseSize * 0.12;
  const sx = side === 'left' ? -1 : 1;
  const footX = sx * legHalfSpread;
  const ankleY = hipY + legLen + stridePx * 0.9;
  const legH = Math.max(baseSize * 0.15, ankleY - hipY);

  ctx.fillStyle = '#FF6D00';
  ctx.beginPath();
  ctx.roundRect(footX - legW / 2, hipY, legW, legH, legW * 0.42);
  ctx.fill();

  const bodyW = baseSize * 0.75 * 2;
  const footRx = bodyW * 0.15;
  const footRy = baseSize * 0.11;

  ctx.save();
  ctx.translate(footX, hipY + legH);
  if (isRearLeg) ctx.rotate(side === 'left' ? -0.48 : 0.48);
  else ctx.rotate(side === 'left' ? 0.06 : -0.06);

  ctx.beginPath();
  ctx.ellipse(0, baseSize * 0.05, footRx, footRy * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-footRx * 0.12, baseSize * 0.02);
  ctx.arc(0, baseSize * 0.07, footRx * 1.06, Math.PI * 1.06, Math.PI * 1.94);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#E65100';
  ctx.lineWidth = Math.max(1.2, baseSize * 0.035);
  const toeBaseY = baseSize * 0.1;
  for (let t = -1; t <= 1; t++) {
    ctx.beginPath();
    ctx.moveTo(t * footRx * 0.15, baseSize * 0.02);
    ctx.lineTo(t * footRx * 0.82 + sx * footRx * 0.42, toeBaseY + baseSize * 0.045);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 뒷모습(궁둥이 뷰) — v3 drawDuck과 동일 계열: 발→몸→꼬리→날개→뒷통수·깃털만
 * 눈/앞얼굴 표정은 finish 연출(FINISH_SEQUENCE/RESULT 포즈)일 때만
 */
function drawDuckFigure(ctx, duck, baseSize, isP1Style, finishAnim) {
  const p = duck;

  const fall01 = finishAnim?.fall01 ?? 0;
  const headLift01 = finishAnim?.headLift01 ?? 0;

  const buttHalfW = baseSize * 0.75;
  const legGap = buttHalfW * 2 * 0.4;
  const legWDesign = baseSize * 0.12;
  const legHalfSpread = legGap * 0.5 + legWDesign * 0.5;

  const stepLift = (p.animStepLift ?? 0) * (1 - fall01);
  const idleSwing = finishAnim ? 0 : Math.sin(p.animFeet * Math.PI * 2) * baseSize * 0.07 * Math.min(1, p.speed * 2.5 + 0.15);
  let leftStride = 0;
  let rightStride = 0;
  if (p.lastStepFoot === 'left') {
    leftStride = stepLift * baseSize * 0.22 + idleSwing;
    rightStride = -stepLift * baseSize * 0.22 - idleSwing;
  } else if (p.lastStepFoot === 'right') {
    rightStride = stepLift * baseSize * 0.22 + idleSwing;
    leftStride = -stepLift * baseSize * 0.22 - idleSwing;
  } else {
    leftStride = idleSwing;
    rightStride = -idleSwing;
  }

  let wobbleRot = 0;
  if (duck.isDown) wobbleRot = 0.95;
  else if (!finishAnim) {
    const wad = Math.min(0.14, (p.animStepLift ?? 0) * 0.125);
    if (p.lastStepFoot === 'left') wobbleRot = wad + p.animWobble * 0.22;
    else if (p.lastStepFoot === 'right') wobbleRot = -wad + p.animWobble * 0.22;
    else wobbleRot = p.animWobble * 0.32;
  }

  if (finishAnim) {
    const footPivotY = baseSize * 0.34;
    const maxFall = 1.18;
    let bodyRot = maxFall * fall01;
    if (headLift01 > 0) bodyRot *= 1 - headLift01 * 0.42;
    ctx.translate(0, footPivotY);
    ctx.rotate(bodyRot);
    ctx.translate(0, -footPivotY);
    ctx.translate(0, fall01 * baseSize * 0.56);
    if (headLift01 > 0) {
      ctx.translate(0, -headLift01 * baseSize * 0.24);
    }
  } else {
    ctx.rotate(wobbleRot);
  }

  const shW = baseSize * 0.7 * (1 - fall01 * 0.35);
  const shH = baseSize * 0.15 * (1 - fall01 * 0.55);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, baseSize * 0.35 + fall01 * baseSize * 0.15, shW, shH, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!finishAnim && p.tapFlash > 0) {
    ctx.fillStyle = `rgba(255,255,200,${p.tapFlash * 0.3})`;
    ctx.beginPath();
    ctx.arc(0, -baseSize * 0.1, baseSize * 1.5 * p.tapFlash, 0, Math.PI * 2);
    ctx.fill();
  }

  const hipY = baseSize * 0.5;
  const legLen = baseSize * 0.5;
  if (finishAnim && fall01 > 0.35) {
    const fk = Math.sin(p.animFeet * Math.PI * 2) * baseSize * 0.12 * (1 - fall01);
    ctx.fillStyle = '#FF6D00';
    ctx.beginPath();
    ctx.ellipse(-legHalfSpread + fk * 0.5, baseSize * 0.36, baseSize * 0.16, baseSize * 0.07, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(legHalfSpread - fk * 0.5, baseSize * 0.36, baseSize * 0.16, baseSize * 0.07, 0.15, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawDuckLegAndWebFoot(ctx, baseSize, legHalfSpread, 'left', hipY, legLen, leftStride, leftStride < -1e-6);
    drawDuckLegAndWebFoot(ctx, baseSize, legHalfSpread, 'right', hipY, legLen, rightStride, rightStride < -1e-6);
  }

  const edgeColor = '#CFD8DC';
  const bodyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, baseSize);
  bodyGrad.addColorStop(0, '#FFFFFF');
  bodyGrad.addColorStop(0.55, '#FAFAFA');
  bodyGrad.addColorStop(1, edgeColor);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, baseSize * 0.75, baseSize * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, baseSize * 0.75, baseSize * 0.7, 0, 0, Math.PI * 2);
  ctx.stroke();

  const neckY = -baseSize * 0.4;
  const isM = p.playerLabel === 'M';
  ctx.fillStyle = isM ? '#E53935' : '#FF9800';
  ctx.beginPath();
  ctx.ellipse(0, neckY, baseSize * 0.5, baseSize * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = isM ? '#FFEB3B' : '#FFFFFF';
  ctx.font = `bold ${baseSize * 0.26}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isM ? 'M' : 'O', 0, neckY);

  ctx.fillStyle = '#FFF9C4';
  const tailY = -baseSize * 0.4;
  ctx.beginPath();
  ctx.moveTo(-baseSize * 0.08, tailY);
  ctx.quadraticCurveTo(0, tailY - baseSize * 0.35, baseSize * 0.05, tailY - baseSize * 0.25);
  ctx.quadraticCurveTo(baseSize * 0.02, tailY - baseSize * 0.15, baseSize * 0.08, tailY);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-baseSize * 0.03, tailY - baseSize * 0.05);
  ctx.quadraticCurveTo(baseSize * 0.06, tailY - baseSize * 0.4, baseSize * 0.12, tailY - baseSize * 0.2);
  ctx.quadraticCurveTo(baseSize * 0.08, tailY - baseSize * 0.1, baseSize * 0.03, tailY - baseSize * 0.05);
  ctx.closePath();
  ctx.fillStyle = '#FFFDE7';
  ctx.fill();

  const wingWob = finishAnim ? 0 : Math.sin(p.animFeet * Math.PI * 4) * 0.1;
  ctx.fillStyle = '#ECEFF1';
  ctx.beginPath();
  ctx.ellipse(
    -baseSize * 0.65,
    -baseSize * 0.05,
    baseSize * 0.22,
    baseSize * 0.4,
    0.15 + wingWob,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(
    baseSize * 0.65,
    -baseSize * 0.05,
    baseSize * 0.22,
    baseSize * 0.4,
    -0.15 - wingWob,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  const headBob = finishAnim ? 0 : Math.sin(p.animHeadBob * Math.PI) * baseSize * 0.05;
  const headY = -baseSize * 0.7 + headBob + fall01 * baseSize * 0.08;
  ctx.fillStyle = '#F5F5F5';
  ctx.beginPath();
  ctx.arc(0, headY, baseSize * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  /* 뒷통수 위 작은 깃 */
  ctx.fillStyle = '#B0BEC5';
  ctx.beginPath();
  ctx.moveTo(-baseSize * 0.03, headY - baseSize * 0.28);
  ctx.quadraticCurveTo(baseSize * 0.02, headY - baseSize * 0.42, baseSize * 0.06, headY - baseSize * 0.32);
  ctx.quadraticCurveTo(baseSize * 0.03, headY - baseSize * 0.26, baseSize * 0.01, headY - baseSize * 0.28);
  ctx.fill();

  if (finishAnim && finishAnim.eyeMode !== 'normal') {
    drawDuckEyesFinish(ctx, headY, baseSize, finishAnim.eyeMode);
  }

  if (!finishAnim || fall01 < 0.55) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `bold ${baseSize * 0.26}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeText(`'${p.name}'`, 0, -baseSize * 1.08);
    ctx.fillText(`'${p.name}'`, 0, -baseSize * 1.08);
    ctx.font = `${baseSize * 0.16}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    const sub = isM ? '빨강 — 열정적' : '주황 — 밝고 활발';
    ctx.strokeText(sub, 0, -baseSize * 0.86);
    ctx.fillText(sub, 0, -baseSize * 0.86);
  }
}

/** 스프라이트 4프레임: 0 대기, 1 왼발 앞, 2 오른발 앞, 3 원근 작게 */
function fullSheetPoseIndex(p) {
  if (p.isDown) return 3;
  if ((p.animStepLift ?? 0) > 0.06) {
    if (p.lastStepFoot === 'left') return 1;
    if (p.lastStepFoot === 'right') return 2;
  }
  if (p.speed > 0.06) return (Math.floor(p.animFeet * 2) & 1) === 0 ? 1 : 2;
  return 0;
}

/**
 * sprite_sheet — reference_google.html 과 동일 drawImage(sx,sy,sw,sh) 절단
 * @param {HTMLImageElement | null} img
 */
/**
 * ori10 파츠 — 몸통 하단 중심을 (0,0), 다리는 좌·우 spread에서 pivot 회전
 * P1/P2 동일 아리(하양) 에셋
 */
function drawDuckFromOri10Parts(ctx, duck, baseSize, pack) {
  const p = duck;
  let wobbleRot = 0;
  if (duck.isDown) wobbleRot = 0.95;
  else {
    const wad = Math.min(0.14, (p.animStepLift ?? 0) * 0.125);
    if (p.lastStepFoot === 'left') wobbleRot = wad + p.animWobble * 0.22;
    else if (p.lastStepFoot === 'right') wobbleRot = -wad + p.animWobble * 0.22;
    else wobbleRot = p.animWobble * 0.32;
  }
  ctx.rotate(wobbleRot);

  const shW = baseSize * 0.7;
  const shH = baseSize * 0.15;
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, baseSize * 0.35, shW, shH, 0, 0, Math.PI * 2);
  ctx.fill();

  if (p.tapFlash > 0) {
    ctx.fillStyle = `rgba(255,255,200,${p.tapFlash * 0.28})`;
    ctx.beginPath();
    ctx.arc(0, -baseSize * 0.1, baseSize * 1.5 * p.tapFlash, 0, Math.PI * 2);
    ctx.fill();
  }

  const {
    body,
    legL,
    legR,
    bodyPivotX,
    bodyPivotY,
    legLPivotX,
    legLPivotY,
    legRPivotX,
    legRPivotY,
    bw,
    bh,
    lw,
    lh,
    rw,
    rh,
  } = pack;

  const downScale = duck.isDown ? 0.72 : 1;
  const bodyTargetH = baseSize * 1.42 * downScale;
  const sc = bodyTargetH / bh;

  const stepLift = (p.animStepLift ?? 0) * (duck.isDown ? 0 : 1);
  const idleSwing =
    Math.sin(p.animFeet * Math.PI * 2) * 0.09 * Math.min(1, p.speed * 2.5 + 0.15);

  let leftRot = 0;
  let rightRot = 0;
  if (p.lastStepFoot === 'left') {
    leftRot = stepLift * 0.52 + idleSwing;
    rightRot = -stepLift * 0.48 - idleSwing;
  } else if (p.lastStepFoot === 'right') {
    rightRot = stepLift * 0.52 + idleSwing;
    leftRot = -stepLift * 0.48 - idleSwing;
  } else {
    leftRot = idleSwing;
    rightRot = -idleSwing;
  }

  const spread = baseSize * 0.33 * downScale;

  function drawLegLeft(angle) {
    ctx.save();
    ctx.translate(-spread, 0);
    ctx.rotate(angle);
    ctx.drawImage(legL, -legLPivotX * sc, -legLPivotY * sc, lw * sc, lh * sc);
    ctx.restore();
  }
  function drawLegRight(angle) {
    ctx.save();
    ctx.translate(spread, 0);
    ctx.rotate(angle);
    ctx.drawImage(legR, -legRPivotX * sc, -legRPivotY * sc, rw * sc, rh * sc);
    ctx.restore();
  }

  let leftInFront = p.lastStepFoot === 'left';
  if (p.lastStepFoot === null) {
    leftInFront = (Math.floor(p.animFeet * 2) & 1) === 0;
  }

  if (leftInFront) {
    drawLegRight(rightRot);
    drawLegLeft(leftRot);
  } else {
    drawLegLeft(leftRot);
    drawLegRight(rightRot);
  }

  ctx.drawImage(body, -bodyPivotX * sc, -bodyPivotY * sc, bw * sc, bh * sc);
}

function drawDuckFromSpriteSheet(ctx, duck, baseSize, isP1, img) {
  if (!img) return;
  const p = duck;
  const poseIx = fullSheetPoseIndex(duck);
  const which = isP1 ? 'ari' : 'kkari';

  let wobbleRot = 0;
  if (duck.isDown) wobbleRot = 0.95;
  else {
    const wad = Math.min(0.14, (p.animStepLift ?? 0) * 0.125);
    if (p.lastStepFoot === 'left') wobbleRot = wad + p.animWobble * 0.22;
    else if (p.lastStepFoot === 'right') wobbleRot = -wad + p.animWobble * 0.22;
    else wobbleRot = p.animWobble * 0.32;
  }
  ctx.rotate(wobbleRot);

  const shW = baseSize * 0.7;
  const shH = baseSize * 0.15;
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, baseSize * 0.35, shW, shH, 0, 0, Math.PI * 2);
  ctx.fill();

  if (p.tapFlash > 0) {
    ctx.fillStyle = `rgba(255,255,200,${p.tapFlash * 0.28})`;
    ctx.beginPath();
    ctx.arc(0, -baseSize * 0.1, baseSize * 1.5 * p.tapFlash, 0, Math.PI * 2);
    ctx.fill();
  }

  const dh = baseSize * 2.28;
  const dw = dh * (sprites.frameW / sprites.frameH);
  const dx = -dw * 0.5;
  const dy = -dh * 0.84;
  drawDuckFrame(ctx, img, which, poseIx, dx, dy, dw, dh);
}

function drawDuck(ctx, duck, baseSize, isP1Style, finishAnim, spriteSheet, ori10Pack) {
  if (finishAnim) {
    drawDuckFigure(ctx, duck, baseSize, isP1Style, finishAnim);
    return;
  }
  if (ori10Pack) {
    drawDuckFromOri10Parts(ctx, duck, baseSize, ori10Pack);
    return;
  }
  if (spriteSheet) {
    drawDuckFromSpriteSheet(ctx, duck, baseSize, isP1Style, spriteSheet);
    return;
  }
  drawDuckFigure(ctx, duck, baseSize, isP1Style, null);
}

function progressToWorldZ(meters) {
  return meters * WORLD_Z_PER_METER;
}

export class RacingPseudo3D {
  /**
   * @param {string} phase
   * @param {{ finishSeqElapsed?: number, finishSnapshot?: { p1Progress: number, p2Progress: number, lane0: number, lane1: number } | null, spriteSheet?: HTMLImageElement | null, ori10Pack?: object | null }} opts
   */
  static renderScene(ctx, w, h, ducks, laneWobbleP1, laneWobbleP2, phase, opts = {}) {
    const snap = opts.finishSnapshot;
    let finishT = 0;
    if (phase === GamePhase.FINISH_SEQUENCE && Number.isFinite(opts.finishSeqElapsed)) {
      finishT = opts.finishSeqElapsed;
    } else if (phase === GamePhase.RESULT && snap) {
      finishT = finishSequenceTotalSec();
    }
    const fa = finishT > 0 ? computeFinishAnim(finishT) : null;

    let p1z;
    let p2z;
    let lo1;
    let lo2;
    if ((phase === GamePhase.FINISH_SEQUENCE || phase === GamePhase.RESULT) && snap) {
      p1z = progressToWorldZ(snap.p1Progress);
      p2z = progressToWorldZ(snap.p2Progress);
      lo1 = snap.lane0;
      lo2 = snap.lane1;
    } else {
      p1z = progressToWorldZ(ducks[0].progress);
      p2z = progressToWorldZ(ducks[1].progress);
      lo1 = laneWobbleP1;
      lo2 = laneWobbleP2;
    }

    /** 월드 Z — 매 프레임 P1·P2 평균으로 이동해야 도로가 스크롤됨 */
    const cameraZ = (p1z + p2z) * 0.5;
    const camX = ((lo1 + lo2) * 0.5) * 0.04;
    const scroll = cameraZ * 0.12;

    drawSkyAndSun(ctx, w, h, scroll);

    const sheetImg = opts.spriteSheet ?? null;
    if (sheetImg) {
      const tr = sprites.track;
      const dw = w;
      const dh = tr.h * (w / tr.w);
      const scrollPx = (cameraZ * 0.18) % dh;
      for (let i = -1; i < 4; i++) {
        drawSpriteRect(ctx, sheetImg, tr, 0, 132 + i * dh - scrollPx, dw, dh);
      }
    }

    const lanes = 2;
    const roadPieces = [];
    /**
     * cameraZ만 올라가고 dz=n*L 고정이면 화면이 멈춘 것처럼 보임.
     * cameraZ % SEGMENT_LENGTH 만큼 빼 주면 dz가 연속 변화 → 위에서 아래로 흐름.
     */
    const fracZ = ((cameraZ % SEGMENT_LENGTH) + SEGMENT_LENGTH) % SEGMENT_LENGTH;

    for (let n = DRAW_SEGMENTS; n >= 1; n--) {
      const worldNear = cameraZ + n * SEGMENT_LENGTH - fracZ;
      const worldFar = cameraZ + (n + 1) * SEGMENT_LENGTH - fracZ;
      const pNear = projectRow(camX, cameraZ, 0, worldNear, w, h, ROAD_WIDTH);
      const pFar = projectRow(camX, cameraZ, 0, worldFar, w, h, ROAD_WIDTH);
      if (!pNear || !pFar) continue;
      roadPieces.push({ pNear, pFar, worldNear, worldFar });
    }

    /** 도로만 먼저 전부 그린 뒤, 잔디 위 오브젝트를 그려 도로 사다리꼴에 덮이지 않게 함 */
    for (const { pNear, pFar, worldNear, worldFar } of roadPieces) {
      drawRoadSegment(ctx, w, h, pNear, pFar, worldNear, worldFar, lanes);
    }

    const finishWorldZ = TRACK_DISTANCE_M * WORLD_Z_PER_METER;
    const dzF = finishWorldZ - cameraZ;
    if (dzF > 8) {
      const pFin = projectRow(camX, cameraZ, 0, finishWorldZ, w, h, ROAD_WIDTH);
      if (pFin && pFin.y < h * 0.94 && pFin.y > h * 0.03) {
        drawFinishArch(ctx, pFin.x, pFin.y, pFin.w);
      }
    }
    if (phase === GamePhase.RACING || phase === GamePhase.COUNTDOWN) {
      const pSt = projectRow(camX, cameraZ, 0, cameraZ + 400, w, h, ROAD_WIDTH);
      if (pSt && pSt.y < h * 0.94 && pSt.dz > 35) {
        drawStartStrip(ctx, pSt.x, pSt.y, pSt.w);
      }
    }

    const roadsideQueue = [];
    for (const { worldNear, worldFar } of roadPieces) {
      const worldMid = (worldNear + worldFar) * 0.5;
      const pMid = projectRow(camX, cameraZ, 0, worldMid, w, h, ROAD_WIDTH);
      if (pMid && pMid.dz > 80 && pMid.y < h * 0.92) {
        const segKey = Math.floor(worldMid / SEGMENT_LENGTH);
        const cz = Math.floor(cameraZ / SEGMENT_LENGTH);
        const kindL = LEFT_SIDE_KINDS[(segKey * 2 + cz) % 3];
        const kindR = RIGHT_SIDE_KINDS[(segKey * 3 + cz + 1) % 3];
        const pL = projectRow(camX, cameraZ, ROADSIDE_LEFT_X, worldMid, w, h, ROAD_WIDTH);
        const pR = projectRow(camX, cameraZ, ROADSIDE_RIGHT_X, worldMid, w, h, ROAD_WIDTH);
        if (pL) roadsideQueue.push({ kind: kindL, x: pL.x, y: pL.y, scale: pL.scale, side: -1 });
        if (pR) roadsideQueue.push({ kind: kindR, x: pR.x, y: pR.y, scale: pR.scale, side: 1 });
      }
    }
    for (const r of roadsideQueue) {
      drawRoadsideObject(ctx, r.kind, r.x, r.y, h, r.scale, r.side);
    }

    let pr1 = ducks[0].progress;
    let pr2 = ducks[1].progress;
    if (snap) {
      pr1 = snap.p1Progress;
      pr2 = snap.p2Progress;
    }
    const progDelta = pr2 - pr1;

    const p1cx = w * 0.3 + lo1 * w * 0.035;
    const p1cy = h * 0.56;
    const baseP1 = h * 0.125;
    const p1RibbonY = p1cy + baseP1 * 0.3;

    const p2cx = w * 0.7 + lo2 * w * 0.035;
    const p2cy = h * 0.56;
    const baseP2 = h * clamp(0.125 + clamp(progDelta * 0.09, -0.02, 0.02), 0.1, 0.14);
    const p2RibbonY = p2cy + baseP2 * 0.3;

    if (opts.dustSpawner) {
      if (opts.raceJustStarted) {
        opts.dustSpawner(p1cx, p1cy + baseP1 * 0.56, 16);
        opts.dustSpawner(p2cx, p2cy + baseP2 * 0.56, 16);
        opts.consumeRaceStart?.();
      }
      if (opts.p1TapDust) {
        opts.dustSpawner(p1cx, p1cy + baseP1 * 0.56, 12);
        opts.consumeP1TapDust?.();
      }
    }

    if (fa) {
      drawFinishRibbon(ctx, p1cx, p1RibbonY, baseP1, fa.ribbonPop);
      drawFinishRibbon(ctx, p2cx, p2RibbonY, baseP2, fa.ribbonPop);
    }

    const sheet = opts.spriteSheet ?? null;
    const ori10 = opts.ori10Pack ?? null;

    ctx.save();
    ctx.translate(p2cx, p2cy);
    drawDuck(ctx, ducks[1], baseP2, false, fa, sheet, ori10);
    ctx.restore();

    ctx.save();
    ctx.translate(p1cx, p1cy);
    drawDuck(ctx, ducks[0], baseP1, true, fa, sheet, ori10);
    ctx.restore();
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._tapEffects = [];
    this._confetti = [];
    this._confettiSpawned = false;
    this._lastPhase = '';
    this._lastFrameNow = 0;
    /** @type {{ x: number, y: number, vx: number, vy: number, life: number, r: number, a: number }[]} */
    this._dust = [];
    this._p1TapDust = false;
    this._spriteSheet = null;
    /** @type {Awaited<ReturnType<typeof loadOri10PartPack>> | null} */
    this._ori10Pack = null;
    loadSpriteSheet()
      .then((img) => {
        this._spriteSheet = img;
      })
      .catch(() => {});
    const ori10Url = new URL('../assets/sprites/ori10.png', import.meta.url).href;
    loadOri10PartPack(ori10Url)
      .then((pack) => {
        this._ori10Pack = pack;
      })
      .catch(() => {});
  }

  queueTapBurst(foot) {
    const layout = computeBottomPadLayout(this.canvas);
    const pad = foot === 'left' ? layout.left : layout.right;
    this._tapEffects.push({
      x: pad.cx + (Math.random() - 0.5) * pad.rx * 0.5,
      y: pad.cy,
      life: 1,
      text: rndPick(TAP_TEXTS),
      vx: (Math.random() - 0.5) * 2,
      vy: -3,
    });
    this._p1TapDust = true;
  }

  _spawnDust(cx, cy, count) {
    for (let i = 0; i < count; i++) {
      this._dust.push({
        x: cx + (Math.random() - 0.5) * 36,
        y: cy + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 4.5,
        vy: -Math.random() * 2.8 - 0.6,
        life: 0.55 + Math.random() * 0.45,
        r: 2.5 + Math.random() * 5,
        a: 0.4 + Math.random() * 0.35,
      });
    }
  }

  _spawnConfettiV3() {
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    for (let i = 0; i < 80; i++) {
      this._confetti.push({
        x: Math.random() * W,
        y: -Math.random() * H * 0.3,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 1,
        r: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.2,
        size: 8 + Math.random() * 12,
        color: rndPick(CONFETTI_COLORS),
      });
    }
  }

  _stepFx(dt, phase) {
    if (phase === GamePhase.FINISH_SEQUENCE && this._lastPhase === GamePhase.RACING) {
      this._tapEffects.length = 0;
    }
    if (phase === GamePhase.MENU) {
      this._confettiSpawned = false;
      this._confetti.length = 0;
      this._tapEffects.length = 0;
      this._dust.length = 0;
      this._p1TapDust = false;
    }
    if (phase === GamePhase.RESULT && this._lastPhase !== GamePhase.RESULT) {
      if (!this._confettiSpawned) {
        this._confettiSpawned = true;
        this._spawnConfettiV3();
      }
    }
    this._lastPhase = phase;

    this._tapEffects.forEach((e) => {
      e.life -= dt * 2.5;
      e.x += e.vx * dt * 60;
      e.y += e.vy * dt * 60;
    });
    this._tapEffects = this._tapEffects.filter((e) => e.life > 0);

    this._dust.forEach((d) => {
      d.x += d.vx * dt * 52;
      d.y += d.vy * dt * 52;
      d.vy += 28 * dt;
      d.life -= dt * 1.65;
    });
    this._dust = this._dust.filter((d) => d.life > 0);

    if (phase === GamePhase.RESULT) {
      this._confetti.forEach((c) => {
        c.x += c.vx * dt * 60;
        c.y += c.vy * dt * 60;
        c.r += c.vr * dt * 60;
        c.vy += 0.05 * dt * 60;
      });
    }
  }

  clear() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.ctx.fillStyle = '#1e2a16';
    this.ctx.fillRect(0, 0, w, h);
  }

  render(game) {
    const ctx = this.ctx;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const now = performance.now();
    const dt = this._lastFrameNow ? Math.min(0.05, (now - this._lastFrameNow) / 1000) : 0;
    this._lastFrameNow = now;
    this._stepFx(dt, game.phase);

    this.clear();

    if (game.phase === GamePhase.MENU) return;

    const L = getPortraitLetterbox(cw, ch);

    ctx.save();
    ctx.translate(L.ox, L.oy);
    ctx.scale(L.s, L.s);

    RacingPseudo3D.renderScene(
      ctx,
      DESIGN_W,
      DESIGN_H,
      game.ducks,
      game.ducks[0].laneOffset,
      game.ducks[1].laneOffset,
      game.phase,
      {
        finishSeqElapsed: game.finishSequenceElapsed,
        finishSnapshot: game.finishSnapshot,
        dustSpawner: (x, y, n) => this._spawnDust(x, y, n),
        raceJustStarted: game.raceJustStarted,
        consumeRaceStart: () => {
          game.raceJustStarted = false;
        },
        p1TapDust: this._p1TapDust,
        consumeP1TapDust: () => {
          this._p1TapDust = false;
        },
        spriteSheet: this._spriteSheet,
        ori10Pack: this._ori10Pack,
      },
    );

    drawDustParticles(ctx, this._dust);

    if (game.phase === GamePhase.RACING) {
      drawHudFull(ctx, DESIGN_W, DESIGN_H, game.ducks);
      drawHudRaceCenter(ctx, DESIGN_W, DESIGN_H, game.ducks);

      const dPads = getPadLayoutDesign();
      if (this._spriteSheet) {
        const img = this._spriteSheet;
        const pl = sprites.pads.left;
        const pr = sprites.pads.right;
        const dwL = dPads.left.rx * 2.12;
        const dhL = dPads.left.ry * 2.12;
        const dwR = dPads.right.rx * 2.12;
        const dhR = dPads.right.ry * 2.12;
        drawSpriteRect(ctx, img, pl, dPads.left.cx - dwL / 2, dPads.left.cy - dhL / 2, dwL, dhL);
        drawSpriteRect(ctx, img, pr, dPads.right.cx - dwR / 2, dPads.right.cy - dhR / 2, dwR, dhR);
      } else {
        drawWebFootPad(ctx, dPads.left, '왼발');
        drawWebFootPad(ctx, dPads.right, '오른발');
      }

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = `${Math.min(DESIGN_W, DESIGN_H) * 0.034}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('빠르되 정확하게! 꽉! 꽉!', DESIGN_W / 2, DESIGN_H - 14);
    }

    if (game.phase === GamePhase.COUNTDOWN) {
      drawCountdown(ctx, DESIGN_W, DESIGN_H, game.countdownElapsed);
    }

    ctx.restore();

    drawTapEffects(ctx, this._tapEffects);

    if (game.phase === GamePhase.RESULT) {
      drawFinish(ctx, cw, ch, this._confetti, game.resultLines, game.raceElapsed);
    }
  }
}
