/**
 * 로비 — 프로필 요약 · 선택 오리 · 대전 CTA · 하단 메뉴
 * UI 조각은 함수로 분리해 레이아웃만 교체하기 쉽게 유지
 */

import { DUCKS_NINE } from '../constants.js';
import { resolveMediaUrl } from '../services/auth.js';
import { duckRawUrl } from '../data/duckFaces.js';
import { getBalance } from '../services/hearts.js';
import { flushServerFriendNotificationsToClient, getNewFriendRejectNotifCount } from '../services/friends.js';
import { ensureSocket } from '../services/socket.js';
import { getNewHeartsCount } from '../services/likes.js';
import { getTotalUnreadCount } from '../services/chat.js';
import { showAppToast } from '../services/toast.js';

/** @param {string | null | undefined} id */
function duckById(id) {
  if (!id) return null;
  return DUCKS_NINE.find((d) => d.id === id) ?? null;
}

/** @param {object} state */
function lobbyNickname(state) {
  return state.nickname || state.user?.displayName || '게스트';
}

/** @param {object} state */
function hasSelectedDuck(state) {
  return Boolean(state.selectedDuckId);
}

/**
 * 게스트를 가입(로그인) 화면으로 안내한다.
 * @param {{ navigate: Function }} api
 * @param {string} msg
 */
function guideGuestToSignup(api, msg) {
  showAppToast(msg);
  api.navigate('splash');
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}
function isStandaloneMode() {
  return (
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator?.standalone === true
  );
}

/** 홈화면 설치 버튼 — 설치 가능한 환경에서만 반환 */
function createLobbyInstallButton(api) {
  if (isStandaloneMode()) return null; // 이미 설치됨
  const canPrompt = !!window.__dallyeoriInstallPrompt;
  const ios = isIOSDevice();
  if (!canPrompt && !ios) return null; // 설치 불가 환경(데스크톱 크롬 일부 등)
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'lobby-install-btn';
  btn.textContent = '📲 홈 화면에 앱 설치';
  btn.addEventListener('click', async () => {
    const p = window.__dallyeoriInstallPrompt;
    if (p && typeof p.prompt === 'function') {
      p.prompt();
      try {
        await p.userChoice;
      } catch {
        /* 사용자 취소 — 무시 */
      }
      window.__dallyeoriInstallPrompt = null;
      btn.remove();
    } else if (ios) {
      showAppToast('사파리 하단 공유 버튼 → "홈 화면에 추가"를 누르면 설치돼요');
    }
  });
  return btn;
}

/**
 * 상단: 프로필 사진 + 닉네임 + 하트 — 탭 시 프로필
 * @param {{ navigate: Function, state: object }} api
 */
export function createLobbyProfileSummary(api) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'lobby-profile-summary app-box';

  // 게스트: 프로필 대신 '가입하고 친구 만들기' 입구로 교체
  if (api.state.isGuest) {
    row.classList.add('lobby-profile-summary--guest');

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'lobby-profile-avatar-wrap';
    const ph = document.createElement('div');
    ph.className = 'lobby-profile-avatar-placeholder lobby-guest-cta-icon';
    ph.textContent = '🦆';
    ph.setAttribute('aria-hidden', 'true');
    avatarWrap.appendChild(ph);

    const meta = document.createElement('div');
    meta.className = 'lobby-profile-meta';
    const ctaTitle = document.createElement('div');
    ctaTitle.className = 'lobby-guest-cta-title';
    ctaTitle.textContent = '가입하고 친구 만들기';
    const ctaSub = document.createElement('div');
    ctaSub.className = 'lobby-guest-cta-sub';
    ctaSub.textContent = '게스트로 둘러보는 중 · 탭하여 가입';
    meta.appendChild(ctaTitle);
    meta.appendChild(ctaSub);

    const arrow = document.createElement('div');
    arrow.className = 'lobby-guest-cta-arrow';
    arrow.textContent = '→';
    arrow.setAttribute('aria-hidden', 'true');

    row.appendChild(avatarWrap);
    row.appendChild(meta);
    row.appendChild(arrow);
    row.addEventListener('click', () => api.navigate('splash'));
    return row;
  }

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'lobby-profile-avatar-wrap';

  const url = resolveMediaUrl(api.state.profilePhotoURL || '');
  if (url) {
    const img = document.createElement('img');
    img.className = 'lobby-profile-avatar-img';
    img.src = url;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    avatarWrap.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'lobby-profile-avatar-placeholder';
    ph.textContent = lobbyNickname(api.state).slice(0, 1) || '?';
    ph.setAttribute('aria-hidden', 'true');
    avatarWrap.appendChild(ph);
  }

  const meta = document.createElement('div');
  meta.className = 'lobby-profile-meta';

  const nameEl = document.createElement('div');
  nameEl.className = 'lobby-profile-nick';
  nameEl.textContent = lobbyNickname(api.state);

  const heartsEl = document.createElement('div');
  heartsEl.className = 'lobby-profile-hearts app-muted';
  heartsEl.textContent = `♥ ${getBalance(api.state)}`;

  meta.appendChild(nameEl);
  meta.appendChild(heartsEl);

  row.appendChild(avatarWrap);
  row.appendChild(meta);

  row.addEventListener('click', () => api.navigate('profile'));
  return row;
}

