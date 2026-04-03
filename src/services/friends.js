/**
 * 친구 — 요청/수락, 거절 기록·알림, localStorage
 */

import { getMockUser, searchMockUsersByNickname, shouldAutoRejectFriendRequest } from './mockUsers.js';

const SOCIAL_KEY = 'dallyeori.social.v1';
const REJ_KEY = (uid) => `dallyeori.friends.rejections.${uid}`;
const NOTIF_KEY = (uid) => `dallyeori.friends.rejectNotif.${uid}`;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingAutoReject = new Map();

/** @returns {{ requests: SocialRequest[] }} */
function readSocial() {
  try {
    const raw = localStorage.getItem(SOCIAL_KEY);
    const o = raw ? JSON.parse(raw) : { requests: [] };
    return { requests: Array.isArray(o.requests) ? o.requests : [] };
  } catch {
    return { requests: [] };
  }
}

/** @param {{ requests: SocialRequest[] }} data */
function writeSocial(data) {
  localStorage.setItem(SOCIAL_KEY, JSON.stringify(data));
}

/**
 * @typedef {{ id: string, fromUid: string, toUid: string, status: 'pending'|'accepted'|'rejected'|'cancelled', createdAt: number }} SocialRequest
 */

/** @param {string} uid */
function listKey(uid) {
  return `dallyeori.friends.list.${uid}`;
}

/** @returns {{ peerId: string, addedAt: number }[]} */
function readFriendList(uid) {
  try {
    const raw = localStorage.getItem(listKey(uid));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** @param {string} uid @param {{ peerId: string, addedAt: number }[]} list */
function writeFriendList(uid, list) {
  localStorage.setItem(listKey(uid), JSON.stringify(list));
}

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** @returns {{ targetId: string, rejectedAt: number, count: number }[]} */
function readRejections(uid) {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(REJ_KEY(uid));
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => ({
      targetId: String(x.targetId ?? ''),
      rejectedAt: Number(x.rejectedAt ?? x.lastRejectedAt) || 0,
      count: Math.max(0, Math.floor(Number(x.count) || 0)),
    }));
  } catch {
    return [];
  }
}

/** @param {string} uid @param {{ targetId: string, rejectedAt: number, count: number }[]} list */
function writeRejections(uid, list) {
  if (!uid) return;
  localStorage.setItem(REJ_KEY(uid), JSON.stringify(list));
}

/**
 * @param {string} myUid
 * @param {string} targetId
 */
export function getRejectionInfo(myUid, targetId) {
  if (!myUid || !targetId) {
    return { count: 0, cooldownUntil: 0, isPermaBanned: false };
  }
  const list = readRejections(myUid);
  const e = list.find((x) => x.targetId === targetId);
  if (!e || e.count <= 0) {
    return { count: 0, cooldownUntil: 0, isPermaBanned: false };
  }
  const count = e.count;
  if (count >= 3) {
    return { count, cooldownUntil: null, isPermaBanned: true };
  }
  const days = count === 1 ? 7 : 30;
  const cooldownUntil = e.rejectedAt + days * 86400000;
  return { count, cooldownUntil, isPermaBanned: false };
}

/**
 * @param {string} myUid
 * @param {string} targetId
 */
export function canSendRequest(myUid, targetId) {
  const info = getRejectionInfo(myUid, targetId);
  if (info.isPermaBanned) {
    return { ok: false, reason: 'perma', message: '상대방에게 요청할 수 없어요' };
  }
  if (info.count > 0 && info.cooldownUntil != null && Date.now() < info.cooldownUntil) {
    const msLeft = info.cooldownUntil - Date.now();
    const days = Math.max(1, Math.ceil(msLeft / 86400000));
    return { ok: false, reason: 'cooldown', message: `${days}일 후에 다시 요청할 수 있어요` };
  }
  return { ok: true, reason: '', message: '' };
}

/**
 * 내가 보낸 요청이 상대에게 거절당함 → 거절 카운트·알림
 * @param {string} senderUid
 * @param {string} rejectorUid
 */
