/**
 * Socket.IO 실시간 매칭·경주 + 기존 startMockRandomMatch 호환 (matching.js)
 */

import { io } from 'socket.io-client';
import { decodeJWT, getToken } from './auth.js';
import { getUserRecord } from './db.js';
import { DUCKS_NINE } from '../constants.js';
import { getRandomMockUser } from './mockUsers.js';
import { applyIncomingFriendRequest, applyFriendAccepted } from './friends.js';
import {
  showAppToast,
  showFriendRequestToast,
  showHeartReceiveToast,
} from './toast.js';
import { recordHeartGiftSuccess, revertTodayHeartSend } from './likes.js';

/** @type {import('socket.io-client').Socket | null} */
let gameSocket = null;
/** JWT 문자열 — 연결 진행 중 같은 토큰이면 소켓을 끊지 않고 재사용 (핸드셰이크 반복 방지) */
let lastSocketToken = null;
let reconnectToastShown = false;
/** QR 게스트 (?qr=&t=) 플로우 중이면 true */
let guestQrFlowActive = false;

/**
 * Socket.IO 연결 URL. 빈 문자열/미설정 + 프로덕션 → 동일 출처.
 * 개발 기본값: localhost:3100
 * @returns {string} '' 이면 io() 단일 인자(동일 출처)
 */
function socketUrl() {
  const raw = import.meta.env.VITE_SOCKET_URL;
  if (raw === '' || raw === undefined || raw === null) {
    if (import.meta.env.DEV) return 'http://localhost:3100';
    return '';
  }
  return String(raw).replace(/\/$/, '');
}

/**
 * @param {object} opts
 * @returns {import('socket.io-client').Socket}
 */
function openGameSocket(opts) {
  const url = socketUrl();
  return url ? io(url, opts) : io(opts);
}

/** @param {string | undefined | null} token */
function resolveSocketLanguageForToken(token) {
  if (!token) return 'ko';
  const p = decodeJWT(token);
  const uid = p && typeof p.uid === 'string' ? p.uid : null;
  if (!uid) return 'ko';
  const rec = getUserRecord(uid);
  const lang = rec?.language;
  return typeof lang === 'string' && lang.trim() ? lang.trim() : 'ko';
}

/** @param {unknown} msg */
function receiveChatRelayHandler(msg) {
  console.log('[socket] receiveChat → dallyeori-receiveChat', {
    fromId: msg && msg.fromId,
    toId: msg && msg.toId,
    hasText: !!(msg && msg.text),
    appScreen: globalThis.__dallyeoriAppScreen,
  });
  window.dispatchEvent(new CustomEvent('dallyeori-receiveChat', { detail: msg }));
  if (
    globalThis.__dallyeoriAppScreen === 'result' &&
    typeof globalThis.__onChatReceived === 'function'
  ) {
    try {
      globalThis.__onChatReceived(msg);
    } catch (e) {
      console.warn('[socket] __onChatReceived error', e);
    }
  }
}

/**
 * 채팅 수신 → window 커스텀 이벤트 (chat.js가 구독, 소켓 인스턴스와 분리)
 * 동일 소켓에 중복 등록되지 않도록 off 후 on
 * @param {import('socket.io-client').Socket} sock
 */
function attachReceiveChatRelay(sock) {
  sock.off('receiveChat', receiveChatRelayHandler);
  sock.on('receiveChat', receiveChatRelayHandler);
  console.log('[socket] receiveChat relay attached');
}

/** @param {unknown} data */
function receiveHeartRelayHandler(data) {
  const o = data && typeof data === 'object' ? /** @type {Record<string, unknown>} */ (data) : {};
  const senderName =
    typeof o.senderName === 'string' && o.senderName.trim()
      ? o.senderName.trim()
      : typeof o.senderUid === 'string'
        ? o.senderUid
        : '';
  const free = o.free === true ? true : o.free === false ? false : undefined;
  showHeartReceiveToast(senderName, free);
}

/**
 * @param {import('socket.io-client').Socket} sock
 */
function attachReceiveHeartRelay(sock) {
  sock.off('receiveHeart', receiveHeartRelayHandler);
  sock.on('receiveHeart', receiveHeartRelayHandler);
}

