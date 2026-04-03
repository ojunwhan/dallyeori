/**
 * Socket.IO 실시간 매칭·경주 + 기존 startMockRandomMatch 호환 (matching.js)
 */

import { io } from 'socket.io-client';
import { getToken } from './auth.js';
import { DUCKS_NINE } from '../constants.js';
import { getRandomMockUser } from './mockUsers.js';
import { showAppToast } from './toast.js';

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

/**
 * 채팅 수신 → window 커스텀 이벤트 (chat.js가 구독, 소켓 인스턴스와 분리)
 * @param {import('socket.io-client').Socket} sock
 */
function attachReceiveChatRelay(sock) {
  sock.on('receiveChat', (msg) => {
    window.dispatchEvent(new CustomEvent('dallyeori-receiveChat', { detail: msg }));
  });
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
    auth: { token },
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
    globalThis.__dallyeoriTerrain = data.terrain || 'normal';
    globalThis.__dallyeoriMatchProfile = { ...mp, duckId: myDuck };
    globalThis.__dallyeoriPendingRace = {
      socket: gameSocket,
      roomId: data.roomId,
      slot: data.slot,
      terrain: data.terrain,
      myDuckId: myDuck,
      oppDuckId: opp.duckId || 'bori',
      oppDuckName: opp.duckName || '',
    };
    window.dispatchEvent(new CustomEvent('dallyeori:guestMatchFound'));
  };

  gameSocket.on('matchFound', onFound);
  gameSocket.on('qrJoinFailed', () => {
    showAppToast('입장에 실패했어요. QR을 다시 스캔해 주세요.');
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
  const token = getToken();
  if (!token) {
    showAppToast('로그인이 필요해요.');
    return null;
  }
  if (gameSocket?.connected && lastSocketToken === token) {
    return gameSocket;
  }
  // 연결 중이어도 같은 토큰이면 기존 인스턴스 유지 (매칭 직전에 끊었다가 다시 만들면 서버 매칭 불가)
  if (gameSocket && lastSocketToken === token) {
    return gameSocket;
  }
  if (gameSocket) {
    gameSocket.disconnect();
    gameSocket = null;
    lastSocketToken = null;
  }
  lastSocketToken = token;
  gameSocket = openGameSocket({
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 800,
    transports: ['websocket', 'polling'],
  });
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
  });
  attachReceiveChatRelay(gameSocket);
  return gameSocket;
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

/**
 * 재대전 화면용 — 서버 재대전 미구현 시 로컬 모의 응답
 * @returns {{ promise: Promise<{ accepted: boolean }>, cancel: () => void }}
 */
export function startMockRematchRequest() {
  let tid = null;
  let cancelled = false;
  const waitMs = 2000 + Math.random() * 2000;
  const promise = new Promise((resolve) => {
    tid = setTimeout(() => {
      tid = null;
      if (cancelled) return;
      resolve({ accepted: Math.random() > 0.4 });
    }, waitMs);
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (tid != null) {
        clearTimeout(tid);
        tid = null;
      }
    },
  };
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

export function requestRematch() {
  gameSocket?.emit('requestRematch');
}

/** @type {((data: object) => void) | null} */
let _onRematchRequest = null;

/**
 * @param {(data: object) => void} cb
 */
export function onRematchRequest(cb) {
  _onRematchRequest = cb;
  const s = gameSocket;
  if (s) {
    s.off('rematchRequest', _rematchHandler);
    s.on('rematchRequest', _rematchHandler);
  }
}

function _rematchHandler(data) {
  if (_onRematchRequest) _onRematchRequest(data);
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
        slot: data.slot,
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
