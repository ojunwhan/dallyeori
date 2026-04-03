/**
 * P1 전용 — 화면 최하단 왼발·오른발 물갈퀴 패드 (touchstart, preventDefault)
 * 세로 360×640 디자인 기준 패드 → letterbox 변환 후 히트 판정
 */

import {
  getPortraitLetterbox,
  getPadLayoutDesign,
  hitTestP1PadsPortrait,
} from './layoutPortrait.js';

/** @typedef {'left'|'right'} Foot */

/**
 * CSS 픽셀 기준 패드 중심·반축 (탭 이펙트 등) — renderer와 동일 기하
 */
export function computeBottomPadLayout(canvas) {
  const L = getPortraitLetterbox(canvas.clientWidth, canvas.clientHeight);
  const d = getPadLayoutDesign();
  return {
    left: {
      cx: L.ox + d.left.cx * L.s,
      cy: L.oy + d.left.cy * L.s,
      rx: d.left.rx * L.s,
      ry: d.left.ry * L.s,
    },
    right: {
      cx: L.ox + d.right.cx * L.s,
      cy: L.oy + d.right.cy * L.s,
      rx: d.right.rx * L.s,
      ry: d.right.ry * L.s,
    },
  };
}

/** P1 패드 히트 — 'left' | 'right' | null */
export function hitTestP1Pads(clientX, clientY, canvas) {
  return hitTestP1PadsPortrait(clientX, clientY, canvas);
}