/** @param {unknown} d */
function heartBalanceSocketHandler(d) {
  const o = d && typeof d === 'object' ? /** @type {Record<string, unknown>} */ (d) : {};
  const b = o.balance;
  if (typeof b !== 'number' || !Number.isFinite(b)) return;
  window.dispatchEvent(new CustomEvent('dallyeori-heart-balance', { detail: { balance: b } }));
}

/** @param {unknown} d */
function heartErrorSocketHandler(d) {
  const o = d && typeof d === 'object' ? /** @type {Record<string, unknown>} */ (d) : {};
  if (o.reason === 'noHearts' && typeof o.targetUid === 'string') {
    const uid = getJwtUid();
    if (uid) revertTodayHeartSend(uid, o.targetUid);
  }
  showAppToast('하트가 부족합니다');
  window.dispatchEvent(new CustomEvent('dallyeori-heart-error', { detail: d }));
}

/** @param {unknown} d */
function heartGiftSentHandler(d) {
  const o = d && typeof d === 'object' ? /** @type {Record<string, unknown>} */ (d) : {};
  const free = o.free === true;
  const targetUid = typeof o.targetUid === 'string' ? o.targetUid : '';
  const uid = getJwtUid();
  if (uid && targetUid) recordHeartGiftSuccess(uid, targetUid);
  showAppToast(
    free ? '♥ 하트를 보냈어요 (무료)' : '♥ 하트를 보냈어요 (잔액에서 차감)',
  );
  window.dispatchEvent(
    new CustomEvent('dallyeori-heart-gift-sent', { detail: { free, targetUid } }),
  );
}

/** @param {unknown} d */
function matchErrorSocketHandler(d) {
  window.dispatchEvent(new CustomEvent('dallyeori-match-error', { detail: d }));
}

/**
 * @param {import('socket.io-client').Socket} sock
 */
function attachHeartEconomyRelay(sock) {
  sock.off('heartBalance', heartBalanceSocketHandler);
  sock.on('heartBalance', heartBalanceSocketHandler);
  sock.off('heartError', heartErrorSocketHandler);
  sock.on('heartError', heartErrorSocketHandler);
  sock.off('heartGiftSent', heartGiftSentHandler);
  sock.on('heartGiftSent', heartGiftSentHandler);
  sock.off('matchError', matchErrorSocketHandler);
  sock.on('matchError', matchErrorSocketHandler);
}

function getJwtUid() {
  const t = getToken();
  if (!t) return '';
  const p = decodeJWT(t);
  return p && typeof p.uid === 'string' ? p.uid : '';
}

/** 로컬 DB + __dallyeoriMatchProfile — 서버 sync / sendRematch(profile) 공통 */
function buildLocalMatchProfilePayload() {
  const uid = getJwtUid();
  const rec = uid ? getUserRecord(uid) : null;
  const mp = globalThis.__dallyeoriMatchProfile || {};
  return {
    nickname:
      (rec?.nickname && String(rec.nickname).trim()) || mp.nickname || '',
    photoURL: rec?.profilePhotoURL ?? mp.photoURL ?? '',
    duckId: (rec?.selectedDuckId && String(rec.selectedDuckId)) || mp.duckId || 'bori',
    wins: Number(rec?.wins ?? mp.wins ?? 0) || 0,
    losses: Number(rec?.losses ?? mp.losses ?? 0) || 0,
    draws: Number(rec?.draws ?? mp.draws ?? 0) || 0,
  };
}

/**
 * 로컬 DB + __dallyeoriMatchProfile 기준으로 서버에 matchProfile 반영.
 * 소켓 재연결 직후·재매치 직전에 호출해 탭/오리 유실을 막음 (끊었다 다시 연결하지 않음).
 */
export function emitSyncMatchProfileToServer() {
  const s = gameSocket;
  if (!s?.connected || guestQrFlowActive) return;
  s.emit('syncMatchProfile', { profile: buildLocalMatchProfilePayload() });
}

