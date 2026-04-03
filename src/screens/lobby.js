/**
 * 로비 — 프로필 요약 · 선택 오리 · 대전 CTA · 하단 메뉴
 * UI 조각은 함수로 분리해 레이아웃만 교체하기 쉽게 유지
 */

import { DUCKS_NINE } from '../constants.js';
import { getBalance } from '../services/hearts.js';
import { getNewFriendRejectNotifCount } from '../services/friends.js';
import { getNewLikesCount } from '../services/likes.js';
import { getTotalUnreadCount } from '../services/chat.js';

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
 * 상단: 프로필 사진 + 닉네임 + 하트 — 탭 시 프로필
 * @param {{ navigate: Function, state: object }} api
 */
export function createLobbyProfileSummary(api) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'lobby-profile-summary app-box';

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'lobby-profile-avatar-wrap';

  const url = api.state.profilePhotoURL;
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
  card.className = 'lobby-duck-preview app-box';

  const duck = duckById(api.state.selectedDuckId);

  const circle = document.createElement('div');
  circle.className = 'duck-circle lobby-duck-circle';
  if (duck) {
    circle.style.backgroundColor = duck.color;
    if (duck.id === 'duri') circle.classList.add('duck-circle--dark');
    if (duck.id === 'ari') circle.classList.add('duck-circle--light');
  } else {
    circle.classList.add('lobby-duck-circle--empty');
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

function showRankingSoon() {
  window.alert('준비 중입니다.');
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
  const likeBadgeCount = uid ? getNewLikesCount(uid) : 0;
  const rejectBadgeCount = uid ? getNewFriendRejectNotifCount(uid) : 0;
  const friendBadge = likeBadgeCount + rejectBadgeCount;

  const items = [
    { label: '상점', onClick: () => api.navigate('shop'), badge: 0 },
    {
      label: '친구',
      onClick: () => api.navigate('friends'),
      badge: friendBadge,
      badgeTitle: '새 알림',
    },
    {
      label: '메시지',
      onClick: () => api.navigate('messages'),
      badge: getTotalUnreadCount(uid),
    },
    { label: '랭킹', onClick: () => api.navigate('ranking'), badge: 0 },
  ];

  for (const it of items) {
    const wrap = document.createElement('div');
    wrap.className = 'lobby-nav-cell';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lobby-bottom-menu__btn';
    b.textContent = it.label;
    b.addEventListener('click', it.onClick);
    wrap.appendChild(b);
    if (it.label === '메시지' && uid) {
      const c = getTotalUnreadCount(uid);
      const badge = document.createElement('span');
      badge.className = 'lobby-nav-badge lobby-nav-msg-badge';
      badge.setAttribute('data-uid', uid);
      badge.title = '읽지 않은 메시지';
      badge.hidden = c <= 0;
      badge.textContent = c > 0 ? (c > 99 ? '99+' : String(c)) : '';
      wrap.appendChild(badge);
    } else if (it.badge > 0) {
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

  root.appendChild(wrap);

  if (!lobbyChatUpdateListenerBound) {
    lobbyChatUpdateListenerBound = true;
    window.addEventListener('dallyeori-chat-update', syncLobbyMessageBadgeFromEvent);
  }
}
