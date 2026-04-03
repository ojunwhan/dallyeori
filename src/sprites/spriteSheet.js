/**
 * sprite_sheet.png (실측 2800×1504, reference_google.html sprites 구조)
 *
 * 검증: 도구로 8열×350px 상단 오리 행, sy=700 중단 패드, sy=1102 하단 HUD/트랙
 */

export const SPRITE_SHEET_SIZE = Object.freeze({ w: 2800, h: 1504 });

/* eslint-disable object-curly-newline */
/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 */
export const sprites = Object.freeze({
  /** 한 오리 프레임 크기 (픽셀) */
  frameW: 350,
  frameH: 700,

  /**
   * 아리(좌상): 첫 프레임 좌상단 기준점 — draw 시 poses[i]를 더함
   * @type {Point}
   */
  ari: { x: 0, y: 0 },

  /**
   * 까리(우상)
   * @type {Point}
   */
  kkari: { x: 1400, y: 0 },

  /**
   * 0 Neutral, 1 왼발 앞, 2 오른발 앞, 3 작은/런·꼬꾸라짐
   * @type {readonly Point[]}
   */
  poses: Object.freeze([
    { x: 0, y: 0 },
    { x: 350, y: 0 },
    { x: 700, y: 0 },
    { x: 1050, y: 0 },
  ]),

  /** 트랙 배경 타일 (우하단) */
  track: Object.freeze({ x: 1400, y: 1102, w: 1400, h: 402 }),

  pads: Object.freeze({
    left: Object.freeze({ x: 0, y: 700, w: 700, h: 402 }),
    right: Object.freeze({ x: 700, y: 700, w: 700, h: 402 }),
  }),

  /** 정적 HUD 비트맵 전체 (좌하) — 부분 UI는 같은 조각 재사용 */
  ui: Object.freeze({
    hud: Object.freeze({ x: 0, y: 1102, w: 1400, h: 402 }),
  }),
});
/* eslint-enable object-curly-newline */

/**
 * @param {CanvasImageSource} img
 * @param {Rect} src
 */
export function drawSpriteRect(ctx, img, src, dx, dy, dw, dh) {
  ctx.drawImage(img, src.x, src.y, src.w, src.h, dx, dy, dw, dh);
}

/**
 * reference_google 스타일 오리 1프레임
 * @param {'ari'|'kkari'} which
 * @param {number} poseIndex 0..3
 */
export function drawDuckFrame(ctx, img, which, poseIndex, dx, dy, dw, dh) {
  const base = which === 'ari' ? sprites.ari : sprites.kkari;
  const off = sprites.poses[poseIndex];
  const sx = base.x + off.x;
  const sy = base.y + off.y;
  ctx.drawImage(img, sx, sy, sprites.frameW, sprites.frameH, dx, dy, dw, dh);
}

/**
 * @returns {Promise<HTMLImageElement>}
 */
export function loadSpriteSheet() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('sprite_sheet.png 로드 실패 — src/sprites/sprite_sheet.png 를 확인하세요'));
    img.src = new URL('./sprite_sheet.png', import.meta.url).href;
  });
}