/** @param {unknown} data */
function receiveFriendRequestRelayHandler(data) {
  const o = data && typeof data === 'object' ? /** @type {Record<string, unknown>} */ (data) : {};
  const senderUid = typeof o.senderUid === 'string' ? o.senderUid : '';
  const requestId = typeof o.requestId === 'string' ? o.requestId : '';
  const nickRaw = typeof o.nickname === 'string' && o.nickname.trim() ? o.nickname.trim() : '';
  const senderName =
    typeof o.senderName === 'string' && o.senderName.trim()
      ? o.senderName.trim()
      : nickRaw || senderUid;
  const photoURL = typeof o.photoURL === 'string' ? o.photoURL : '';
  const duckId = typeof o.duckId === 'string' && o.duckId.trim() ? o.duckId.trim() : '';
  const myUid = getJwtUid();
  if (!myUid || !senderUid || !requestId) return;
  showFriendRequestToast(senderName);
  applyIncomingFriendRequest(myUid, {
    senderUid,
    requestId,
    nickname: nickRaw || senderName,
    photoURL,
    duckId: duckId || undefined,
  });
}

/** @param {unknown} data */
function friendAcceptedRelayHandler(data) {
  const o = data && typeof data === 'object' ? /** @type {Record<string, unknown>} */ (data) : {};
  const peerUid = typeof o.peerUid === 'string' ? o.peerUid.trim() : '';
  const requestId = typeof o.requestId === 'string' ? o.requestId : '';
  const nickname = typeof o.nickname === 'string' ? o.nickname : '';
  const photoURL = typeof o.photoURL === 'string' ? o.photoURL : '';
  const duckId = typeof o.duckId === 'string' ? o.duckId : '';
  const myUid = getJwtUid();
  if (!myUid || !peerUid) return;
  applyFriendAccepted(myUid, { peerUid, requestId, nickname, photoURL, duckId });
}

function removeRematchInviteOverlay() {
  document.getElementById('dallyeori-rematch-invite')?.remove();
}

/** @param {unknown} data */
function receiveRematchRelayHandler(data) {
  console.log('RECEIVE_REMATCH', data);
  const o = data && typeof data === 'object' ? /** @type {Record<string, unknown>} */ (data) : {};
  const senderUid = typeof o.senderUid === 'string' ? o.senderUid : '';
  const senderName =
    typeof o.senderName === 'string' && o.senderName.trim()
      ? o.senderName.trim()
      : senderUid;
  if (!senderUid) return;

  if (globalThis.__dallyeoriAppScreen === 'result') {
    removeRematchInviteOverlay();
    showAppToast(
      `🏁 ${senderName}님이 한판 더를 요청했어요. 경기 엔딩 화면에 있을 때만 수락할 수 있어요.`,
    );
  } else {
    showAppToast(`🏁 ${senderName}님이 한판 더 하자고 해요.`);
  }
}

/**
 * @param {import('socket.io-client').Socket} sock
 */
function attachReceiveFriendRematchRelay(sock) {
  sock.off('receiveFriendRequest', receiveFriendRequestRelayHandler);
  sock.on('receiveFriendRequest', receiveFriendRequestRelayHandler);
  sock.off('friendAccepted', friendAcceptedRelayHandler);
  sock.on('friendAccepted', friendAcceptedRelayHandler);
  sock.off('receiveRematch', receiveRematchRelayHandler);
  sock.on('receiveRematch', receiveRematchRelayHandler);
}

/** @type {((data: object) => false | void) | null} */
let _onServerMatchFoundNavigate = null;

/**
 * 매칭 화면 외(결과·재대전 대기 등)에서 서버 matchFound 시 경주로 진입
 * @param {(data: object) => (false | void)} cb false이면 __dallyeoriPendingRace 저장 취소
 */
export function setServerMatchFoundNavigate(cb) {
  _onServerMatchFoundNavigate = cb;
}

/** 서버/직렬화가 문자열 `"0"`/`"1"` 로 올 때마다 슬롯 검사가 실패해 양쪽 클라이언트가 모두 슬롯 0처럼 동작하는 버그 방지 */
/** @param {unknown} slot */
export function normalizeRaceSlot(slot) {
  const n = slot == null ? NaN : Number(slot);
  return n === 0 || n === 1 ? /** @type {0 | 1} */ (n) : null;
}

