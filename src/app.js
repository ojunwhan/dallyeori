/**
 * Phase 0 앱 라우터 + 전역 상태
 * 경주는 raceV3Inline.js로 동일 페이지에 마운트 (iframe 없음)
 */

import { mountSplash, navigateAfterAuth } from './screens/splash.js';
import { mountProfileSetup } from './screens/profileSetup.js';
import { consumeOAuthReturn, consumeQrGuestParams, decodeJWT, getCurrentUser } from './services/auth.js';
import {
  connectQrGuestSocket,
  emitRaceJoin,
  ensureSocket,
  sendTap,
  setServerMatchFoundNavigate,
} from './services/socket.js';
import { showAppToast } from './services/toast.js';
import { mountLobby } from './screens/lobby.js';
import { mountTerrainSelect } from './screens/terrainSelect.js';
import { mountMatching } from './screens/matching.js';
import { mountRematchWait } from './screens/rematchWait.js';
import { mountResult, closeResultScreenChatUi } from './screens/result.js';
import { mountDuckSelect } from './screens/duckSelect.js';
import { mountProfile } from './screens/profile.js';
import { mountFriends } from './screens/friends.js';
import { mountMessages } from './screens/messages.js';
import { mountShop } from './screens/shop.js';
import { mountHeartShop } from './screens/heartShop.js';
import { mountChatRoom } from './screens/chatRoom.js';
import { mountQrMatchHost } from './screens/qrMatchHost.js';
import { mountGuestQrWait } from './screens/guestQrWait.js';
import { mountRanking } from './screens/ranking.js';
import { mountRaceHistory } from './screens/raceHistory.js';
import { mountRaceV3Game } from './raceV3Inline.js';
import { saveRaceResult } from './services/raceHistory.js';
import './services/chat.js';
import { DUCKS_NINE } from './constants.js';

function duckDisplayNameById(id) {
  const sid = id && String(id);
  const d = DUCKS_NINE.find((x) => x.id === sid);
  return d ? d.name : '오리';
}

const RACE_FINISH_BC = 'dallyeori-race-finish';

/** @type {(() => void) | null} */
let raceV3Unmount = null;

/** @type {(() => void) | null} */
let screenUnmount = null;

/** @type {{ screen: string, user: object | null, nickname: string, language: string, translateTone: 'casual'|'formal', profilePhotoURL: string, profileSetupComplete: boolean, wins: number, losses: number, draws: number, hearts: number, selectedDuckId: string | null, ownedDuckIds: string[], lastRaceResult: object | null, lastOpponent: object | null, terrain: string, navTab: string, qrGuestOneShot: boolean, _matchingTimer: ReturnType<typeof setTimeout> | null, _matchingUiTimer: ReturnType<typeof setTimeout> | null, _matchingCancel: (() => void) | null, _chatPeerId: string }} */
export const appState = {
  screen: 'splash',
  user: null,
  nickname: '',
  language: 'ko',
  translateTone: 'casual',
  profilePhotoURL: '',
  profileSetupComplete: false,
  wins: 0,
  losses: 0,
  draws: 0,
  hearts: 0,
  selectedDuckId: null,
  ownedDuckIds: [],
  lastRaceResult: null,
  lastOpponent: null,
  terrain: 'normal',
  navTab: 'lobby',
  qrGuestOneShot: false,
  _matchingTimer: null,
  _matchingUiTimer: null,
  _matchingCancel: null,
  _chatPeerId: '',
};

const appRoot = document.getElementById('app-root');
const gameRoot = document.getElementById('game-root');
const gameCanvas = document.getElementById('game-canvas');
if (!appRoot) {
  throw new Error('#app-root 가 없습니다');
}
if (!gameRoot) {
  throw new Error('#game-root 가 없습니다');
}

function setCanvasRaceMode(on) {
  if (!gameCanvas) return;
  if (on) gameCanvas.classList.remove('is-hidden');
  else gameCanvas.classList.add('is-hidden');
}

function removeRaceMount() {
  if (raceV3Unmount) {
    try {
      raceV3Unmount();
    } catch (e) {
      console.warn('[race] unmount', e);
    }
    raceV3Unmount = null;
  }
  const staleHost = gameRoot.querySelector('#race-v3-host');
  if (staleHost) staleHost.remove();
  appRoot.classList.remove('app-root--pass-through', 'app-root--race-hidden');
}

function clearMatchingTimer() {
  if (appState._matchingCancel != null) {
    try {
      appState._matchingCancel();
    } catch (e) {
      console.warn('[matching] cancel', e);
    }
    appState._matchingCancel = null;
  }
  if (appState._matchingTimer != null) {
    clearTimeout(appState._matchingTimer);
    appState._matchingTimer = null;
  }
  if (appState._matchingUiTimer != null) {
    clearTimeout(appState._matchingUiTimer);
    appState._matchingUiTimer = null;
  }
}

