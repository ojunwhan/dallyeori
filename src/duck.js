/** @typedef {'left'|'right'} Foot */

/**
 * 레이스 중 단일 오리 상태 (CURSOR_CONTEXT §4–5)
 */
export class RaceDuck {
  /**
   * @param {{ color: string, name: string, playerLabel?: string }} opts
   */
  constructor(opts) {
    this.color = opts.color;
    this.name = opts.name;
    this.playerLabel = opts.playerLabel ?? '';
    this.reset();
  }

  reset() {
    this.progress = 0;
    this.speed = 0;
    this.lastFoot = null;
    this.laneOffset = 0;
    this.laneVel = 0;
    this.isDown = false;
    this.tumbleTimer = 0;
    this.lastStepFoot = null;
    this.finished = false;
    this.finishTime = null;
    /** 같은 시각 결승 시 순서 */
    this.finishOrder = null;
    /** v3 스타일 렌더·HUD용 */
    this.tapCount = 0;
    this.animFeet = 0;
    /** 탭 직후 1→감쇠, 다리 스텝·워들 크기에 사용 */
    this.animStepLift = 0;
    this.animWobble = 0;
    this.animHeadBob = 0;
    this.tapFlash = 0;
    this._wobbleDir = 1;
  }
}