/**
 * 가운데: 현재 오리(색 원 + 이름) — 탭 시 오리 선택
 * @param {{ navigate: Function, state: object }} api
 */
export function createLobbyDuckPreview(api) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'lobby-duck-preview';

  const duck = duckById(api.state.selectedDuckId);

  let circle;
  if (duck) {
    circle = document.createElement('img');
    circle.className = 'lobby-duck-raw';
    circle.src = duckRawUrl(duck.id);
    circle.alt = duck.name;
  } else {
    circle = document.createElement('div');
    circle.className = 'duck-circle lobby-duck-circle lobby-duck-circle--empty';
  }

  const name = document.createElement('div');
  name.className = 'lobby-duck-name';
  name.textContent = duck ? duck.name : '오리를 선택하세요';

  const hint = document.createElement('div');
  hint.className = 'lobby-duck-tap-hint app-muted';
  hint.textContent = '탭하여 변경';

  card.appendChild(circle);
  card.appendChild(name);
  card.appendChild(hint);

  card.addEventListener('click', () => api.navigate('duckSelect'));
  return card;
}

/**
 * 메인 CTA + 비활성 안내
 * @param {{ navigate: Function, state: object }} api
 */
export function createLobbyBattleSection(api) {
  const wrap = document.createElement('div');
  wrap.className = 'lobby-battle-section';

  const hint = document.createElement('p');
  hint.className = 'lobby-battle-gate-hint app-muted';
  hint.hidden = hasSelectedDuck(api.state);
  hint.textContent = '먼저 오리를 선택하세요.';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'app-btn app-btn--primary app-btn--lobby-battle';
  btn.textContent = '대전하기';

  btn.addEventListener('click', () => {
    if (!hasSelectedDuck(api.state)) return;
    api.navigate('terrainSelect');
  });

  const btnQr = document.createElement('button');
  btnQr.type = 'button';
  btnQr.className = 'app-btn';
  btnQr.style.marginTop = '10px';
  btnQr.textContent = 'QR 대전';
  btnQr.addEventListener('click', () => {
    if (!hasSelectedDuck(api.state)) return;
    if (api.state.isGuest) {
      guideGuestToSignup(api, 'QR 대전은 가입 후 이용할 수 있어요');
      return;
    }
    api.navigate('qrMatchHost');
  });

  function sync() {
    const ok = hasSelectedDuck(api.state);
    btn.disabled = !ok;
    btnQr.disabled = !ok;
    hint.hidden = ok;
  }

  wrap.appendChild(hint);
  wrap.appendChild(btn);
  wrap.appendChild(btnQr);
  sync();
  return wrap;
}

/**
 * 하단 가로 메뉴
 * @param {{ navigate: Function, state: object }} api
 */