/** 브라우저 히스토리와 앱 화면 동기화 */
const HISTORY_V = 1;

function buildHistoryState(screen, payload) {
  return { v: HISTORY_V, screen, payload: payload ?? null };
}

/** 뒤로가기 시 이전 히스토리 대신 로비로 (매칭·설정·상점 등) */
const POP_BACK_TO_LOBBY = new Set([
  'matching',
  'rematchWait',
  'terrainSelect',
  'profile',
  'friends',
  'messages',
  'shop',
  'heartShop',
  'ranking',
  'raceHistory',
  'duckSelect',
  'qrMatchHost',
]);

const api = {
  state: appState,
  navigate,
};

setServerMatchFoundNavigate((data) => {
  const opp = data.opponent && typeof data.opponent === 'object' ? data.opponent : {};
  const uid = opp.userId != null ? String(opp.userId) : '';
  appState.lastOpponent = {
    userId: uid || undefined,
    nickname: typeof opp.nickname === 'string' ? opp.nickname : '상대',
    profilePhotoURL: typeof opp.profilePhotoURL === 'string' ? opp.profilePhotoURL : '',
    duckId: typeof opp.duckId === 'string' ? opp.duckId : 'bori',
    duckName: typeof opp.duckName === 'string' ? opp.duckName : '',
    duckColor: typeof opp.duckColor === 'string' ? opp.duckColor : '',
    wins: Number(opp.wins) || 0,
    losses: Number(opp.losses) || 0,
    draws: Number(opp.draws) || 0,
  };
  if (data.terrain) appState.terrain = data.terrain;
  const scr = appState.screen;
  if (scr === 'matching' || scr === 'race') return;
  navigate('race', { opponentName: appState.lastOpponent.nickname });
});

/**
 * @param {string} screen
 * @param {object} [payload]
 * @param {{ skipHistory?: boolean, replaceHistory?: boolean }} [navOpts]
 */
function navigate(screen, payload, navOpts = {}) {
  try {
    if (screenUnmount) {
      try {
        screenUnmount();
      } catch (e) {
        console.warn('[nav] screenUnmount', e);
      }
      screenUnmount = null;
    }
    clearMatchingTimer();
    removeRaceMount();
    appState.screen = screen;
    globalThis.__dallyeoriAppScreen = screen;
    appRoot.classList.remove('app-root--pass-through', 'app-root--race-hidden');
    appRoot.innerHTML = '';
    setCanvasRaceMode(false);

    switch (screen) {
      case 'splash':
        mountSplash(appRoot, api);
        break;
      case 'profileSetup':
        mountProfileSetup(appRoot, api);
        break;
      case 'lobby':
        mountLobby(appRoot, api);
        break;
      case 'terrainSelect':
        mountTerrainSelect(appRoot, api);
        break;
      case 'matching':
        globalThis.__dallyeoriTerrain = appState.terrain || 'normal';
        globalThis.__dallyeoriMatchProfile = {
          nickname: appState.nickname,
          photoURL: appState.profilePhotoURL,
          duckId: appState.selectedDuckId,
          wins: appState.wins,
          losses: appState.losses,
          draws: appState.draws,
        };
        mountMatching(appRoot, api);
        break;
      case 'rematchWait':
        mountRematchWait(appRoot, api);
        break;
      case 'race':
        runRace(payload);
        break;
      case 'result':
        if (payload && typeof payload === 'object') {
          appState.lastRaceResult = payload;
        }
        screenUnmount = mountResult(appRoot, api);
        if (typeof screenUnmount !== 'function') screenUnmount = null;
        break;
      case 'duckSelect':
        mountDuckSelect(appRoot, api);
        break;
      case 'profile':
        mountProfile(appRoot, api);
        break;
      case 'friends':
        mountFriends(appRoot, api);
        break;
      case 'messages':
        mountMessages(appRoot, api);
        break;
      case 'chatRoom':
        appState._chatPeerId =
          payload && typeof payload === 'object' && payload.peerId ? String(payload.peerId) : '';
        mountChatRoom(appRoot, api);
        break;
      case 'qrMatchHost':
        mountQrMatchHost(appRoot, api);
        break;
      case 'guestQrWait':
        mountGuestQrWait(appRoot);
        break;
      case 'shop':
        mountShop(appRoot, api);
        break;
      case 'heartShop':
        mountHeartShop(appRoot, api);
        break;
      case 'ranking':
        mountRanking(appRoot, api);
        break;
      case 'raceHistory':
        mountRaceHistory(appRoot, api);
        break;
      default:
        mountLobby(appRoot, api);
    }

    if (navOpts.replaceHistory) {
      try {
        console.log('[nav] replaceState', {
          screen,
          payload: payload ?? null,
          length: history.length,
          state: history.state,
        });
        history.replaceState(buildHistoryState(screen, payload ?? null), '', '');
      } catch (e) {
        console.warn('[nav] replaceState', e);
      }
    } else if (!navOpts.skipHistory) {
      try {
        history.pushState(buildHistoryState(screen, payload ?? null), '', '');
      } catch (e) {
        console.warn('[nav] pushState', e);
      }
    }

    globalThis.__dallyeoriResultActive = screen === 'result';
  } catch (err) {
    console.error('[dallyeori] navigate failed:', screen, err);
  }
}