/** @param {unknown} data */
function globalMatchFoundBridge(data) {
  console.log('[DEBUG-REMATCH] globalMatchFoundBridge fired, data:', JSON.stringify(data || {}));
  if (!data || typeof data !== 'object') return;
  const d = /** @type {Record<string, unknown>} */ (data);
  const slotNorm = normalizeRaceSlot(d.slot);
  if (typeof d.roomId !== 'string' || slotNorm == null) return;
  const s = ensureSocket();
  if (!s) return;
  const opp = d.opponent && typeof d.opponent === 'object' ? d.opponent : {};
  const mp = globalThis.__dallyeoriMatchProfile || {};
  globalThis.__dallyeoriPendingRace = {
    socket: s,
    roomId: d.roomId,
    slot: slotNorm,
    terrain: d.terrain,
    myDuckId: d.myDuckId || mp.duckId || 'bori',
    oppDuckId: typeof opp.duckId === 'string' ? opp.duckId : 'bori',
    oppDuckName: typeof opp.duckName === 'string' ? opp.duckName : '',
  };
  if (typeof _onServerMatchFoundNavigate === 'function') {
    try {
      const r = _onServerMatchFoundNavigate(/** @type {object} */ (data));
      if (r === false) {
        delete globalThis.__dallyeoriPendingRace;
      }
    } catch (e) {
      console.warn('[socket] matchFound navigate', e);
    }
  }
}

/**
 * @param {import('socket.io-client').Socket} sock
 */
function attachGlobalMatchFoundBridge(sock) {
  sock.off('matchFound', globalMatchFoundBridge);
  sock.on('matchFound', globalMatchFoundBridge);
}

/**
 * @returns {import('socket.io-client').Socket | null}
 */
export function getGameSocket() {
  return gameSocket;
}

export function isGuestQrFlowActive() {
  return guestQrFlowActive;
}

/**
 * QR 스캔 게스트 전용 연결 (로그인 JWT 대신 게스트 JWT)
 * @param {string} token
 */
export function connectQrGuestSocket(token) {
  guestQrFlowActive = true;
  if (gameSocket) {
    gameSocket.disconnect();
    gameSocket = null;
  }
  lastSocketToken = token;
  gameSocket = openGameSocket({
    auth: { token, language: resolveSocketLanguageForToken(token) },
    reconnection: true,
    reconnectionAttempts: 2,
    reconnectionDelay: 800,
    transports: ['websocket', 'polling'],
  });

  const onFound = (data) => {
    if (!guestQrFlowActive) return;
    const opp = data.opponent || {};
    const mp = globalThis.__dallyeoriMatchProfile || {
      nickname: '게스트',
      photoURL: '',
      duckId: 'bori',
      wins: 0,
      losses: 0,
      draws: 0,
    };
    const myDuck = data.myDuckId || mp.duckId || 'bori';
    const guestSlot = normalizeRaceSlot(data.slot);
    if (typeof data.roomId !== 'string' || guestSlot == null) {
      console.warn('[socket] qr guest matchFound invalid roomId/slot', data);
      return;
    }
    globalThis.__dallyeoriTerrain = data.terrain || 'normal';
    globalThis.__dallyeoriMatchProfile = { ...mp, duckId: myDuck };
    globalThis.__dallyeoriPendingRace = {
      socket: gameSocket,
      roomId: data.roomId,
      slot: guestSlot,
      terrain: data.terrain,
      myDuckId: myDuck,
      oppDuckId: opp.duckId || 'bori',
      oppDuckName: opp.duckName || '',
    };
    window.dispatchEvent(new CustomEvent('dallyeori:guestMatchFound'));
  };

  gameSocket.on('matchFound', onFound);
  gameSocket.on('qrJoinFailed', (p) => {
    const reason =
      p && typeof p === 'object' && 'reason' in p ? String(p.reason) : '';
    if (reason === 'host_no_hearts') {
      showAppToast('호스트의 하트가 부족해 입장할 수 없어요.');
    } else {
      showAppToast('입장에 실패했어요. QR을 다시 스캔해 주세요.');
    }
    guestQrFlowActive = false;
  });
  gameSocket.on('connect_error', () => {
    if (!reconnectToastShown) {
      reconnectToastShown = true;
      showAppToast('게임 서버에 연결할 수 없어요.');
    }
  });
  gameSocket.on('connect', () => {
    reconnectToastShown = false;
  });
  attachReceiveChatRelay(gameSocket);
  attachReceiveHeartRelay(gameSocket);
  attachHeartEconomyRelay(gameSocket);
  attachReceiveFriendRematchRelay(gameSocket);
  attachGlobalMatchFoundBridge(gameSocket);
  return gameSocket;
}

