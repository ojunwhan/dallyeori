/**
 * 경주 기록 히스토리 — localStorage, 최대 500건
 */

const KEY = (uid) => `dallyeori.raceHistory.${uid}`;
const MAX = 500;

/**
 * @typedef {{
 *   id: string,
 *   date: number,
 *   opponentId: string | null,
 *   opponentNick: string,
 *   myDistance: number,
 *   opponentDistance: number,
 *   duration: number,
 *   result: 'win'|'lose'|'draw',
 *   mySpeed: number
 * }} RaceHistoryEntry
 */

/** @returns {RaceHistoryEntry[]} */
function readAll(uid) {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(KEY(uid));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(uid, list) {
  if (!uid) return;
  localStorage.setItem(KEY(uid), JSON.stringify(list.slice(0, MAX)));
}

function newId() {
  return `rh_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {object} state appState
 * @param {object} last normalized lastRaceResult
 * @param {object | null} opp lastOpponent
 */
export function saveRaceResult(state, last, opp) {
  const uid = state?.user?.uid;
  if (!uid || !last) return;
  const duration = Number(last.time);
  const myD = Number(last.myDistance ?? last.distance ?? 0);
  const opD = Number(last.oppDistance ?? last.opponentDistance ?? 0);
  const res = last.result === 'win' || last.result === 'lose' || last.result === 'draw' ? last.result : 'lose';
  const mySpeed = duration > 0 ? myD / duration : 0;

  const entry = /** @type {RaceHistoryEntry} */ ({
    id: newId(),
    date: Date.now(),
    opponentId: opp?.userId ?? null,
    opponentNick: String(opp?.nickname ?? '상대'),
    myDistance: myD,
    opponentDistance: opD,
    duration,
    result: res,
    mySpeed,
  });

  const list = [entry, ...readAll(uid)];
  writeAll(uid, list);
}

/**
 * @param {string} uid
 * @param {number} [limit]
 * @returns {RaceHistoryEntry[]}
 */
export function getRaceHistory(uid, limit = 100) {
  const num = Number(limit);
  const n = Math.max(1, Math.min(MAX, Number.isFinite(num) && num > 0 ? Math.floor(num) : 100));
  return readAll(uid).slice(0, n);
}

/**
 * @param {string} uid
 * @param {string | null | undefined} opponentId
 */
export function getStatsVsOpponent(uid, opponentId) {
  if (!uid || !opponentId) {
    return { wins: 0, losses: 0, draws: 0, races: [] };
  }
  const races = readAll(uid).filter((r) => r.opponentId === opponentId);
  let w = 0;
  let l = 0;
  let d = 0;
  for (const r of races) {
    if (r.result === 'win') w++;
    else if (r.result === 'lose') l++;
    else d++;
  }
  return { wins: w, losses: l, draws: d, races };
}

/**
 * @param {string} uid
 */
export function getOverallStats(uid) {
  const list = readAll(uid);
  let w = 0;
  let l = 0;
  let d = 0;
  let speedSum = 0;
  let best = 0;
  for (const r of list) {
    if (r.result === 'win') w++;
    else if (r.result === 'lose') l++;
    else d++;
    speedSum += r.mySpeed;
    if (r.mySpeed > best) best = r.mySpeed;
  }
  const n = list.length;
  return {
    wins: w,
    losses: l,
    draws: d,
    totalRaces: n,
    avgSpeed: n > 0 ? speedSum / n : 0,
    bestSpeed: best,
  };
}

/**
 * 최근 N경주 평균 속도 (랭킹용, 최대 100)
 * @param {string} uid
 */
export function getRecentAverageSpeed(uid, cap = 100) {
  const list = readAll(uid).slice(0, Math.min(100, cap));
  if (list.length === 0) return 0;
  const sum = list.reduce((a, r) => a + r.mySpeed, 0);
  return sum / list.length;
}