window.addEventListener('popstate', (e) => {
  const st = e.state;
  const ev = /** @type {PopStateEvent} */ (e);
  console.log('[nav] popstate', {
    appScreen: appState.screen,
    historyState: st,
    length: history.length,
    isTrusted: ev.isTrusted,
    resultActive: globalThis.__dallyeoriResultActive,
  });

  if (appState.screen === 'result') {
    const hasResultChatUi = !!document.getElementById('dallyeori-result-chat-overlay');
    if (hasResultChatUi) {
      console.log('[nav] popstate on result: 닫기만 (채팅 UI), 로비 이동 안 함');
      closeResultScreenChatUi();
      try {
        history.pushState(
          buildHistoryState('result', appState.lastRaceResult ?? null),
          '',
          '',
        );
      } catch (err) {
        console.warn('[nav] popstate chat-ui restore result', err);
      }
      return;
    }
    const until = Number(globalThis.__dallyeoriSuppressResultPopstateUntil) || 0;
    if (Date.now() < until) {
      console.log('[nav] popstate on result ignored (suppress window after chat popup)');
      try {
        history.pushState(
          buildHistoryState('result', appState.lastRaceResult ?? null),
          '',
          '',
        );
      } catch (err) {
        console.warn('[nav] popstate suppress restore', err);
      }
      return;
    }
    if (!ev.isTrusted) {
      console.log('[nav] popstate on result ignored (not trusted)');
      try {
        history.pushState(
          buildHistoryState('result', appState.lastRaceResult ?? null),
          '',
          '',
        );
      } catch (err) {
        console.warn('[nav] popstate untrusted restore', err);
      }
      return;
    }
  }

  if (appState.screen === 'result' || appState.screen === 'race') {
    console.log('[nav] popstate: result|race → lobby (forced)');
    navigate('lobby', undefined, { skipHistory: true });
    try {
      history.replaceState(buildHistoryState('lobby', null), '', '');
    } catch (err) {
      console.warn('[nav] popstate force lobby replaceState', err);
    }
    return;
  }
  if (POP_BACK_TO_LOBBY.has(appState.screen)) {
    navigate('lobby', undefined, { skipHistory: true });
    try {
      history.replaceState(buildHistoryState('lobby', null), '', '');
    } catch (err) {
      console.warn('[nav] popstate →lobby', appState.screen, err);
    }
    return;
  }
  if (appState.screen === 'lobby') {
    if (!window.confirm('게임을 종료하시겠습니까?')) {
      try {
        history.pushState(buildHistoryState('lobby', null), '', '');
      } catch (err) {
        console.warn('[nav] popstate lobby restore', err);
      }
      return;
    }
    if (st && st.v === HISTORY_V && st.screen) {
      navigate(st.screen, st.payload ?? undefined, { skipHistory: true });
    }
    return;
  }
  if (st && st.v === HISTORY_V && st.screen) {
    navigate(st.screen, st.payload ?? undefined, { skipHistory: true });
  } else {
    navigate('lobby', undefined, { skipHistory: true });
  }
});

window.addEventListener('beforeunload', (e) => {
  if (appState.screen === 'race' && raceV3Unmount != null) {
    e.preventDefault();
    e.returnValue = '';
  }
});

/**
 * @param {object} d
 */