export function createLobbyBottomMenu(api) {
  const nav = document.createElement('div');
  nav.className = 'lobby-bottom-menu';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', '로비 메뉴');

  const uid = api.state.user?.uid;
  const heartBadgeCount = uid ? getNewHeartsCount(uid) : 0;
  const rejectBadgeCount = uid ? getNewFriendRejectNotifCount(uid) : 0;
  const friendBadge = heartBadgeCount + rejectBadgeCount;

  const guest = api.state.isGuest === true;
  const items = [
    {
      label: '친구',
      onClick: guest
        ? () => guideGuestToSignup(api, '가입하면 친구를 만들 수 있어요')
        : () => api.navigate('friends'),
      badge: guest ? 0 : friendBadge,
      badgeTitle: '새 알림',
    },
    {
      label: '메시지',
      onClick: guest
        ? () => guideGuestToSignup(api, '가입하면 친구와 채팅할 수 있어요')
        : () => api.navigate('messages'),
      badge: guest ? 0 : getTotalUnreadCount(uid),
    },
    {
      label: '랭킹',
      onClick: guest
        ? () => guideGuestToSignup(api, '가입하면 랭킹에 참여할 수 있어요')
        : () => api.navigate('ranking'),
      badge: 0,
    },
  ];

  for (const it of items) {
    const wrap = document.createElement('div');
    wrap.className = 'lobby-nav-cell';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lobby-bottom-menu__btn';
    b.addEventListener('click', it.onClick);
    if (it.label === '메시지' && uid) {
      b.textContent = '';
      b.appendChild(document.createTextNode('메시지'));
      const c = getTotalUnreadCount(uid);
      const badge = document.createElement('span');
      badge.className = 'lobby-nav-badge lobby-nav-msg-badge';
      badge.setAttribute('data-uid', uid);
      badge.title = '읽지 않은 메시지';
      badge.hidden = c <= 0;
      badge.textContent = c > 0 ? (c > 99 ? '99+' : String(c)) : '';
      b.appendChild(badge);
    } else {
      b.textContent = it.label;
    }
    wrap.appendChild(b);
    if (it.label !== '메시지' && it.badge > 0) {
      const badge = document.createElement('span');
      badge.className = 'lobby-nav-badge';
      badge.textContent = it.badge > 99 ? '99+' : String(it.badge);
      badge.title = it.badgeTitle ?? '새 알림';
      wrap.appendChild(badge);
    }
    nav.appendChild(wrap);
  }
  return nav;
}

let lobbyChatUpdateListenerBound = false;

function syncLobbyMessageBadgeFromEvent() {
  const el = document.querySelector('.lobby-screen .lobby-nav-msg-badge');
  if (!el) return;
  const u = el.getAttribute('data-uid');
  if (!u) return;
  const c = getTotalUnreadCount(u);
  if (c <= 0) {
    el.hidden = true;
    el.textContent = '';
  } else {
    el.hidden = false;
    el.textContent = c > 99 ? '99+' : String(c);
  }
}

/**
 * mount 시 한 번에 조립. 외부에서 DOM만 바꾸려면 위 create* 만 재사용하면 됨.
 *
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountLobby(root, api) {
  const wrap = document.createElement('div');
  wrap.className = 'app-screen lobby-screen';

  const profile = createLobbyProfileSummary(api);
  const duckPreview = createLobbyDuckPreview(api);
  const battle = createLobbyBattleSection(api);
  const bottom = createLobbyBottomMenu(api);

  const main = document.createElement('div');
  main.className = 'lobby-main';
  main.appendChild(duckPreview);

  wrap.appendChild(profile);
  wrap.appendChild(main);
  wrap.appendChild(battle);
  wrap.appendChild(bottom);

  // 홈화면 설치 버튼 — mount 시점 또는 설치가능 이벤트 도착 시 하단메뉴 위에 삽입
  function tryAddInstall() {
    if (wrap.querySelector('.lobby-install-btn')) return;
    const b = createLobbyInstallButton(api);
    if (b) wrap.insertBefore(b, bottom);
  }
  tryAddInstall();
  window.addEventListener('dallyeori-can-install', tryAddInstall, { once: true });

  root.appendChild(wrap);

  const lobbyUid = api.state.user?.uid;
  if (lobbyUid) {
    ensureSocket();
    void flushServerFriendNotificationsToClient(lobbyUid);
  }

  if (!lobbyChatUpdateListenerBound) {
    lobbyChatUpdateListenerBound = true;
    window.addEventListener('dallyeori-chat-update', syncLobbyMessageBadgeFromEvent);
  }

  const badgeInterval = setInterval(() => {
    const el = document.querySelector('.lobby-nav-msg-badge');
    if (!el) {
      clearInterval(badgeInterval);
      return;
    }
    const uid = api.state.user?.uid;
    if (!uid) return;
    const count = getTotalUnreadCount(uid);
    el.textContent = count > 99 ? '99+' : String(count);
    el.hidden = count === 0;
  }, 1000);
}
