/**
 * 궁둥이 추격 카메라 (CURSOR_CONTEXT §3)
 * Phase 1: 2D 캔버스용 단숀 오프셋/스케일 (프로토타입 포팅 시 확장)
 */
export class ChaseCamera2D {
  constructor() {
    this.offsetY = 0;
    this.worldScale = 1;
    this.shake = 0;
  }

  /** 레이스 진행도 0~1, 속도 등으로 살짝 흔들림 */
  update(dt, duckProgress, speed) {
    void dt;
    void duckProgress;
    this.shake = Math.min(8, speed * 0.05);
  }

  applyTransform(ctx, width, height) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(width / 2, height * 0.42 + this.offsetY);
    ctx.scale(this.worldScale, this.worldScale);
    if (this.shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
  }
}
