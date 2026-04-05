/**
 * 하트 보내기(일일 1회) — 같은 사람에게 하루 1회
 */

import { getGameSocket } from './socket.js';

const sentKey = (uid) => `dallyeori.likes.sent.${uid}`;
const recvKey = (uid) => `dallyeori.likes.recv.${uid}`;
const lastViewKey = (uid) => `dallyeori.likes.lastView.${uid}`;

/** KST 기준 날짜 (서버 daily_free_hearts 와 맞춤) */
function dayKey(ts) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(ts));
}

/** @returns {{ targetId: string, day: string, ts: number }[]} */
function readSent(uid) {
  try {
    const raw = localStorage.getItem(sentKey(uid));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeSent(uid, list) {
  localStorage.setItem(sentKey(uid), JSON.stringify(list));
}

/** @returns {{ fromId: string, ts: number }[]} */
function readRecv(uid) {
  try {
    const raw = localStorage.getItem(recvKey(uid));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeRecv(uid, list) {
  localStorage.setItem(recvKey(uid), JSON.stringify(list.slice(-500)));
}

/** @param {string} targetUid */
export function emitSendHeartToServer(targetUid) {
  try {
    const sock = getGameSocket();
    if (sock?.connected) {
      sock.emit('sendHeart', { targetUid });
    }
  } catch {
    /* ignore */
  }
}

/**
 * 서버 heartGiftSent 수신 후 로컬 기록 (뱃지·서로 하트 UI)
 * @param {string} fromUid
 * @param {string} targetId
 */
export function recordHeartGiftSuccess(fromUid, targetId) {
  if (!fromUid || !targetId) return;
  const today = dayKey(Date.now());
  const ts = Date.now();
  const sent = readSent(fromUid);
  if (!sent.some((x) => x.targetId === targetId && x.day === today)) {
    sent.push({ targetId, day: today, ts });
    writeSent(fromUid, sent);
  }
  const recv = readRecv(targetId);
  recv.push({ fromId: fromUid, ts });
  writeRecv(targetId, recv);
}

/**
 * (로컬 힌트) 오늘 이 친구에게 보낸 기록이 있는지 — 서버는 유료로 추가 전송 허용
 * @param {string} uid
 * @param {string} targetId
 */
export function canSendHeartToday(uid, targetId) {
  const today = dayKey(Date.now());
  return !readSent(uid).some((x) => x.targetId === targetId && x.day === today);
}

/**
 * 하트 선물 요청만 전송. 무료/유료·토스트는 서버 heartGiftSent / heartError.
 * @param {string} fromUid
 * @param {string} targetId
 */
export function sendHeart(fromUid, targetId) {
  if (!fromUid || !targetId || fromUid === targetId) return { ok: false, error: 'invalid' };
  emitSendHeartToServer(targetId);
  return { ok: true };
}

/**
 * 서버 heartError(noHearts) 시 오늘 보낸 기록 롤백 (이 기기 로컬)
 * @param {string} fromUid
 * @param {string} targetId
 */
export function revertTodayHeartSend(fromUid, targetId) {
  if (!fromUid || !targetId) return;
  const today = dayKey(Date.now());
  const sent = readSent(fromUid).filter(
    (x) => !(x.targetId === targetId && x.day === today),
  );
  writeSent(fromUid, sent);
  const cutoff = Date.now() - 120_000;
  const recv = readRecv(targetId).filter(
    (x) => !(x.fromId === fromUid && x.ts >= cutoff),
  );
  writeRecv(targetId, recv);
}

/**
 * @param {string} uid
 */
export function getHeartsReceived(uid) {
  return readRecv(uid).slice().reverse();
}

/**
 * @param {string} uid
 */
export function getHeartsSent(uid) {
  return readSent(uid).slice().reverse();
}

/**
 * 서로 하트를 주고받은 적 있음 (각각 1회 이상)
 * @param {string} uid
 * @param {string} targetId
 */
export function isMutualHeart(uid, targetId) {
  const iSent = readSent(uid).some((x) => x.targetId === targetId);
  const theySent = readRecv(uid).some((x) => x.fromId === targetId);
  return iSent && theySent;
}

/**
 * 마지막 알림 확인 이후 받은 하트 보내기 수
 * @param {string} uid
 */
export function getNewHeartsCount(uid) {
  const last = Number(localStorage.getItem(lastViewKey(uid)) || '0');
  return readRecv(uid).filter((x) => x.ts > last).length;
}

/**
 * 친구 화면 등 진입 시 뱃지 초기화
 * @param {string} uid
 */
export function markHeartNotificationsSeen(uid) {
  localStorage.setItem(lastViewKey(uid), String(Date.now()));
}