export function endGuestQrFlow() {
  guestQrFlowActive = false;
  if (gameSocket) {
    gameSocket.disconnect();
    gameSocket = null;
    lastSocketToken = null;
  }
}

export function ensureSocket() {
  console.log('[socket] ensureSocket called, token:', !!getToken(), 'existing:', !!gameSocket, 'connected:', gameSocket?.connected);
  const token = getToken();
  if (!token) {
    showAppToast('로그인이 필요해요.');
    return null;
  }
  if (gameSocket?.connected && lastSocketToken === token) {
    console.log('[socket] reusing existing socket, connected:', gameSocket?.connected);
    attachReceiveChatRelay(gameSocket);
    attachReceiveHeartRelay(gameSocket);
    attachHeartEconomyRelay(gameSocket);
    attachReceiveFriendRematchRelay(gameSocket);
    attachGlobalMatchFoundBridge(gameSocket);
    return gameSocket;
  }
  // 연결 중이어도 같은 토큰이면 기존 인스턴스 유지 (매칭 직전에 끊었다가 다시 만들면 서버 매칭 불가)
  if (gameSocket && lastSocketToken === token) {
    console.log('[socket] reusing existing socket, connected:', gameSocket?.connected);
    attachReceiveChatRelay(gameSocket);
    attachReceiveHeartRelay(gameSocket);
    attachHeartEconomyRelay(gameSocket);
    attachReceiveFriendRematchRelay(gameSocket);
    attachGlobalMatchFoundBridge(gameSocket);
    return gameSocket;
  }
  if (gameSocket) {
    gameSocket.disconnect();
    gameSocket = null;
    lastSocketToken = null;
  }
  lastSocketToken = token;
  gameSocket = openGameSocket({
    auth: { token, language: resolveSocketLanguageForToken(token) },
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 800,
    transports: ['websocket', 'polling'],
  });
  console.log('[socket] new socket created');
  gameSocket.on('connect_error', () => {
    if (!reconnectToastShown) {
      reconnectToastShown = true;
      showAppToast('게임 서버에 연결할 수 없어요.');
    }
  });
  gameSocket.on('connect', () => {
    reconnectToastShown = false;
    if (import.meta.env.DEV) {
      const u = socketUrl();
      console.log('[dallyeori/socket] connected →', u || window.location.origin);
    }
    emitSyncMatchProfileToServer();
  });
  attachReceiveChatRelay(gameSocket);
  attachReceiveHeartRelay(gameSocket);
  attachHeartEconomyRelay(gameSocket);
  attachReceiveFriendRematchRelay(gameSocket);
  attachGlobalMatchFoundBridge(gameSocket);
  return gameSocket;
}

/**
 * @param {string} targetUid
 * @param {string} requestId
 */
export function emitFriendRequestSent(targetUid, requestId) {
  if (!targetUid || !requestId) return;
  const s = ensureSocket();
  if (!s) return;
  const payload = { targetUid, requestId };
  const send = () => {
    if (s.connected) s.emit('sendFriendRequest', payload);
  };
  if (s.connected) {
    send();
  } else {
    s.once('connect', send);
  }
}

/**
 * 친구 요청 수락 — 서버가 양쪽에 friendAccepted 전달
 * @param {string} peerUid 요청 보낸 사람 uid (수락자가 아님)
 * @param {string} requestId
 */
export function emitAcceptFriendRequest(peerUid, requestId) {
  if (!peerUid || !requestId) return;
  const s = ensureSocket();
  if (!s) return;
  const payload = { peerUid, requestId };
  const send = () => {
    if (s.connected) s.emit('acceptFriendRequest', payload);
  };
  if (s.connected) {
    send();
  } else {
    s.once('connect', send);
  }
}

/** @param {string} targetUid */
export function emitSendRematch(targetUid) {
  const s = ensureSocket();
  console.log('[DEBUG-REMATCH-RESULT] emitSendRematch called, targetUid:', targetUid, 'socket connected:', !!s?.connected);
  if (!s?.connected || !targetUid) {
    console.log('[DEBUG-REMATCH-RESULT] emitSendRematch SKIPPED - no socket or no targetUid');
    return;
  }
  emitSyncMatchProfileToServer();
  s.emit('sendRematch', { targetUid, profile: buildLocalMatchProfilePayload() });
}

