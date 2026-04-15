/**
 * 프로필 화면용 순수 데이터 — UI와 분리 (스킨만 교체 가능)
 */

import { DUCKS_NINE } from '../constants.js';
import { getBalance } from './hearts.js';
import { getUserRecord, patchUserRecord } from './db.js';
import { resolveMediaUrl } from './auth.js';

/** @typedef {ReturnType<typeof buildProfileViewModel>} ProfileViewModel */

const LANG_LABELS = Object.freeze({
  ko: '한국어',
  en: 'English',
});

/**
 * appState + DB에서 프로필 표시용 스냅샷
 * @param {object} state
 */
export function buildProfileViewModel(state) {
  const uid = state.user?.uid ?? null;
  const rec = uid ? getUserRecord(uid) : null;

  const wins = Number(state.wins ?? rec?.wins ?? 0);
  const losses = Number(state.losses ?? rec?.losses ?? 0);
  const draws = Number(state.draws ?? rec?.draws ?? 0);
  const totalRaces = wins + losses + draws;

  const photoRaw =
    (state.profilePhotoURL || rec?.profilePhotoURL || state.user?.photoURL || '').trim() || '';
  const photoURL = resolveMediaUrl(photoRaw);

  const nickname = (state.nickname || rec?.nickname || state.user?.displayName || '').trim();
  const langCode = state.language || rec?.language || 'ko';

  const duckId = state.selectedDuckId ?? rec?.selectedDuckId ?? null;
  const duckMeta = duckId ? DUCKS_NINE.find((d) => d.id === duckId) : null;

  return {
    uid,
    photoURL,
    nickname: nickname || '—',
    languageCode: langCode,
    languageLabel: LANG_LABELS[langCode] ?? langCode,
    wins,
    losses,
    draws,
    totalRaces,
    hearts: getBalance(state),
    duckId,
    duckLabel: duckMeta ? `${duckMeta.name} (${duckMeta.id})` : null,
    hasSelectedDuck: Boolean(duckId),
  };
}

/**
 * @param {object} state
 * @param {string} nickname
 */
export function persistNickname(state, nickname) {
  const uid = state.user?.uid;
  if (!uid) return;
  const n = nickname.trim() || state.user?.displayName || '플레이어';
  state.nickname = n;
  patchUserRecord(uid, { nickname: n });
}

/**
 * @param {object} state
 * @param {string} language
 */
export function persistLanguage(state, language) {
  const uid = state.user?.uid;
  if (!uid) return;
  state.language = language;
  patchUserRecord(uid, { language });
}

/**
 * 경주 1회 반영 (승/패/무 + 총 경주수)
 * @param {object} state
 * @param {'win'|'lose'|'draw'} result
 */
export function recordRaceOutcome(state, result) {
  const uid = state.user?.uid;
  if (!uid) return;
  let w = Number(state.wins ?? 0);
  let l = Number(state.losses ?? 0);
  let d = Number(state.draws ?? 0);
  if (result === 'win') w += 1;
  else if (result === 'lose') l += 1;
  else if (result === 'draw') d += 1;
  state.wins = w;
  state.losses = l;
  state.draws = d;
  patchUserRecord(uid, { wins: w, losses: l, draws: d });
}

export { LANG_LABELS };
