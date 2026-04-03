import { PHYSICS, TAP_STRIDE_M, TRACK_DISTANCE_M } from './constants.js';
import { effectiveFrictionMu } from './track.js';

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function addRaceMeters(duck, m) {
  duck.progress = clamp(duck.progress + m, 0, TRACK_DISTANCE_M);
}

/**
 * 급감속 시 꼬꾸라짐 (CURSOR_CONTEXT §4)
 */
export function shouldTriggerTumble(prevSpeed, newSpeed, dt) {
  if (dt <= 0) return false;
  const decel = (prevSpeed - newSpeed) / dt;
  return decel > PHYSICS.tumbleDecelThreshold && prevSpeed >= PHYSICS.minSpeedForTumble;
}

/**
 * 교대 탭 / 같은 발 탭 반영 (호출부에서 foot만 넘김)
 * @param {import('./duck.js').RaceDuck} duck
 * @param {'left'|'right'} foot
 * @param {object} track — getTrackPreset()
 */
export function applyFootTap(duck, foot, track) {
  const scale = duck.isDown ? PHYSICS.inputWhileDownScale : 1;
  const tapBase = PHYSICS.tapImpulse * (track.tapImpulseScale ?? 1) * scale;
  const alternating = duck.lastFoot === null || duck.lastFoot !== foot;

  if (alternating) {
    duck.speed += tapBase;
    addRaceMeters(duck, TAP_STRIDE_M * (track.tapImpulseScale ?? 1) * scale);
    const lo = duck.laneOffset;
    const step = PHYSICS.laneRecoveryStepPerAlternatingTap;
    if (lo > 1e-6) {
      const pull = Math.min(step, lo);
      duck.laneOffset = lo - pull;
    } else if (lo < -1e-6) {
      const pull = Math.min(step, -lo);
      duck.laneOffset = lo + pull;
    }
    duck.laneVel *= PHYSICS.laneRecoverVelFactorOnAlternatingTap;
  } else {
    const kick = PHYSICS.wrongFootLaneKick * (0.35 + duck.speed * 0.22);
    duck.laneVel += foot === 'left' ? -kick : kick;
    duck.speed += tapBase * PHYSICS.wrongFootForwardRatio;
    addRaceMeters(
      duck,
      TAP_STRIDE_M * PHYSICS.wrongFootForwardRatio * (track.tapImpulseScale ?? 1) * scale,
    );
  }

  duck.speed = clamp(duck.speed, 0, PHYSICS.maxSpeed);
  duck.lastFoot = foot;
  duck.lastStepFoot = foot;

  duck.tapCount = (duck.tapCount ?? 0) + 1;
  duck.tapFlash = 1;
  duck.animWobble = 0.3 * duck._wobbleDir;
  duck._wobbleDir *= -1;
  duck.animHeadBob = 1;
  duck.animStepLift = 1;
}

/**
 * 마찰·저항·차선·진행도·꼬꾸라짐 (dt 초 단위)
 * @param {import('./duck.js').RaceDuck} duck
 * @param {number} dt
 * @param {object} track
 */
export function integrateRacePhysics(duck, dt, track) {
  const prevSpeed = duck.speed;

  if (duck.isDown) {
    duck.tumbleTimer -= dt;
    if (duck.tumbleTimer <= 0) {
      duck.isDown = false;
      duck.tumbleTimer = 0;
    }
  }

  const mu = effectiveFrictionMu(track);
  const fr = Math.exp(-PHYSICS.frictionStrength * mu * dt);
  duck.speed *= fr;
  duck.speed -= PHYSICS.dragK * duck.speed * duck.speed * dt;
  duck.speed = clamp(duck.speed, 0, PHYSICS.maxSpeed);

  if (duck.speed > 0.05) duck.animFeet += duck.speed * dt * 8;
  if (duck.animStepLift > 0.012) duck.animStepLift *= Math.exp(-dt * 9);
  else duck.animStepLift = 0;
  duck.animWobble *= 0.9;
  duck.animHeadBob *= 0.92;
  if (duck.tapFlash > 0.01) duck.tapFlash *= 0.9;
  else duck.tapFlash = 0;

  const damp = Math.exp(-PHYSICS.laneVelDampPerSec * dt);
  duck.laneVel *= damp;
  duck.laneOffset += duck.laneVel * dt;
  const spring = Math.exp(-PHYSICS.laneOffsetSpringPerSec * dt);
  duck.laneOffset *= spring;
  duck.laneOffset = clamp(duck.laneOffset, -PHYSICS.laneMaxAbs, PHYSICS.laneMaxAbs);

  if (!duck.isDown && shouldTriggerTumble(prevSpeed, duck.speed, dt)) {
    duck.isDown = true;
    duck.tumbleTimer = PHYSICS.tumbleRecoverySec;
  }
}
