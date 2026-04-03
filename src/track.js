import { TRACK_TYPE } from './constants.js';

const PRESETS = {
  [TRACK_TYPE.NORMAL]: {
    id: TRACK_TYPE.NORMAL,
    label: '일반 트랙',
    frictionMu: 0.8,
    tapImpulseScale: 1,
    trackHalfWidth: 0.45,
    hasCliffEdge: false,
  },
  [TRACK_TYPE.ICE]: {
    id: TRACK_TYPE.ICE,
    label: '얼음판',
    frictionMu: 0.05,
    tapImpulseScale: 0.6,
    trackHalfWidth: 0.45,
    hasCliffEdge: false,
  },
  [TRACK_TYPE.WATER]: {
    id: TRACK_TYPE.WATER,
    label: '물 위',
    frictionMu: 0.4,
    tapImpulseScale: 0.5,
    trackHalfWidth: 0.45,
    hasCliffEdge: false,
  },
  [TRACK_TYPE.CLIFF]: {
    id: TRACK_TYPE.CLIFF,
    label: '벼랑',
    frictionMu: 0.8,
    tapImpulseScale: 1,
    trackHalfWidth: 0.22,
    hasCliffEdge: true,
  },
  [TRACK_TYPE.CLIFF_ICE]: {
    id: TRACK_TYPE.CLIFF_ICE,
    label: '벼랑+얼음',
    frictionMu: 0.05,
    tapImpulseScale: 0.6,
    trackHalfWidth: 0.18,
    hasCliffEdge: true,
  },
};

export function getTrackPreset(typeId = TRACK_TYPE.NORMAL) {
  return PRESETS[typeId] ?? PRESETS[TRACK_TYPE.NORMAL];
}

export function effectiveFrictionMu(track) {
  return track.frictionMu ?? 0.8;
}

export { TRACK_TYPE };
