/**
 * 물리·UI·캐릭터 상수 — CURSOR_CONTEXT §16 (튜닝은 여기서만)
 */

/** 트랙 결승 거리(m) — 먼저 도착하면 승리 */
export const TRACK_DISTANCE_M = 70;
/** 레이싱 페이즈 제한 시간(초) — 카운트다운 제외, 초과 시 거리로 승부 */
export const RACE_TIME_LIMIT_SEC = 13;
/** 탭 1회당 전진 거리(cm) — 10탭/s·70m면 약 11.7초 */
export const TAP_STRIDE_CM = 60;
export const TAP_STRIDE_M = TAP_STRIDE_CM / 100;

/** 타이머 0 이후 결승 리본·넘어짐 연출(초) — renderer와 동기 */
export const FINISH_SEQUENCE_TIMINGS = Object.freeze({
  ribbon: 0.38,
  tumbleStart: 0.07,
  tumbleEnd: 0.68,
  facePlantHold: 1.0,
  headLift: 0.52,
  toResult: 0.12,
});

export function finishSequenceTotalSec() {
  const s = FINISH_SEQUENCE_TIMINGS;
  return s.tumbleEnd + s.facePlantHold + s.headLift + s.toResult;
}

/** v3·UI 정렬: 숫자 2 → 1 → GO, 숫자 구간당 초 */
export const COUNTDOWN_START_VAL = 2;
export const COUNTDOWN_STEP_SEC = 1;

/** Canvas DPR 상한 */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/** 상점에서 추가 오리 1마리 구매 시 하트 (Phase 3 통화) */
export const DUCK_PURCHASE_HEARTS = 50;

/**
 * 9마리 오리 — id, 표시 이름, 색, 상점 구매가(DUCK_PURCHASE_HEARTS)
 * @typedef {{ id: string, name: string, color: string, price: number }} DuckDef
 */
export const DUCKS_NINE = Object.freeze(
  /** @type {readonly DuckDef[]} */ ([
    { id: 'tori', name: '토리', color: '#FF3B30', price: DUCK_PURCHASE_HEARTS },
    { id: 'sori', name: '소리', color: '#FF9500', price: DUCK_PURCHASE_HEARTS },
    { id: 'mari', name: '마리', color: '#FFD700', price: DUCK_PURCHASE_HEARTS },
    { id: 'nuri', name: '누리', color: '#34C759', price: DUCK_PURCHASE_HEARTS },
    { id: 'bori', name: '보리', color: '#007AFF', price: DUCK_PURCHASE_HEARTS },
    { id: 'yuri', name: '유리', color: '#283593', price: DUCK_PURCHASE_HEARTS },
    { id: 'nari', name: '나리', color: '#AF52DE', price: DUCK_PURCHASE_HEARTS },
    { id: 'duri', name: '두리', color: '#1C1C1E', price: DUCK_PURCHASE_HEARTS },
    { id: 'ari', name: '아리', color: '#F2F2F7', price: DUCK_PURCHASE_HEARTS },
  ]),
);

/** 3D 레이스 렌더러용 몸/목걸이 색 (hex) — DUCKS_NINE과 별도 */
export const DUCK_3D_COLORS = Object.freeze({
  tori: { body: 0xc62828, collar: 0xffd700 },
  sori: { body: 0xf57c00, collar: 0xc62828 },
  mari: { body: 0xfdd835, collar: 0x43a047 },
  nuri: { body: 0x43a047, collar: 0xfdd835 },
  bori: { body: 0x1e88e5, collar: 0xffffff },
  yuri: { body: 0x1a237e, collar: 0xffd700 },
  nari: { body: 0x8e24aa, collar: 0xffffff },
  duri: { body: 0x212121, collar: 0xff6b00 },
  ari: { body: 0xfafafa, collar: 0xe91e63 },
});

/** 8마리 오리 — 성능 동일, 색만 다름 */
export const DUCKS = Object.freeze([
  { id: 'mori', name: '모리', color: '#FF3B30' },
  { id: 'ori', name: '오리', color: '#FF9500' },
  { id: 'gori', name: '고리', color: '#FFCC00' },
  { id: 'guri', name: '구리', color: '#34C759' },
  { id: 'bori', name: '보리', color: '#007AFF' },
  { id: 'gwiri', name: '귀리', color: '#5856D6' },
  { id: 'bbiri', name: '삐리', color: '#AF52DE' },
  { id: 'byeori', name: '벼리', color: '#1C1C1E' },
]);

export const TRACK_TYPE = Object.freeze({
  NORMAL: 'normal',
  ICE: 'ice',
  WATER: 'water',
  CLIFF: 'cliff',
  CLIFF_ICE: 'cliff_ice',
});

/**
 * progress = 주행 거리(m) — 0 ~ TRACK_DISTANCE_M
 */
export const RACE = Object.freeze({
  progressPerSpeedSec: 0.048,
});

/** legacy: 트랙 스크롤 스케일(기존 progress 단위와 시각 연속) */
export const WORLD_Z_PER_PROGRESS = 8200;
/** 구 meters 매핑 계수 — WORLD_Z_PER_METER = WORLD_Z / 구식 1m 표현 */
export const METERS_PER_PROGRESS = 165;
/** progress(미터) → 월드 Z */
export const WORLD_Z_PER_METER = WORLD_Z_PER_PROGRESS / METERS_PER_PROGRESS;

