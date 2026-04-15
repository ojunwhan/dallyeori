/**
 * 친구 — 목록·요청·검색·액션 시트 (Phase 4)
 */

import { DUCKS_NINE } from '../constants.js';
import { giftToFriend } from '../services/hearts.js';
import {
  acceptRequest,
  cancelSentRequest,
  formatFriendRejectLine,
  getFriendList,
  getFriendRejectNotifications,
  getPendingRequests,
  getSentRequests,
  isFriend,
  markFriendRejectNotifsSeen,
  rejectRequest,
  removeFriend,
  sendRequest,
  enrichStaleFriendMeta,
} from '../services/friends.js';
import { emitAcceptFriendRequest, emitFriendRequestSent, ensureSocket } from '../services/socket.js';
import { isMutualHeart, markHeartNotificationsSeen, sendHeart } from '../services/likes.js';
import { searchUsersDiscoveryV1, postFriendRequestV1 } from '../services/profileApi.js';
import {
  LANGUAGES_FULL,
  getLanguageByCode,
  getCountryDisplayFromAlpha2,
} from '../data/languagesFull.js';
import { regionalEmojiToAlpha2 } from '../utils/flagIcon.js';

/** @type {(() => void) | null} */
let detachFriendsStorageListener = null;

/** @param {string | null | undefined} duckId */
function duckLabel(duckId) {
  if (!duckId) return '—';
  return DUCKS_NINE.find((d) => d.id === duckId)?.name ?? duckId;
}

/** LANGUAGES_FULL 기준 리전 플래그 → alpha-2, 동일 국기(동일 alpha2) 한 번만 */
function uniqueCountryOptionsFromLanguagesFull() {
  const seenCc = new Set();
  const list = [];
  for (const row of LANGUAGES_FULL) {
    const cc = regionalEmojiToAlpha2(row.flag);
    if (!cc || seenCc.has(cc)) continue;
    seenCc.add(cc);
    list.push({ alpha2: cc, label: `${row.flag} ${row.name}` });
  }
  list.sort((a, b) => a.label.localeCompare(b.label, 'en'));
  return list;
}

/** @param {HTMLElement} el */
function playHeartAnim(el) {
  el.classList.remove('heart-burst');
  void el.offsetWidth;
  el.classList.add('heart-burst');
}

