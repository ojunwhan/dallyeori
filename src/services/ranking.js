/**
 * 황금오리 / TOP 랭킹 — 모킹 리더보드 + 실제 내 기록
 */

import { MOCK_USERS } from './mockUsers.js';
import { getRecentAverageSpeed, getRaceHistory } from './raceHistory.js';

/** userId 기반 고정 평균 속도 (3.4~4.05 m/s) */
function stableMockSpeed(userId) {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const x = (h >>> 0) / 4294967295;
  return 3.4 + x * 0.65;
}

/**
 * @param {string} myUid
 * @param {string} nickname
 * @param {string | null} duckId
 */
function buildBoard(myUid, nickname, duckId) {
  /** @type {{ userId: string, nickname: string, duckId: string, avgSpeed: number, totalRaces: number }[]} */
  const rows = MOCK_USERS.map((u) => {
    let h2 = 0;
    for (let j = 0; j < u.id.length; j++) h2 = (h2 * 33 + u.id.charCodeAt(j)) | 0;
    const tr = 35 + (Math.abs(h2) % 90);
    return {
      userId: u.id,
      nickname: u.nickname,
      duckId: u.duckId,
      avgSpeed: Number(stableMockSpeed(u.id).toFixed(3)),
      totalRaces: tr,
    };
  });

  if (myUid) {
    const myAvg = Number((getRecentAverageSpeed(myUid, 100) || 0).toFixed(3));
    const myTotal = getRaceHistory(myUid, 500).length;
    rows.push({
      userId: myUid,
      nickname: nickname || '나',
      duckId: duckId || 'bori',
      avgSpeed: myAvg,
      totalRaces: myTotal,
    });
  }

  rows.sort((a, b) => b.avgSpeed - a.avgSpeed);
  return rows.map((r, idx) => ({ ...r, rank: idx + 1 }));
}

/**
 * @param {string} myUid
 * @param {string} nickname
 * @param {string | null} duckId
 */
export function getTopTen(myUid, nickname, duckId) {
  const board = buildBoard(myUid, nickname, duckId);
  return board.slice(0, 10);
}

/**
 * @param {string} myUid
 * @param {string} nickname
 * @param {string | null} duckId
 */
export function getGoldenDuck(myUid, nickname, duckId) {
  const board = buildBoard(myUid, nickname, duckId);
  return board[0] ?? null;
}

/**
 * @param {string} userId
 * @param {string} myUid
 * @param {string} nickname
 * @param {string | null} duckId
 */
export function isGoldenDuck(userId, myUid, nickname, duckId) {
  const g = getGoldenDuck(myUid, nickname, duckId);
  return g != null && g.userId === userId;
}

/**
 * @param {string} myUid
 * @param {string} nickname
 * @param {string | null} duckId
 */
export function getMyRankingData(myUid, nickname, duckId) {
  if (!myUid) {
    return {
      avgSpeed: 0,
      totalRaces: 0,
      bestSpeed: 0,
      rank: null,
      inTopTen: false,
      gapToTenth: null,
    };
  }
  const board = buildBoard(myUid, nickname, duckId);
  const mine = board.find((r) => r.userId === myUid);
  const rank = mine?.rank ?? null;
  const tenth = board[9];
  const inTopTen = rank != null && rank <= 10;
  let gapToTenth = null;
  if (!inTopTen && tenth) {
    gapToTenth = Number((tenth.avgSpeed - (mine?.avgSpeed ?? 0)).toFixed(3));
  }
  const hist = getRaceHistory(myUid, 500);
  let best = 0;
  for (const h of hist) {
    if (h.mySpeed > best) best = h.mySpeed;
  }
  return {
    avgSpeed: mine?.avgSpeed ?? 0,
    totalRaces: mine?.totalRaces ?? 0,
    bestSpeed: Number(best.toFixed(4)),
    rank,
    inTopTen,
    gapToTenth: gapToTenth != null && gapToTenth > 0 ? gapToTenth : null,
  };
}