function onRaceFinishPayload(d) {
  if (!d || d.type !== 'raceFinish') return;
  if (appState.screen !== 'race') return;

  const myD = d.myDistance ?? d.distance;
  const opD = d.oppDistance ?? d.opponentDistance;
  const res =
    d.result === 'win' || d.result === 'lose' || d.result === 'draw' ? d.result : 'lose';
  const normalized = {
    result: res,
    time: Number(d.time),
    taps: Number(d.taps),
    distance: Number(myD),
    opponentDistance: Number(opD),
    myDistance: Number(myD),
    oppDistance: Number(opD),
  };
  appState.lastRaceResult = normalized;
  if (!appState.qrGuestOneShot) {
    saveRaceResult(appState, normalized, appState.lastOpponent);
  }
  // 경주 종료 연출 시간 확보 (2초)
  setTimeout(() => {
    removeRaceMount();
    console.log('[race] onRaceFinish → navigate("result", replaceHistory:true)');
    navigate('result', normalized, { replaceHistory: true });
  }, 2000);
}

const raceFinishChannel = new BroadcastChannel(RACE_FINISH_BC);
raceFinishChannel.addEventListener('message', (ev) => {
  onRaceFinishPayload(ev.data);
});

/**
 * @param {{ opponentName?: string } | undefined} _payload
 */
function runRace(_payload) {
  appRoot.replaceChildren();
  appRoot.classList.remove('app-root--pass-through');
  appRoot.classList.add('app-root--race-hidden');

  const host = document.createElement('div');
  host.id = 'race-v3-host';
  gameRoot.appendChild(host);

  const pr = globalThis.__dallyeoriPendingRace;
  const slotNum = pr && pr.slot != null ? Number(pr.slot) : NaN;
  const raceSlot = slotNum === 0 || slotNum === 1 ? /** @type {0|1} */ (slotNum) : null;
  /** @type {{ socket: import('socket.io-client').Socket, roomId: string, mySlot: 0|1, myDuckId: string, oppDuckId: string, myDuckName: string, oppDuckName: string, emitTap?: (foot: 'left'|'right') => void } | undefined} */
  let serverRace;
  if (pr && pr.roomId != null && raceSlot != null && pr.socket) {
    const roomId = pr.roomId;
    const slot = raceSlot;
    const raceSock = pr.socket;
    const myId = pr.myDuckId || appState.selectedDuckId || 'bori';
    const oppId = pr.oppDuckId || 'bori';
    serverRace = {
      socket: raceSock,
      roomId,
      mySlot: slot,
      myDuckId: myId,
      oppDuckId: oppId,
      myDuckName: duckDisplayNameById(myId),
      oppDuckName: pr.oppDuckName || duckDisplayNameById(oppId),
      emitTap(foot) {
        sendTap(foot, roomId, slot, raceSock);
      },
    };
  }

  raceV3Unmount = mountRaceV3Game(host, {
    onFinish: (pl) => onRaceFinishPayload(pl),
    terrainKey: appState.terrain || 'normal',
    getAppState: () => appState,
    serverRace,
  });

  if (pr && raceSlot != null && pr.roomId && pr.socket) {
    emitRaceJoin(pr.roomId, raceSlot, pr.socket);
    delete globalThis.__dallyeoriPendingRace;
  }
}

function boot() {
  if (window.__dallyeoriAppBooted) {
    console.warn('[dallyeori] boot skipped (already initialized)');
    return;
  }
  window.__dallyeoriAppBooted = true;
  consumeOAuthReturn();
  const qr = consumeQrGuestParams();
  if (qr?.token) {
    appState.qrGuestOneShot = true;
    const raw = decodeJWT(qr.token);
    const p = raw && typeof raw === 'object' ? raw : {};
    const nick = String(p.displayName || '게스트');
    appState.user = {
      uid: String(p.uid || 'guest'),
      displayName: nick,
      email: '',
      photoURL: '',
    };
    appState.nickname = nick;
    appState.selectedDuckId = 'bori';
    globalThis.__dallyeoriMatchProfile = {
      nickname: nick,
      photoURL: '',
      duckId: 'bori',
      wins: 0,
      losses: 0,
      draws: 0,
    };
    connectQrGuestSocket(qr.token);
    showAppToast('게스트로 연결 중이에요…');
    navigate('guestQrWait', undefined, { replaceHistory: true });
    return;
  }
  const u = getCurrentUser();
  if (u) {
    appState.user = u;
    console.log('[dallyeori] app.js boot → JWT 세션 복원');
    navigateAfterAuth(api, { replaceHistory: true });
    const bootSock = ensureSocket();
    console.log('[app] boot ensureSocket result:', !!bootSock, 'connected:', bootSock?.connected);
  } else {
    console.log('[dallyeori] app.js boot → splash');
    navigate('splash', undefined, { replaceHistory: true });
  }
}

function runWhenDomReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    queueMicrotask(fn);
  }
}

window.addEventListener('dallyeori:guestMatchFound', () => {
  navigate('race');
});

runWhenDomReady(() => {
  boot();
});

document.addEventListener(
  'submit',
  (e) => {
    e.preventDefault();
  },
  true,
);
