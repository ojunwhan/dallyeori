/**
 * 친구 — 요청/수락, 거절 기록·알림, localStorage
 */

import { getMockUser, searchMockUsersByNickname, shouldAutoRejectFriendRequest } from './mockUsers.js';
import { fetchProfileByUid } from './profileApi.js';

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
 * @typedef {{ id: string, fromUid: string, toUid: string, status: 'pending'|'accepted'|'rejected'|'cancelled', createdAt: number, fromNickname?: string, fromPhotoURL?: string, fromDuckId?: string, toNickname?: string, toPhotoURL?: string, toDuckId?: string }} SocialRequest
 */

/** @param {string} uid */
function listKey(uid) {
  return `dallyeori.friends.list.${uid}`;
}

/** @returns {{ peerId: string, addedAt: number, nickname?: string, photoURL?: string, duckId?: string }[]} */
function readFriendList(uid) {
  try {
    const raw = localStorage.getItem(listKey(uid));
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => ({
      peerId: String(x.peerId ?? ''),
      addedAt: Number(x.addedAt) || 0,
      ...(typeof x.nickname === 'string' && x.nickname.trim() ? { nickname: x.nickname.trim() } : {}),
      ...(typeof x.photoURL === 'string' && x.photoURL.trim() ? { photoURL: x.photoURL.trim() } : {}),
      ...(typeof x.duckId === 'string' && x.duckId.trim() ? { duckId: x.duckId.trim() } : {}),
    })).filter((x) => x.peerId);
  } catch {
    return [];
  }
}

/** @param {string} uid @param {{ peerId: string, addedAt: number, nickname?: string, photoURL?: string, duckId?: string }[]} list */
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
 * @param {{ nickname?: string, photoURL?: string, duckId?: string } | null} [peerMeta] 상대 표시용 (검색·경주 결과 등)
 */
export function sendRequest(myUid, targetId, peerMeta = null) {
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
  /** @type {SocialRequest} */
  const row = {
    id,
    fromUid: myUid,
    toUid: targetId,
    status: 'pending',
    createdAt: Date.now(),
  };
  if (peerMeta && typeof peerMeta === 'object') {
    const nick = typeof peerMeta.nickname === 'string' ? peerMeta.nickname.trim() : '';
    const ph = typeof peerMeta.photoURL === 'string' ? peerMeta.photoURL.trim() : '';
    const dk = typeof peerMeta.duckId === 'string' ? peerMeta.duckId.trim() : '';
    if (nick) row.toNickname = nick;
    if (ph) row.toPhotoURL = ph;
    if (dk) row.toDuckId = dk;
  }
  social.requests.push(row);
  writeSocial(social);
  scheduleMockAutoReject(id, myUid, targetId);
  return { ok: true, requestId: id, message: '' };
}

/**
 * 소켓으로 받은 친구 요청을 로컬 social 저장소에 반영 (보낸 쪽 requestId와 동일해야 함)
 * @param {string} myUid
 * @param {{ senderUid: string, requestId: string, nickname?: string, photoURL?: string, duckId?: string }} detail
 */
export function applyIncomingFriendRequest(myUid, detail) {
  const senderUid = detail && typeof detail.senderUid === 'string' ? detail.senderUid : '';
  const requestId = detail && typeof detail.requestId === 'string' ? detail.requestId : '';
  const fromNickname =
    detail && typeof detail.nickname === 'string' && detail.nickname.trim()
      ? detail.nickname.trim()
      : '';
  const fromPhotoURL =
    detail && typeof detail.photoURL === 'string' && detail.photoURL.trim()
      ? detail.photoURL.trim()
      : '';
  const fromDuckId =
    detail && typeof detail.duckId === 'string' && detail.duckId.trim()
      ? detail.duckId.trim()
      : '';
  if (!myUid || !senderUid || !requestId || myUid === senderUid) return;
  if (isFriend(myUid, senderUid)) return;
  const social = readSocial();
  if (social.requests.some((r) => r.id === requestId)) return;
  const pend = social.requests.filter((r) => r.status === 'pending');
  if (pend.some((r) => r.fromUid === senderUid && r.toUid === myUid)) return;
  if (pend.some((r) => r.fromUid === myUid && r.toUid === senderUid)) return;
  /** @type {SocialRequest} */
  const row = {
    id: requestId,
    fromUid: senderUid,
    toUid: myUid,
    status: 'pending',
    createdAt: Date.now(),
  };
  if (fromNickname) row.fromNickname = fromNickname;
  if (fromPhotoURL) row.fromPhotoURL = fromPhotoURL;
  if (fromDuckId) row.fromDuckId = fromDuckId;
  social.requests.push(row);
  writeSocial(social);
  scheduleMockAutoReject(requestId, senderUid, myUid);
  window.dispatchEvent(new Event('dallyeori-friends-updated'));
}

/**
 * 내 친구 목록에만 추가 (localStorage는 기기별이므로 상대 키에 쓰지 않음)
 * @param {string} myUid
 * @param {string} peerId
 * @param {{ nickname?: string, photoURL?: string, duckId?: string }} [meta]
 */