/**
 * @param {string} peerUid 한판 더를 보낸 사람
 * @param {string} [terrain]
 */
export function emitAcceptRematch(peerUid, terrain) {
  const s = ensureSocket();
  if (!s?.connected || !peerUid) return;
  emitSyncMatchProfileToServer();
  s.emit('acceptRematch', {
    peerUid,
    terrain: terrain || 'normal',
    profile: buildLocalMatchProfilePayload(),
  });
}

/**
 * @param {string} roomId
 * @param {0|1} slot
 * @param {import('socket.io-client').Socket | null} [socketOverride] 매칭 직후 소켓 — 전역 gameSocket 과 불일치 시 raceJoin 누락 방지
 */
export function emitRaceJoin(roomId, slot, socketOverride) {
  const s = socketOverride ?? gameSocket;
  if (!s) return;
  const emit = () => {
    s.emit('raceJoin', { roomId, slot });
  };
  if (s.connected) emit();
  else s.once('connect', emit);
}

/** --- 사용자 스펙 API (추후 화면에서 직접 사용) --- */

/**
 * @param {string} terrain
 */
export function findMatch(terrain) {
  const s = ensureSocket();
  if (!s) return;
  const profile = globalThis.__dallyeoriMatchProfile || {};
  s.emit('findMatch', { terrain: terrain || 'normal', profile });
}

/** @type {((data: object) => void) | null} */
let _onMatchFound = null;

/**
 * @param {(data: object) => void} cb
 */
export function onMatchFound(cb) {
  _onMatchFound = cb;
  const s = gameSocket;
  if (s) {
    s.off('matchFound', _matchFoundHandler);
    s.on('matchFound', _matchFoundHandler);
  }
}

function _matchFoundHandler(data) {
  if (_onMatchFound) _onMatchFound(data);
}

/**
 * @param {'left'|'right'} foot
 * @param {string} roomId
 * @param {0|1} slot
 * @param {import('socket.io-client').Socket | null} [socketOverride] 경주 중 탭은 경주에 쓰인 소켓으로만 보냄
 */
export function sendTap(foot, roomId, slot, socketOverride) {
  const s = socketOverride ?? gameSocket;
  console.log('[socket] emit tap', foot, 'connected:', s?.connected, 'roomId:', roomId, 'slot:', slot);
  s?.emit('tap', { foot, roomId, slot });
}

/** @type {((data: object) => void) | null} */
let _onOpponentTap = null;

/**
 * @param {(data: object) => void} cb
 */
export function onOpponentTap(cb) {
  _onOpponentTap = cb;
  const s = gameSocket;
  if (s) {
    s.off('opponentTap', _oppTapHandler);
    s.on('opponentTap', _oppTapHandler);
  }
}

function _oppTapHandler(data) {
  if (_onOpponentTap) _onOpponentTap(data);
}

/** @type {((data: object) => void) | null} */
let _onRaceResult = null;

/**
 * @param {(data: object) => void} cb
 */
export function onRaceResult(cb) {
  _onRaceResult = cb;
  const s = gameSocket;
  if (s) {
    s.off('raceResult', _raceResultHandler);
    s.on('raceResult', _raceResultHandler);
  }
}

function _raceResultHandler(data) {
  if (_onRaceResult) _onRaceResult(data);
}

export function cancelMatch() {
  gameSocket?.emit('cancelMatch');
}

export function disconnect() {
  guestQrFlowActive = false;
  gameSocket?.disconnect();
  gameSocket = null;
  lastSocketToken = null;
}

// ═══ matching.js 호환: 모킹 폴백 (서버 URL 없을 때) ═══

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollMockOpponent(excludeUid) {
  const u = getRandomMockUser(excludeUid);
  const d = DUCKS_NINE.find((x) => x.id === u.duckId) ?? DUCKS_NINE[0];
  return {
    userId: u.id,
    nickname: u.nickname,
    profilePhotoURL: u.profilePhotoURL ?? '',
    duckId: u.duckId,
    duckName: d.name,
    duckColor: d.color,
    wins: randomInt(0, 80),
    losses: randomInt(0, 80),
    draws: randomInt(0, 25),
  };
}