let heartGiftAnimGloballyBound = false;
function ensureHeartGiftAnimListener() {
  if (heartGiftAnimGloballyBound) return;
  heartGiftAnimGloballyBound = true;
  window.addEventListener('dallyeori-heart-gift-sent', (ev) => {
    const ce = /** @type {CustomEvent} */ (ev);
    const t = ce.detail?.targetUid;
    if (!t) return;
    for (const b of document.querySelectorAll('button[data-heart-peer]')) {
      if (b.getAttribute('data-heart-peer') === t) {
        playHeartAnim(/** @type {HTMLElement} */ (b));
      }
    }
  });
}

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountFriends(root, api) {
  ensureHeartGiftAnimListener();
  detachFriendsStorageListener?.();
  const uid = api.state.user?.uid;
  if (uid) {
    markHeartNotificationsSeen(uid);
    ensureSocket();
  }

  const wrap = document.createElement('div');
  wrap.className = 'app-screen friends-screen';

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '친구';

  /** @type {HTMLElement | null} */
  let rejectStrip = null;
  if (uid) {
    const unread = getFriendRejectNotifications(uid);
    if (unread.length > 0) {
      rejectStrip = document.createElement('div');
      rejectStrip.className = 'friends-reject-strip app-box';
      for (const n of unread) {
        const row = document.createElement('div');
        row.className = 'friends-reject-line';
        row.textContent = formatFriendRejectLine(n.nickname);
        rejectStrip.appendChild(row);
      }
      markFriendRejectNotifsSeen(uid);
    }
  }

  const tabRow = document.createElement('div');
  tabRow.className = 'friends-tabs';
  const tabFriends = document.createElement('button');
  tabFriends.type = 'button';
  tabFriends.className = 'friends-tab is-active';
  tabFriends.textContent = '내 친구';
  const tabFind = document.createElement('button');
  tabFind.type = 'button';
  tabFind.className = 'friends-tab';
  tabFind.textContent = '찾기';
  const tabReq = document.createElement('button');
  tabReq.type = 'button';
  tabReq.className = 'friends-tab';
  tabReq.textContent = '요청';
  tabRow.appendChild(tabFriends);
  tabRow.appendChild(tabFind);
  tabRow.appendChild(tabReq);

  const panelFriends = document.createElement('div');
  const panelFind = document.createElement('div');
  panelFind.className = 'friends-find-panel';
  panelFind.hidden = true;

  const findSearchRow = document.createElement('div');
  findSearchRow.className = 'friends-find-search-row';
  const findSearchInput = document.createElement('input');
  findSearchInput.type = 'search';
  findSearchInput.className = 'app-input friends-find-search-input';
  findSearchInput.placeholder = '닉네임 검색';
  findSearchInput.autocomplete = 'off';
  const findSearchBtn = document.createElement('button');
  findSearchBtn.type = 'button';
  findSearchBtn.className = 'app-btn app-btn--primary friends-find-search-btn';
  findSearchBtn.textContent = '검색';
  findSearchRow.appendChild(findSearchInput);
  findSearchRow.appendChild(findSearchBtn);

  const findFilters = document.createElement('div');
  findFilters.className = 'friends-find-filters';
  const countrySel = document.createElement('select');
  countrySel.className = 'app-input friends-find-select';
  countrySel.setAttribute('aria-label', '국가 필터');
  const optAllCountry = document.createElement('option');
  optAllCountry.value = '';
  optAllCountry.textContent = '🌐 All Countries';
  countrySel.appendChild(optAllCountry);
  for (const c of uniqueCountryOptionsFromLanguagesFull()) {
    const o = document.createElement('option');
    o.value = c.alpha2;
    o.textContent = c.label;
    countrySel.appendChild(o);
  }
  const genderSel = document.createElement('select');
  genderSel.className = 'app-input friends-find-select';
  genderSel.setAttribute('aria-label', '성별 필터');
  for (const { v, lab } of [
    { v: '', lab: 'All' },
    { v: 'M', lab: 'Male' },
    { v: 'F', lab: 'Female' },
  ]) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = lab;
    genderSel.appendChild(o);
  }
  findFilters.appendChild(countrySel);
  findFilters.appendChild(genderSel);

  const findResults = document.createElement('div');
  findResults.className = 'friends-find-results';
  const findLoadMore = document.createElement('button');
  findLoadMore.type = 'button';
  findLoadMore.className = 'app-btn friends-find-more';
  findLoadMore.textContent = '더 보기';
  findLoadMore.hidden = true;

  panelFind.appendChild(findSearchRow);
  panelFind.appendChild(findFilters);
  panelFind.appendChild(findResults);
  panelFind.appendChild(findLoadMore);

  const panelReq = document.createElement('div');
  panelReq.hidden = true;

  const listFriends = document.createElement('div');
  listFriends.className = 'friends-list';
  panelFriends.appendChild(listFriends);

  const reqIncomingTitle = document.createElement('h3');
  reqIncomingTitle.className = 'friends-subtitle';
  reqIncomingTitle.textContent = '받은 요청';
  const listIncoming = document.createElement('div');
  listIncoming.className = 'friends-list';
  const reqOutgoingTitle = document.createElement('h3');
  reqOutgoingTitle.className = 'friends-subtitle';
  reqOutgoingTitle.textContent = '보낸 요청';
  const listOutgoing = document.createElement('div');
  listOutgoing.className = 'friends-list';
  panelReq.appendChild(reqIncomingTitle);
  panelReq.appendChild(listIncoming);
  panelReq.appendChild(reqOutgoingTitle);
  panelReq.appendChild(listOutgoing);

  const sheet = document.createElement('div');
  sheet.className = 'action-sheet';
  sheet.hidden = true;
  const sheetInner = document.createElement('div');
  sheetInner.className = 'action-sheet-inner app-box';
  sheet.appendChild(sheetInner);
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.hidden = true;
  });

  const giftOverlay = document.createElement('div');
  giftOverlay.className = 'gift-modal';
  giftOverlay.hidden = true;
  const giftInner = document.createElement('div');
  giftInner.className = 'gift-modal-inner app-box';
  giftOverlay.appendChild(giftInner);
  giftOverlay.addEventListener('click', (e) => {
    if (e.target === giftOverlay) giftOverlay.hidden = true;
  });

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'app-btn';
  back.style.marginTop = '12px';
  back.textContent = '로비';
  back.addEventListener('click', () => api.navigate('lobby'));

  wrap.appendChild(title);
  if (rejectStrip) wrap.appendChild(rejectStrip);
  wrap.appendChild(tabRow);
  wrap.appendChild(panelFriends);
  wrap.appendChild(panelFind);
  wrap.appendChild(panelReq);
  wrap.appendChild(sheet);
  wrap.appendChild(giftOverlay);
  wrap.appendChild(back);
  root.appendChild(wrap);

  function openGiftModal(friendId) {
    giftInner.replaceChildren();
    const t = document.createElement('div');
    t.className = 'gift-modal-title';
    t.textContent = '하트 선물 개수';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '1';
    inp.className = 'app-input';
    inp.placeholder = '♥ 개수';
    const row = document.createElement('div');
    row.className = 'gift-modal-actions';
    const btnSend = document.createElement('button');
    btnSend.type = 'button';
    btnSend.className = 'app-btn app-btn--primary';
    btnSend.textContent = '보내기';
    btnSend.addEventListener('click', () => {
      const n = Number(inp.value);
      const r = giftToFriend(api.state, friendId, n);
      if (r.ok) {
        giftOverlay.hidden = true;
        window.alert('선물했어요!');
      } else if (r.error === 'funds') window.alert('하트가 부족해요.');
    });
    const btnX = document.createElement('button');
    btnX.type = 'button';
    btnX.className = 'app-btn';
    btnX.textContent = '취소';
    btnX.addEventListener('click', () => {
      giftOverlay.hidden = true;
    });
    row.appendChild(btnSend);
    row.appendChild(btnX);
    giftInner.appendChild(t);
    giftInner.appendChild(inp);
    giftInner.appendChild(row);
    giftOverlay.hidden = false;
  }

  function openSheet(/** @type {{ id: string, nickname: string, duckId: string }} */ friend) {
    sheetInner.replaceChildren();
    const h = document.createElement('div');
    h.className = 'action-sheet-title';
    h.textContent = friend.nickname;
    sheetInner.appendChild(h);
    function mk(label, fn) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'app-btn';
      b.style.marginTop = '8px';
      b.textContent = label;
      b.addEventListener('click', () => {
        sheet.hidden = true;
        fn();
      });
      sheetInner.appendChild(b);
    }
    mk('대전 신청', () => window.alert('대전 연동은 추후 제공 예정이에요.'));
    mk('하트 선물', () => openGiftModal(friend.id));
    mk('메시지', () => api.navigate('chatRoom', { peerId: friend.id }));
    mk('삭제', () => {
      if (uid && window.confirm('친구를 삭제할까요?')) {
        removeFriend(uid, friend.id);
        renderFriends();
      }
    });
    mk('닫기', () => {});
    sheet.hidden = false;
  }

  function friendCard(
    /** @type {{ id: string, nickname: string, duckId: string, online?: boolean }} */ f,
    /** @type {{ showHeart?: boolean, heartBtn?: HTMLButtonElement }} */ opts,
  ) {
    const card = document.createElement('div');
    card.className = 'friend-card app-box';

    const row = document.createElement('div');
    row.className = 'friend-card-row';

    const av = document.createElement('div');
    av.className = 'friend-avatar-ph';
    av.textContent = f.nickname.slice(0, 1);

    const mid = document.createElement('div');
    mid.className = 'friend-card-mid';
    const n = document.createElement('div');
    n.className = 'friend-nick';
    n.textContent = f.nickname;
    mid.appendChild(n);
    const duck = document.createElement('div');
    duck.className = 'friend-duck app-muted';
    duck.textContent = duckLabel(f.duckId);
    mid.appendChild(duck);

    if (uid && isMutualHeart(uid, f.id)) {
      const badge = document.createElement('div');
      badge.className = 'friend-mutual-badge';
      badge.textContent = '💕 서로 하트';
      mid.appendChild(badge);
    }

    row.appendChild(av);
    row.appendChild(mid);

    if (f.online) {
      const on = document.createElement('span');
      on.className = 'friend-online-dot';
      on.title = '온라인';
      row.appendChild(on);
    }

    card.appendChild(row);

    if (opts.showHeart && uid) {
      const heartRow = document.createElement('div');
      heartRow.className = 'friend-heart-row';
      const heartBtn = document.createElement('button');
      heartBtn.type = 'button';
      heartBtn.className = 'app-btn app-btn--inline friend-heart-btn friend-heart-btn--icon';
      heartBtn.textContent = '♥';
      heartBtn.title = '하트 보내기 (첫 1회/일 무료)';
      heartBtn.setAttribute('data-heart-peer', f.id);
      heartBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!ensureSocket()) return;
        sendHeart(uid, f.id);
      });
      heartRow.appendChild(heartBtn);
      card.appendChild(heartRow);
    }

    card.addEventListener('click', () => openSheet(f));
    return card;
  }

  let findOffset = 0;
  const FIND_PAGE = 10;
  let findSeq = 0;
  /** @type {boolean} */
  let findLastHadFullPage = false;

  /**
   * @param {string | undefined} me
   * @param {string} peerId
   */
  function isPendingOutTo(me, peerId) {
    if (!me || !peerId) return false;
    return getSentRequests(me).some((r) => r.toId === peerId);
  }

  /**
   * @param {{ uid: string, nickname: string, language: string, countryCode: string, gender: string | null, isOnline: boolean, isFriend: boolean, isRequested: boolean }} u
   */
  function renderFindUserCard(u) {
    const card = document.createElement('div');
    card.className = 'friends-find-card app-box';

    const nick = document.createElement('div');
    nick.className = 'friends-find-card-nick';
    nick.textContent = u.nickname || u.uid;

    const langRow = document.createElement('div');
    langRow.className = 'friends-find-card-meta';
    const langEntry = getLanguageByCode(u.language || 'ko');
    const langLine = langEntry ? `${langEntry.flag} ${langEntry.name}` : String(u.language || 'ko');
    langRow.textContent = `언어: ${langLine}`;

    const countryRow = document.createElement('div');
    countryRow.className = 'friends-find-card-meta';
    const cc = typeof u.countryCode === 'string' ? u.countryCode.trim().toUpperCase() : '';
    const cDisp = getCountryDisplayFromAlpha2(cc);
    countryRow.textContent =
      cc && cDisp.nameEn ? `국가: ${cDisp.flag ? `${cDisp.flag} ` : ''}${cDisp.nameEn}` : '국가: —';

    card.appendChild(nick);
    card.appendChild(langRow);
    card.appendChild(countryRow);

    if (u.gender === 'M' || u.gender === 'F') {
      const gRow = document.createElement('div');
      gRow.className = 'friends-find-card-meta';
      gRow.textContent = `성별: ${u.gender === 'M' ? 'Male' : 'Female'}`;
      card.appendChild(gRow);
    }

    const row = document.createElement('div');
    row.className = 'friends-find-card-actions';

    if (u.isOnline) {
      const dot = document.createElement('span');
      dot.className = 'friend-online-dot';
      dot.title = '온라인';
      row.appendChild(dot);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-btn app-btn--inline';
    const peerId = u.uid;
    const serverFriend = Boolean(u.isFriend);
    const serverReq = Boolean(u.isRequested);
    const localFriend = uid ? isFriend(uid, peerId) : false;
    const localOut = uid ? isPendingOutTo(uid, peerId) : false;

    if (serverFriend || localFriend) {
      btn.textContent = '친구';
      btn.disabled = true;
    } else if (serverReq || localOut) {
      btn.textContent = '요청중';
      btn.disabled = true;
    } else {
      btn.textContent = '친구 신청';
      btn.classList.add('app-btn--primary');
      btn.addEventListener('click', async () => {
        if (!uid) return;
        const pr = await postFriendRequestV1(peerId);
        if (!pr.ok) {
          if (pr.error === 'incoming_pending') {
            window.alert('상대가 먼저 요청했어요. 요청 탭에서 수락해 주세요.');
          } else window.alert('요청에 실패했어요.');
          return;
        }
        const r = sendRequest(uid, peerId, { nickname: u.nickname });
        if (r.ok && r.requestId) emitFriendRequestSent(peerId, r.requestId);
        if (r.ok) window.alert('친구 요청을 보냈어요.');
        else if (r.message) window.alert(r.message);
        else if (r.error === 'pending_out') window.alert('이미 요청 중이에요.');
        else if (r.error === 'pending_in') {
          window.alert('상대가 먼저 요청했다면 요청 탭에서 수락해 주세요.');
        } else window.alert('요청할 수 없어요.');
        void runDiscoverySearch(true);
        renderReq();
      });
    }

    row.appendChild(btn);
    card.appendChild(row);
    return card;
  }

  async function runDiscoverySearch(/** @type {boolean} */ resetOffset) {
    if (!uid) {
      findResults.replaceChildren();
      findLoadMore.hidden = true;
      return;
    }
    if (resetOffset) findOffset = 0;
    const seq = (findSeq += 1);
    if (resetOffset) {
      findResults.replaceChildren();
      const loading = document.createElement('p');
      loading.className = 'app-muted';
      loading.textContent = '검색 중…';
      findResults.appendChild(loading);
    }
    const { ok, users } = await searchUsersDiscoveryV1({
      q: findSearchInput.value.trim(),
      countryCode: countrySel.value,
      gender: genderSel.value,
      offset: findOffset,
      limit: FIND_PAGE,
    });
    if (seq !== findSeq) return;
    if (resetOffset) findResults.replaceChildren();
    if (!ok) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '검색에 실패했어요.';
      findResults.appendChild(p);
      findLoadMore.hidden = true;
      return;
    }
    for (const u of users) {
      findResults.appendChild(renderFindUserCard(u));
    }
    findLastHadFullPage = users.length >= FIND_PAGE;
    findLoadMore.hidden = !findLastHadFullPage;
    if (users.length === 0 && resetOffset) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '결과가 없어요.';
      findResults.appendChild(p);
      findLoadMore.hidden = true;
    }
  }

  findSearchBtn.addEventListener('click', () => void runDiscoverySearch(true));
  findSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void runDiscoverySearch(true);
    }
  });
  findLoadMore.addEventListener('click', () => {
    if (!findLastHadFullPage) return;
    findOffset += FIND_PAGE;
    void runDiscoverySearch(false);
  });

  function renderFriends() {
    listFriends.replaceChildren();
    if (!uid) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '로그인 후 친구 기능을 이용할 수 있어요.';
      listFriends.appendChild(p);
      return;
    }
    const list = getFriendList(uid);
    if (list.length === 0) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '아직 친구가 없어요. 찾기 탭에서 요청해 보세요!';
      listFriends.appendChild(p);
      return;
    }
    for (const f of list) {
      listFriends.appendChild(friendCard(f, { showHeart: true }));
    }
  }

  function renderReq() {
    listIncoming.replaceChildren();
    listOutgoing.replaceChildren();
    if (!uid) return;
    const inc = getPendingRequests(uid);
    const out = getSentRequests(uid);
    if (inc.length === 0) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '받은 요청이 없어요.';
      listIncoming.appendChild(p);
    } else {
      for (const r of inc) {
        const box = document.createElement('div');
        box.className = 'friend-req-card app-box';
        const top = document.createElement('div');
        top.className = 'friend-req-top';
        top.textContent = `${r.nickname} · ${duckLabel(r.duckId)}`;
        const btns = document.createElement('div');
        btns.className = 'friend-req-btns';
        const bOk = document.createElement('button');
        bOk.type = 'button';
        bOk.className = 'app-btn app-btn--inline';
        bOk.textContent = '수락';
        bOk.addEventListener('click', () => {
          const ar = acceptRequest(uid, r.requestId);
          if (ar.ok && ar.peerUid && ar.requestId) {
            ensureSocket();
            emitAcceptFriendRequest(ar.peerUid, ar.requestId);
          }
          if (ar.ok) renderFriends();
          renderReq();
        });
        const bNo = document.createElement('button');
        bNo.type = 'button';
        bNo.className = 'app-btn app-btn--inline';
        bNo.textContent = '거절';
        bNo.addEventListener('click', () => {
          rejectRequest(uid, r.requestId);
          renderReq();
        });
        btns.appendChild(bOk);
        btns.appendChild(bNo);
        box.appendChild(top);
        box.appendChild(btns);
        listIncoming.appendChild(box);
      }
    }
    if (out.length === 0) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '보낸 요청이 없어요.';
      listOutgoing.appendChild(p);
    } else {
      for (const r of out) {
        const box = document.createElement('div');
        box.className = 'friend-req-card app-box';
        const top = document.createElement('div');
        top.textContent = `${r.nickname} 에게 요청 중`;
        const bCan = document.createElement('button');
        bCan.type = 'button';
        bCan.className = 'app-btn app-btn--inline';
        bCan.textContent = '취소';
        bCan.addEventListener('click', () => {
          cancelSentRequest(uid, r.requestId);
          renderReq();
        });
        box.appendChild(top);
        box.appendChild(bCan);
        listOutgoing.appendChild(box);
      }
    }
  }

  const onFriendsStorageUpdated = () => {
    renderFriends();
    renderReq();
  };
  window.addEventListener('dallyeori-friends-updated', onFriendsStorageUpdated);
  detachFriendsStorageListener = () =>
    window.removeEventListener('dallyeori-friends-updated', onFriendsStorageUpdated);

  function activateFriendsTab(which) {
    tabFriends.classList.toggle('is-active', which === 'friends');
    tabFind.classList.toggle('is-active', which === 'find');
    tabReq.classList.toggle('is-active', which === 'req');
    panelFriends.hidden = which !== 'friends';
    panelFind.hidden = which !== 'find';
    panelReq.hidden = which !== 'req';
    if (which === 'req') renderReq();
  }

  tabFriends.addEventListener('click', () => activateFriendsTab('friends'));
  tabFind.addEventListener('click', () => activateFriendsTab('find'));
  tabReq.addEventListener('click', () => activateFriendsTab('req'));

  renderFriends();
  renderReq();
  if (uid) {
    queueMicrotask(() => void enrichStaleFriendMeta(uid));
  }
}
