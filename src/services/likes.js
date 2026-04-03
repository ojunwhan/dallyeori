/**
 * 호감 표시 — 같은 사람에게 하루 1회
 */

const sentKey = (uid) => `dallyeori.likes.sent.${uid}`;
const recvKey = (uid) => `dallyeori.likes.recv.${uid}`;
const lastViewKey = (uid) => `dallyeori.likes.lastView.${uid}`;

function dayKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

/**
 * 오늘 이미 보냈는지
 * @param {string} uid
 * @param {string} targetId
 */
export function canSendLikeToday(uid, targetId) {
  const today = dayKey(Date.now());
  return !readSent(uid).some((x) => x.targetId === targetId && x.day === today);
}

/**
 * @param {string} fromUid
 * @param {string} targetId
 */
export function sendLike(fromUid, targetId) {
  if (!fromUid || !targetId || fromUid === targetId) return { ok: false, error: 'invalid' };
  const today = dayKey(Date.now());
  const sent = readSent(fromUid);
  if (sent.some((x) => x.targetId === targetId && x.day === today)) {
    return { ok: false, error: 'daily_limit' };
  }
  const ts = Date.now();
  sent.push({ targetId, day: today, ts });
  writeSent(fromUid, sent);
  const recv = readRecv(targetId);
  recv.push({ fromId: fromUid, ts });
  writeRecv(targetId, recv);
  return { ok: true };
}

/**
 * @param {string} uid
 */
export function getLikesReceived(uid) {
  return readRecv(uid).slice().reverse();
}

/**
 * @param {string} uid
 */
export function getLikesSent(uid) {
  return readSent(uid).slice().reverse();
}

/**
 * 상호 호감: 서로에게 보낸 기록이 각각 1회 이상
 * @param {string} uid
 * @param {string} targetId
 */
export function isMutualLike(uid, targetId) {
  const iSent = readSent(uid).some((x) => x.targetId === targetId);
  const theySent = readRecv(uid).some((x) => x.fromId === targetId);
  return iSent && theySent;
}

/**
 * 마지막 호감 알림 확인 시각 이후 받은 호감 수
 * @param {string} uid
 */
export function getNewLikesCount(uid) {
  const last = Number(localStorage.getItem(lastViewKey(uid)) || '0');
  return readRecv(uid).filter((x) => x.ts > last).length;
}

/**
 * 친구 화면 등 진입 시 호감 뱃지 초기화
 * @param {string} uid
 */
export function markLikesNotificationsSeen(uid) {
  localStorage.setItem(lastViewKey(uid), String(Date.now()));
}