function startLocalMockMatch(excludeUid) {
  let timeoutId = null;
  let cancelled = false;
  const waitMs = randomInt(2000, 4000);
  const promise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (cancelled) return;
      resolve(rollMockOpponent(excludeUid));
    }, waitMs);
  });
  function cancel() {
    cancelled = true;
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }
  return { promise, cancel, waitMs };
}

/**
 * @param {string} [excludeUid]
 * @returns {{ promise: Promise<object>, cancel: () => void, waitMs: number }}
 */
export function startMockRandomMatch(excludeUid) {
  const mockOnly =
    import.meta.env.VITE_SOCKET_USE_MOCK === 'true' || import.meta.env.VITE_SOCKET_USE_MOCK === '1';
  if (mockOnly) {
    return startLocalMockMatch(excludeUid);
  }
  const s = ensureSocket();
  if (!s) {
    const promise = Promise.reject(new Error('NOT_LOGGED_IN'));
    return {
      promise,
      cancel: () => {},
      waitMs: 0,
    };
  }

  let settled = false;
  let cancelFn = () => {};
  let connectTimeoutId = null;

  const terrain = globalThis.__dallyeoriTerrain || 'normal';
  const profile = globalThis.__dallyeoriMatchProfile || {};

  const promise = new Promise((resolve, reject) => {
    const onFound = (data) => {
      if (settled) return;
      const foundSlot = normalizeRaceSlot(data && data.slot);
      if (!data || typeof data !== 'object' || typeof data.roomId !== 'string' || foundSlot == null) {
        console.warn('[socket] matchFound ignored (invalid roomId/slot)', data);
        return;
      }
      settled = true;
      if (connectTimeoutId != null) {
        clearTimeout(connectTimeoutId);
        connectTimeoutId = null;
      }
      s.off('matchFound', onFound);
      const opp = data.opponent || {};
      const mp = globalThis.__dallyeoriMatchProfile || {};
      globalThis.__dallyeoriPendingRace = {
        socket: s,
        roomId: data.roomId,
        slot: foundSlot,
        terrain: data.terrain,
        myDuckId: data.myDuckId || mp.duckId || 'bori',
        oppDuckId: opp.duckId || 'bori',
        oppDuckName: opp.duckName || '',
      };
      resolve({
        userId: opp.userId,
        nickname: opp.nickname,
        profilePhotoURL: opp.profilePhotoURL ?? '',
        duckId: opp.duckId,
        duckName: opp.duckName,
        duckColor: opp.duckColor,
        wins: opp.wins ?? 0,
        losses: opp.losses ?? 0,
        draws: opp.draws ?? 0,
      });
    };

    const subscribeAndFind = () => {
      if (settled) return;
      if (import.meta.env.DEV) {
        console.log('[dallyeori/socket] findMatch emit', { terrain });
      }
      s.on('matchFound', onFound);
      s.emit('findMatch', { terrain, profile });
    };

    cancelFn = () => {
      if (settled) return;
      settled = true;
      if (connectTimeoutId != null) {
        clearTimeout(connectTimeoutId);
        connectTimeoutId = null;
      }
      s.off('matchFound', onFound);
      s.off('connect', onConnectReady);
      s.emit('cancelMatch');
    };

    const onConnectReady = () => {
      s.off('connect', onConnectReady);
      if (connectTimeoutId != null) {
        clearTimeout(connectTimeoutId);
        connectTimeoutId = null;
      }
      if (settled) return;
      subscribeAndFind();
    };

    if (s.connected) {
      onConnectReady();
    } else {
      if (import.meta.env.DEV) {
        console.log('[dallyeori/socket] waiting for connect before findMatch →', socketUrl());
      }
      s.on('connect', onConnectReady);
      connectTimeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        connectTimeoutId = null;
        s.off('matchFound', onFound);
        s.off('connect', onConnectReady);
        try {
          s.emit('cancelMatch');
        } catch {
          /* ignore */
        }
        showAppToast('게임 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
        reject(new Error('SOCKET_CONNECT_TIMEOUT'));
      }, 20000);
    }
  });

  return {
    promise,
    cancel: cancelFn,
    waitMs: 0,
  };
}