function addFriendEntry(myUid, peerId, meta = {}) {
  if (!myUid || !peerId || myUid === peerId) return;
  const list = readFriendList(myUid);
  if (list.some((x) => x.peerId === peerId)) return;
  /** @type {{ peerId: string, addedAt: number, nickname?: string, photoURL?: string, duckId?: string }} */
  const entry = { peerId, addedAt: Date.now() };
  if (meta.nickname && String(meta.nickname).trim()) entry.nickname = String(meta.nickname).trim();
  if (meta.photoURL && String(meta.photoURL).trim()) entry.photoURL = String(meta.photoURL).trim();
  if (meta.duckId && String(meta.duckId).trim()) entry.duckId = String(meta.duckId).trim();
  list.push(entry);
  writeFriendList(myUid, list);
}

function syncOutgoingRequestAccepted(myUid, peerUid) {
  const social = readSocial();
  let changed = false;
  for (const req of social.requests) {
    if (req.fromUid === myUid && req.toUid === peerUid && req.status === 'pending') {
      req.status = 'accepted';
      changed = true;
    }
  }
  if (changed) writeSocial(social);
}

/**
 * 소켓 friendAccepted — 상대방 기기에서 내 목록 갱신
 * @param {string} myUid
 * @param {{ peerUid: string, requestId?: string, nickname?: string, photoURL?: string, duckId?: string }} detail
 */
export function applyFriendAccepted(myUid, detail) {
  const peerUid = detail && typeof detail.peerUid === 'string' ? detail.peerUid.trim() : '';
  if (!myUid || !peerUid || myUid === peerUid) return;
  const nickname = typeof detail.nickname === 'string' ? detail.nickname.trim() : '';
  const photoURL = typeof detail.photoURL === 'string' ? detail.photoURL.trim() : '';
  const duckId = typeof detail.duckId === 'string' ? detail.duckId.trim() : '';
  const meta = {
    ...(nickname ? { nickname } : {}),
    ...(photoURL ? { photoURL } : {}),
    ...(duckId ? { duckId } : {}),
  };

  if (isFriend(myUid, peerUid)) {
    const list = readFriendList(myUid);
    const i = list.findIndex((x) => x.peerId === peerUid);
    if (i >= 0) {
      const cur = list[i];
      const next = { ...cur };
      if (nickname && !cur.nickname) next.nickname = nickname;
      if (photoURL && !cur.photoURL) next.photoURL = photoURL;
      if (duckId && !cur.duckId) next.duckId = duckId;
      if (next.nickname !== cur.nickname || next.photoURL !== cur.photoURL || next.duckId !== cur.duckId) {
        list[i] = next;
        writeFriendList(myUid, list);
      }
    }
    syncOutgoingRequestAccepted(myUid, peerUid);
    window.dispatchEvent(new Event('dallyeori-friends-updated'));
    return;
  }

  addFriendEntry(myUid, peerUid, meta);
  syncOutgoingRequestAccepted(myUid, peerUid);
  window.dispatchEvent(new Event('dallyeori-friends-updated'));
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
  addFriendEntry(myUid, r.fromUid, {
    nickname: r.fromNickname,
    photoURL: r.fromPhotoURL,
    duckId: r.fromDuckId || 'bori',
  });
  return { ok: true, peerUid: r.fromUid, requestId: r.id };
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

/**
 * @param {string} myUid
 * @param {string} friendId
 */
export function removeFriend(myUid, friendId) {
  const la = readFriendList(myUid).filter((x) => x.peerId !== friendId);
  writeFriendList(myUid, la);
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
 * @returns {{ id: string, nickname: string, duckId: string, online: boolean, addedAt: number, mutualHeart?: boolean }[]}
 */
export function getFriendList(myUid) {
  const list = readFriendList(myUid);
  return list.map((x) => {
    const u = getMockUser(x.peerId);
    const storedNick = x.nickname && String(x.nickname).trim() ? String(x.nickname).trim() : '';
    return {
      id: x.peerId,
      nickname: storedNick || u?.nickname || x.peerId,
      duckId: (x.duckId && String(x.duckId).trim()) || u?.duckId || 'bori',
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
        nickname: r.fromNickname ?? u?.nickname ?? r.fromUid,
        duckId: r.fromDuckId ?? u?.duckId ?? 'bori',
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
      const stored =
        r.toNickname && String(r.toNickname).trim() ? String(r.toNickname).trim() : '';
      return {
        requestId: r.id,
        toId: r.toUid,
        nickname: stored || u?.nickname || r.toUid,
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

/**
 * 저장된 표시 이름이 없거나 uid와 같으면 서버 프로필로 보강
 * @param {string} myUid
 */
export async function enrichStaleFriendMeta(myUid) {
  if (!myUid) return;
  const list = readFriendList(myUid);
  if (list.length === 0) return;
  const next = [];
  let changed = false;
  for (const x of list) {
    let e = { ...x };
    const nick = e.nickname && String(e.nickname).trim() ? String(e.nickname).trim() : '';
    const needMeta = !nick || nick === e.peerId;
    if (needMeta) {
      const p = await fetchProfileByUid(e.peerId);
      if (p && typeof p.nickname === 'string' && p.nickname.trim()) {
        e = {
          ...e,
          nickname: p.nickname.trim(),
          photoURL: (p.photoURL && String(p.photoURL)) || e.photoURL,
          duckId: (p.selectedDuckId && String(p.selectedDuckId).trim()) || e.duckId || 'bori',
        };
        changed = true;
      }
    }
    next.push(e);
  }
  if (changed) {
    writeFriendList(myUid, next);
    window.dispatchEvent(new Event('dallyeori-friends-updated'));
  }
}
