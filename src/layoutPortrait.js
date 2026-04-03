/**
 * 세로 MVP 레이아웃 (reference_google.html: 360×640 디자인 공간)
 * 실제 캔버스는 letterbox 스케일 후 이 좌표계로 그림.
 */

export const DESIGN_W = 360;
export const DESIGN_H = 640;

/**
 * @returns {{ s: number, ox: number, oy: number, dw: number, dh: number }}
 */
export function getPortraitLetterbox(canvasCssW, canvasCssH) {
  const s = Math.min(canvasCssW / DESIGN_W, canvasCssH / DESIGN_H);
  const ox = (canvasCssW - DESIGN_W * s) / 2;
  const oy = (canvasCssH - DESIGN_H * s) / 2;
  return { s, ox, oy, dw: DESIGN_W, dh: DESIGN_H };
}

export function designToClient(px, py, L) {
  return { x: L.ox + px * L.s, y: L.oy + py * L.s };
}

export function clientToDesign(px, py, L) {
  return { x: (px - L.ox) / L.s, y: (py - L.oy) / L.s };
}

/**
 * 디자인 공간 기준 패드 (타원 히트용 rx/ry)
 */
export function getPadLayoutDesign() {
  const padW = 168;
  const padH = 132;
  const gap = 12;
  const bottom = 18;
  const cy = DESIGN_H - bottom - padH / 2;
  const mid = DESIGN_W / 2;
  return {
    left: { cx: mid * 0.5, cy, rx: padW / 2, ry: padH / 2 },
    right: { cx: mid * 1.5, cy, rx: padW / 2, ry: padH / 2 },
  };
}

function inDesignEllipse(px, py, pad) {
  const dx = (px - pad.cx) / pad.rx;
  const dy = (py - pad.cy) / pad.ry;
  return dx * dx + dy * dy <= 1;
}

/** @param {HTMLCanvasElement} canvas */
export function hitTestP1PadsPortrait(clientX, clientY, canvas) {
  const L = getPortraitLetterbox(canvas.clientWidth, canvas.clientHeight);
  const p = clientToDesign(clientX, clientY, L);
  const pads = getPadLayoutDesign();
  if (inDesignEllipse(p.x, p.y, pads.left)) return 'left';
  if (inDesignEllipse(p.x, p.y, pads.right)) return 'right';
  return null;
}