export function recordOutgoingRejected(senderUid, rejectorUid) {
  if (!senderUid || !rejectorUid) return;
  const list = readRejections(senderUid);
  const now = Date.now();
  const idx = list.findIndex((x) => x.targetId === rejectorUid);
  if (idx === -1) {
    list.push({ targetId: rejectorUid, rejectedAt: now, count: 1 });
  } else {
    list[idx].count += 1;
    list[idx].rejectedAt = now;
  }
  writeRejections(senderUid, list);
}

/** @returns {{ id: string, rejectorId: string, nickname: string, ts: number, read: boolean }[]} */
function readRejectNotifs(uid) {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(NOTIF_KEY(uid));
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

function writeRejectNotifs(uid, arr) {
  if (!uid) return;
  localStorage.setItem(NOTIF_KEY(uid), JSON.stringify(arr.slice(0, 50)));
}

/**
 * @param {string} nickname
 */
export function formatFriendRejectLine(nickname) {
  return `${nickname}이 친구 요청을 거절했어요`;
}

/**
 * @param {string} senderUid
 * @param {string} rejectorUid
 */
function pushRejectNotif(senderUid, rejectorUid) {
  const u = getMockUser(rejectorUid);
  const nick = u?.nickname ?? rejectorUid;
  const list = readRejectNotifs(senderUid);
  list.unshift({
    id: newId('rn'),
    rejectorId: rejectorUid,
    nickname: nick,
    ts: Date.now(),
    read: false,
  });
  writeRejectNotifs(senderUid, list);
}

/**
 * @param {string} senderUid
 * @param {string} rejectorUid
 */
function applyRejectAndNotify(senderUid, rejectorUid) {
  recordOutgoingRejected(senderUid, rejectorUid);
  pushRejectNotif(senderUid, rejectorUid);
}

export function getFriendRejectNotifications(uid) {
  return readRejectNotifs(uid).filter((n) => !n.read);
}

export function getNewFriendRejectNotifCount(uid) {
  return getFriendRejectNotifications(uid).length;
}

export function markFriendRejectNotifsSeen(uid) {
  const list = readRejectNotifs(uid).map((n) => ({ ...n, read: true }));
  writeRejectNotifs(uid, list);
}

/**
 * @param {string} requestId
 * @param {string} fromUid
 * @param {string} toUid
 */
export function scheduleMockAutoReject(requestId, fromUid, toUid) {
  if (!shouldAutoRejectFriendRequest(toUid)) return;
  const delay = 3000 + Math.floor(Math.random() * 2000);
  const prev = pendingAutoReject.get(requestId);
  if (prev) clearTimeout(prev);
  const tid = setTimeout(() => {
    pendingAutoReject.delete(requestId);
    const social = readSocial();
    const r = social.requests.find((x) => x.id === requestId && x.status === 'pending');
    if (!r) return;
    if (r.fromUid !== fromUid || r.toUid !== toUid) return;
    r.status = 'rejected';
    writeSocial(social);
    applyRejectAndNotify(r.fromUid, r.toUid);
    window.dispatchEvent(new Event('dallyeori-friends-updated'));
  }, delay);
  pendingAutoReject.set(requestId, tid);
}

/**
 * @param {string} myUid
 * @param {string} targetId
 */
export function sendRequest(myUid, targetId) {
  if (!myUid || !targetId || myUid === targetId) return { ok: false, error: 'invalid', message: '' };

  const gate = canSendRequest(myUid, targetId);
  if (!gate.ok) {
    return { ok: false, error: gate.reason, message: gate.message };
  }

  if (isFriend(myUid, targetId)) return { ok: false, error: 'already_friend', message: '' };
  const social = readSocial();
  const pend = social.requests.filter((r) => r.status === 'pending');
  if (pend.some((r) => r.fromUid === myUid && r.toUid === targetId)) {
    return { ok: false, error: 'pending_out', message: '' };
  }
  if (pend.some((r) => r.fromUid === targetId && r.toUid === myUid)) {
    return { ok: false, error: 'pending_in', message: '' };
  }
  const id = newId('fr');
  social.requests.push({
    id,
    fromUid: myUid,
    toUid: targetId,
    status: 'pending',
    createdAt: Date.now(),
  });
  writeSocial(social);
  scheduleMockAutoReject(id, myUid, targetId);
  return { ok: true, requestId: id, message: '' };
}

/**
 * @param {string} myUid
 * @param {string} requestId
 */
export function acceptRequest(myUid, requestId) {
  const social = readSocial();
  const r = social.requests.find((x) => x.id === requestId && x.toUid === myUid && x.status === 'pending');
  if (!r) return { ok: false, error: 'not_found' };
  r.status = 'accepted';
  writeSocial(social);
  addFriendship(r.fromUid, r.toUid);
  return { ok: true };
}

/**
 * @param {string} myUid
 * @param {string} requestId
 */
export function rejectRequest(myUid, requestId) {
  const social = readSocial();
  const r = social.requests.find((x) => x.id === requestId && x.toUid === myUid && x.status === 'pending');
  if (!r) return { ok: false, error: 'not_found' };
  r.status = 'rejected';
  writeSocial(social);
  applyRejectAndNotify(r.fromUid, r.toUid);
  return { ok: true };
}

/**
 * 보낸 요청 취소
 * @param {string} myUid
 * @param {string} requestId
 */
export function cancelSentRequest(myUid, requestId) {
  const social = readSocial();
  const r = social.requests.find((x) => x.id === requestId && x.fromUid === myUid && x.status === 'pending');
  if (!r) return { ok: false, error: 'not_found' };
  const tid = pendingAutoReject.get(requestId);
  if (tid) {
    clearTimeout(tid);
    pendingAutoReject.delete(requestId);
  }
  r.status = 'cancelled';
  writeSocial(social);
  return { ok: true };
}

/** @param {string} a @param {string} b */
function addFriendship(a, b) {
  const t = Date.now();
  const la = readFriendList(a);
  const lb = readFriendList(b);
  if (!la.some((x) => x.peerId === b)) la.push({ peerId: b, addedAt: t });
  if (!lb.some((x) => x.peerId === a)) lb.push({ peerId: a, addedAt: t });
  writeFriendList(a, la);
  writeFriendList(b, lb);
}

/**
 * @param {string} myUid
 * @param {string} friendId
 */
export function removeFriend(myUid, friendId) {
  const la = readFriendList(myUid).filter((x) => x.peerId !== friendId);
  writeFriendList(myUid, la);
  const lb = readFriendList(friendId).filter((x) => x.peerId !== myUid);
  writeFriendList(friendId, lb);
  return { ok: true };
}

/**
 * @param {string} myUid
 * @param {string} peerId
 */
export function isFriend(myUid, peerId) {
  if (!myUid || !peerId) return false;
  return readFriendList(myUid).some((x) => x.peerId === peerId);
}

/**
 * @param {string} myUid
 * @returns {{ id: string, nickname: string, duckId: string, online: boolean, addedAt: number, mutualLike?: boolean }[]}
 */
export function getFriendList(myUid) {
  const list = readFriendList(myUid);
  return list.map((x) => {
    const u = getMockUser(x.peerId);
    return {
      id: x.peerId,
      nickname: u?.nickname ?? x.peerId,
      duckId: u?.duckId ?? 'bori',
      online: Math.random() < 0.35,
      addedAt: x.addedAt,
    };
  });
}

/**
 * 받은 요청 (pending)
 * @param {string} myUid
 */
export function getPendingRequests(myUid) {
  const social = readSocial();
  return social.requests
    .filter((r) => r.toUid === myUid && r.status === 'pending')
    .map((r) => {
      const u = getMockUser(r.fromUid);
      return {
        requestId: r.id,
        fromId: r.fromUid,
        nickname: u?.nickname ?? r.fromUid,
        duckId: u?.duckId ?? 'bori',
        createdAt: r.createdAt,
      };
    });
}

/**
 * 보낸 요청 (pending)
 * @param {string} myUid
 */
export function getSentRequests(myUid) {
  const social = readSocial();
  return social.requests
    .filter((r) => r.fromUid === myUid && r.status === 'pending')
    .map((r) => {
      const u = getMockUser(r.toUid);
      return {
        requestId: r.id,
        toId: r.toUid,
        nickname: u?.nickname ?? r.toUid,
        createdAt: r.createdAt,
      };
    });
}

/**
 * 닉네임 검색 (더미 풀)
 * @param {string} query
 * @param {string} myUid
 */
export function searchUsers(query, myUid) {
  return searchMockUsersByNickname(query, myUid);
}
