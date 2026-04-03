/**
 * 단일 트랙 · 왼/오른 레인 · P1 패드 조작 · P2 자동 탭 AI
 * 앱 진입 시 app.js에서 startGame()으로 경주 시작 — 자동 루프 없음
 */
import {
  MAX_DEVICE_PIXEL_RATIO,
  progressToMeters,
  finishSequenceTotalSec,
  TRACK_DISTANCE_M,
  RACE_TIME_LIMIT_SEC,
} from './constants.js';
import { getTrackPreset, TRACK_TYPE } from './track.js';
import { RaceDuck } from './duck.js';
import { applyFootTap, integrateRacePhysics } from './physics.js';
import { hitTestP1Pads } from './input.js';
import { Renderer } from './renderer.js';
import { drawGameOverlay, GamePhase } from './ui.js';

/** READY… → 3 · 2 · 1 · GO! */
const COUNTDOWN_TOTAL = 5.4;

const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('#game-canvas 가 없습니다');

const renderer = new Renderer(canvas);
const track = getTrackPreset(TRACK_TYPE.NORMAL);

const game = {
  phase: GamePhase.MENU,
  countdownElapsed: 0,
  raceElapsed: 0,
  time: 0,
  /** 출발 직후 흙먼지 1회 */
  raceJustStarted: false,
  ducks: [
    new RaceDuck({ color: '#FAFAFA', name: 'Mori', playerLabel: 'M' }),
    new RaceDuck({ color: '#FAFAFA', name: 'Ori', playerLabel: 'O' }),
  ],
  resultLines: [],
  /** @type {{ p1Progress: number, p2Progress: number, lane0: number, lane1: number } | null} */
  finishSnapshot: null,
  finishSequenceElapsed: 0,
};

/** P2 간단 AI — 교대 탭 + 약간의 랜덤 간격 */
let p2AiCooldown = 0;

/** app.js에서 startGame 시 결승 콜백 */
let pendingRaceFinish = null;
/** 경주 루프(requestAnimationFrame) 동작 여부 */
let raceLoopRunning = false;
let rafId = 0;

function resetRace() {
  game.ducks.forEach((d) => d.reset());
  game.raceElapsed = 0;
  game.finishSnapshot = null;
  game.finishSequenceElapsed = 0;
  game.raceJustStarted = false;
  p2AiCooldown = 0.15 + Math.random() * 0.1;
}

function beginCountdown() {
  game.phase = GamePhase.COUNTDOWN;
  game.countdownElapsed = 0;
}

function beginRacing() {
  resetRace();
  game.phase = GamePhase.RACING;
  game.raceJustStarted = true;
}

function buildResult() {
  const [d0, d1] = game.ducks;
  const m0 = progressToMeters(d0.progress);
  const m1 = progressToMeters(d1.progress);
  const diff = Math.abs(m0 - m1);
  let headline;
  if (m0 > m1) headline = `${d0.name} 승리!`;
  else if (m1 > m0) headline = `${d1.name} 승리!`;
  else headline = '무승부!';
  game.resultLines = [
    headline,
    `나(M) ${m0.toFixed(1)}m · 상대(O) ${m1.toFixed(1)}m`,
    `차이 ${diff.toFixed(1)}m`,
  ];
}