export function progressToMeters(progress) {
  return Math.max(0, Math.min(TRACK_DISTANCE_M, progress));
}

/**
 * 물리 — §4 마찰·관성·꼬꾸라짐·같은 발 틀어짐
 */
export const PHYSICS = Object.freeze({
  maxSpeed: 3.35,
  /** 정확한 교대 탭 시 가속 */
  tapImpulse: 0.48,
  /** 같은 발 연속 시 옆으로 밀리는 정도 (속도에 일부 비례) */
  wrongFootLaneKick: 2.0,
  /** 같은 발일 때 전진 탭 효율 비율 */
  wrongFootForwardRatio: 0.32,
  laneVelDampPerSec: 7.5,
  laneOffsetSpringPerSec: 5.0,
  laneMaxAbs: 1.15,
  /**
   * 교대 탭(반대발) 1회당 laneOffset을 중앙으로 당기는 양(절댓값).
   * |틀어짐|보다 크면 0까지만 줄어듦 — 한 번에 원위치 금지.
   */
  laneRecoveryStepPerAlternatingTap: 0.28,
  /** 교대 탭 시 횡방향 속도도 함께 줄여 보정이 바로 무너지지 않게 */
  laneRecoverVelFactorOnAlternatingTap: 0.55,
  /** |laneOffset| 클수록 전진 효율 감소 */
  laneProgressPenalty: 0.38,
  /** 마찰: exp 감쇠 계수 베이스 (트랙 frictionMu와 곱) */
  frictionStrength: 1.25,
  dragK: 0.14,
  /** 꼬꾸라짐: 순간 감속 임계 (속도 단위/초) */
  tumbleDecelThreshold: 3.8,
  tumbleRecoverySec: 0.52,
  minSpeedForTumble: 0.75,
  /** 쓰러진 동안 탭 효과 비율 (§4 입력 무시/감소) */
  inputWhileDownScale: 0.14,
});

/** 터치패드: 대략 1cm / 중심 3cm — CSS px/cm (96dpi 기준 ~37.8) */
export const INPUT = Object.freeze({
  cssPxPerCm: 37.8,
  padDiameterCm: 1,
  padGapCm: 3,
  bandMarginBottomCm: 0.35,
});

/** P1 단일 패드 — 지름 최소(px), 실제 반지름은 input.js에서 2배 스케일과 함께 적용 */
export const MIN_TOUCH_PAD_DIAMETER_PX = 60;

export function getDuckByIndex(index) {
  return DUCKS[((index % DUCKS.length) + DUCKS.length) % DUCKS.length];
}

export function getDuckNineById(id) {
  const d = DUCKS_NINE.find((x) => x.id === id);
  return d ?? DUCKS_NINE[DUCKS_NINE.length - 1];
}

/**
 * Race v3 엔진 물리 — Unity 이식용 단일 객체
 * @type {Readonly<{
 *   DUCK_MASS: number, TAP_FORCE: number, MAX_SPEED: number, AIR_RESISTANCE: number,
 *   SAME_FOOT_ANGLE: number, ANGLE_RECOVERY: number,
 *   STUMBLE_THRESHOLD: number, STUMBLE_GAP: number, STUMBLE_DECEL_PER_S: number,
 *   TERRAIN: Record<string, {
 *     name: string, friction: number, slideDecay: number, trackWidth: number,
 *     slipOnSameFoot: boolean, spinRate?: number, spinRecovery?: number,
 *     fallThreshold?: number
 *   }>
 * }>}
 */
export const RACE_ENGINE_PHYSICS = Object.freeze({
  DUCK_MASS: 3.5,
  TAP_FORCE: 1.8,
  MAX_SPEED: 4.5,
  AIR_RESISTANCE: 0.02,
  SAME_FOOT_ANGLE: 0.18,
  ANGLE_RECOVERY: 0.16,
  /** 순간 속도 m/s — 탭이 끊기면 꼬꾸라짐 */
  STUMBLE_THRESHOLD: 2.2,
  /** 초 — 이 간격 이상 탭 없으면 */
  STUMBLE_GAP: 0.42,
  /** 꼬꾸라진 동안 감속 (m/s²에 가까운 스칼라, dt 적용) */
  STUMBLE_DECEL_PER_S: 5.5,
  TERRAIN: Object.freeze({
    normal: Object.freeze({
      name: '일반 트랙',
      friction: 0.85,
      slideDecay: 0.95,
      trackWidth: Number.POSITIVE_INFINITY,
      slipOnSameFoot: false,
    }),
    ice: Object.freeze({
      name: '얼음판',
      friction: 0.25,
      slideDecay: 0.995,
      trackWidth: Number.POSITIVE_INFINITY,
      slipOnSameFoot: true,
      spinRate: 0.35,
      spinRecovery: 0.05,
    }),
    cliff: Object.freeze({
      name: '벼랑',
      friction: 0.85,
      slideDecay: 0.95,
      trackWidth: 2.0,
      slipOnSameFoot: false,
      fallThreshold: 1.0,
    }),
    iceCliff: Object.freeze({
      name: '얼음 벼랑',
      friction: 0.25,
      slideDecay: 0.995,
      trackWidth: 2.0,
      slipOnSameFoot: true,
      spinRate: 0.35,
      spinRecovery: 0.05,
      fallThreshold: 1.0,
    }),
  }),
});
