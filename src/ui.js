/**
 * 전체 화면 오버레이 — 메뉴·카운트다운·레이싱 HUD·결과 (CURSOR_CONTEXT §6)
 */

export const GamePhase = Object.freeze({
  MENU: 'menu',
  COUNTDOWN: 'countdown',
  RACING: 'racing',
  /** 타이머 0 이후 리본·넘어짐 연출 */
  FINISH_SEQUENCE: 'finish_sequence',
  RESULT: 'result',
});

/**
 * @param {number} countdownElapsed — 카운트다운 시작 후 경과 초 (오버레이 미사용)
 */
export function drawGameOverlay(ctx, w, h, phase, countdownElapsed, resultLines) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  void countdownElapsed;
  void resultLines;

  if (phase === GamePhase.MENU) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px system-ui';
    ctx.fillText('화면을 탭해 시작', w / 2, h * 0.4);
    ctx.font = '13px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText('70m 결승선에 먼저 도착하면 승리 · 탭 1회 ≈ 60cm', w / 2, h * 0.5);
    ctx.fillText('맨 아래 물갈퀴 패드 — 왼발·오른발 번갈아 (당신 = Mori · 상대 = Ori)', w / 2, h * 0.55);
    ctx.fillText('같은 발 연속이면 옆으로 틀어져요.', w / 2, h * 0.6);
  }

  /* 카운트다운·HUD는 renderer에서 그림 */

  ctx.restore();
}