export function syncCanvasSize() {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  renderer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function pointerListFromEvent(e) {
  if (e.changedTouches) return Array.from(e.changedTouches);
  return [{ clientX: e.clientX, clientY: e.clientY }];
}

function onPointerDown(e) {
  e.preventDefault();
  if (!raceLoopRunning && game.phase !== GamePhase.RESULT) return;

  if (game.phase === GamePhase.MENU) {
    beginCountdown();
    return;
  }
  if (game.phase === GamePhase.RESULT) {
    game.phase = GamePhase.MENU;
    resetRace();
    return;
  }
  if (game.phase !== GamePhase.RACING) return;

  for (const t of pointerListFromEvent(e)) {
    const foot = hitTestP1Pads(t.clientX, t.clientY, canvas);
    if (foot) {
      applyFootTap(game.ducks[0], foot, track);
      renderer.queueTapBurst(foot);
    }
  }
}

canvas.addEventListener('touchstart', onPointerDown, { passive: false });
canvas.addEventListener('mousedown', onPointerDown);
console.log('[race] 입력 이벤트 바인딩됨 (#game-canvas touchstart/mousedown)');

let lastT = performance.now();

function tickP2Ai(dt) {
  const d2 = game.ducks[1];
  p2AiCooldown -= dt;
  if (p2AiCooldown > 0) return;
  let foot;
  if (d2.lastFoot === null) foot = Math.random() < 0.5 ? 'left' : 'right';
  else foot = d2.lastFoot === 'left' ? 'right' : 'left';
  if (Math.random() < 0.06) {
    foot = foot === 'left' ? 'right' : 'left';
  }
  applyFootTap(d2, foot, track);
  p2AiCooldown = 0.11 + Math.random() * 0.11;
}

function frame(now) {
  if (!raceLoopRunning) {
    rafId = 0;
    return;
  }

  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  game.time = now / 1000;

  if (game.phase === GamePhase.COUNTDOWN) {
    game.countdownElapsed += dt;
    if (game.countdownElapsed >= COUNTDOWN_TOTAL) beginRacing();
  }

  if (game.phase === GamePhase.RACING) {
    tickP2Ai(dt);
    game.raceElapsed += dt;
    for (const d of game.ducks) {
      integrateRacePhysics(d, dt, track);
    }
    const d0 = game.ducks[0];
    const d1 = game.ducks[1];
    const lineDone = d0.progress >= TRACK_DISTANCE_M || d1.progress >= TRACK_DISTANCE_M;
    const timeDone = game.raceElapsed >= RACE_TIME_LIMIT_SEC;
    if (lineDone || timeDone) {
      game.finishSnapshot = {
        p1Progress: d0.progress,
        p2Progress: d1.progress,
        lane0: d0.laneOffset,
        lane1: d1.laneOffset,
      };
      game.finishSequenceElapsed = 0;
      game.phase = GamePhase.FINISH_SEQUENCE;
    }
  }

  if (game.phase === GamePhase.FINISH_SEQUENCE) {
    game.finishSequenceElapsed += dt;
    if (game.finishSequenceElapsed >= finishSequenceTotalSec()) {
      game.phase = GamePhase.RESULT;
      buildResult();
      const cb = pendingRaceFinish;
      pendingRaceFinish = null;
      if (cb) {
        const d0 = game.ducks[0];
        const d1 = game.ducks[1];
        const m0 = progressToMeters(d0.progress);
        const m1 = progressToMeters(d1.progress);
        let result = 'draw';
        if (m0 > m1) result = 'win';
        else if (m1 > m0) result = 'lose';
        const payload = {
          result,
          time: Math.min(game.raceElapsed, RACE_TIME_LIMIT_SEC),
          taps: d0.tapCount ?? 0,
          distance: m0,
          opponentDistance: m1,
        };
        console.log('[race] onFinish 콜백 호출됨', payload);
        cb(payload);
      }
      raceLoopRunning = false;
      rafId = 0;
      return;
    }
  }

  renderer.render(game);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  drawGameOverlay(
    renderer.ctx,
    w,
    h,
    game.phase,
    game.countdownElapsed,
    game.resultLines,
  );

  if (raceLoopRunning) {
    rafId = requestAnimationFrame(frame);
  }
}

window.addEventListener('resize', syncCanvasSize);
syncCanvasSize();

/**
 * P1 오리 표시 이름/색 (경주 시작 전 호출)
 * @param {{ name?: string, color?: string }} profile
 */
export function setPlayerRaceDuck(profile) {
  const d = game.ducks[0];
  if (profile.name != null) d.name = profile.name;
  if (profile.color != null) d.color = profile.color;
}

/**
 * 경주 시작 — 카운트다운 후 레이싱. 끝나면 onFinish 콜백 1회.
 * @param {{ name?: string }} opponent 상대 닉네임 등
 * @param {(payload: { result: string, time: number, taps: number, distance: number, opponentDistance: number }) => void} onFinish
 */
export function startGame(opponent, onFinish) {
  console.log('[race] startGame 호출됨', opponent);
  if (opponent && typeof opponent.name === 'string') {
    game.ducks[1].name = opponent.name;
  }
  pendingRaceFinish = onFinish;
  resetRace();
  beginCountdown();
  raceLoopRunning = true;
  lastT = performance.now();
  if (!rafId) {
    rafId = requestAnimationFrame(frame);
  }
}

/** 강제로 루프 중단 (앱에서 화면 이탈 시) */
export function stopRaceLoop() {
  raceLoopRunning = false;
  pendingRaceFinish = null;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}
