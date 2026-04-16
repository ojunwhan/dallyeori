/**
 * 친구 — 목록·요청·검색·액션 시트 (Phase 4)
 */

import { DUCKS_NINE } from '../constants.js';
import { giftToFriend } from '../services/hearts.js';
import {
  acceptFriendRequest,
  acceptRequest,
  cancelSentRequest,
  formatFriendRejectLine,
  getFriendList,
  getFriendRejectNotifications,
  getPendingRequests,
  getSentRequests,
  isFriend,
  markFriendRejectNotifsSeen,
  rejectFriendRequest,
  rejectIncomingRequestLocalOnly,
  rejectRequest,
  removeFriend,
  sendRequest,
  enrichStaleFriendMeta,
} from '../services/friends.js';
import { emitFriendRequestSent, emitSendBattleRequest, ensureSocket } from '../services/socket.js';
import { showAppToast } from '../services/toast.js';
import { isMutualHeart, markHeartNotificationsSeen, sendHeart } from '../services/likes.js';
import {
  searchUsersDiscoveryV1,
  postFriendRequestV1,
  fetchRecentOpponentsV1,
} from '../services/profileApi.js';
import {
  getLanguageByCode,
  getCountryDisplayFromAlpha2,
  getUniqueCountryFilterOptions,
} from '../data/languagesFull.js';
import { resolveMediaUrl } from '../services/auth.js';
import { openAvatarLightbox } from '../components/avatarLightbox.js';

/** @type {(() => void) | null} */
let detachFriendsStorageListener = null;

/** @param {string | null | undefined} duckId */
function duckLabel(duckId) {
  if (!duckId) return '—';
  return DUCKS_NINE.find((d) => d.id === duckId)?.name ?? duckId;
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
  /** @type {{ targetUid: string, tid: ReturnType<typeof setTimeout> } | null} */
  let battleSendPending = null;
  function resetBattleSendPending() {
    if (battleSendPending?.tid) clearTimeout(battleSendPending.tid);
    const t = battleSendPending?.targetUid;
    battleSendPending = null;
    if (t) {
      for (const b of document.querySelectorAll(`button[data-battle-pending-for="${CSS.escape(t)}"]`)) {
        b.disabled = false;
        b.textContent = '대전 신청';
        b.removeAttribute('data-battle-pending-for');
      }
    }
  }
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

  const findFilters = document.createElement('div');
  findFilters.className = 'friends-find-filters';
  const countrySel = document.createElement('select');
  countrySel.className = 'app-input friends-find-select';
  countrySel.setAttribute('aria-label', '국가 필터');
  const optAllCountry = document.createElement('option');
  optAllCountry.value = '';
  optAllCountry.textContent = '🌐 All Countries';
  countrySel.appendChild(optAllCountry);
  for (const c of getUniqueCountryFilterOptions()) {
    const o = document.createElement('option');
    o.value = c.countryCode;
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

  panelFind.appendChild(findFilters);
  panelFind.appendChild(findResults);
  panelFind.appendChild(findLoadMore);

  const panelReq = document.createElement('div');
  panelReq.hidden = true;

  const friendsNickSearchWrap = document.createElement('div');
  friendsNickSearchWrap.className = 'friends-nick-search-wrap';
  const nickSearchInput = document.createElement('input');
  nickSearchInput.type = 'search';
  nickSearchInput.className = 'app-input friends-nick-search-input';
  nickSearchInput.placeholder = '닉네임 검색 (내 친구 + 전체)';
  nickSearchInput.setAttribute('aria-label', '닉네임 검색');
  nickSearchInput.autocomplete = 'off';
  friendsNickSearchWrap.appendChild(nickSearchInput);

  const friendsNickRemoteTitle = document.createElement('h3');
  friendsNickRemoteTitle.className = 'friends-subtitle friends-nick-remote-title';
  friendsNickRemoteTitle.textContent = '검색된 유저';
  friendsNickRemoteTitle.hidden = true;
  const friendsNickRemoteList = document.createElement('div');
  friendsNickRemoteList.className = 'friends-list friends-nick-remote-list';
  friendsNickRemoteList.hidden = true;

  const listFriends = document.createElement('div');
  listFriends.className = 'friends-list';
  panelFriends.appendChild(friendsNickSearchWrap);
  panelFriends.appendChild(listFriends);
  panelFriends.appendChild(friendsNickRemoteTitle);
  panelFriends.appendChild(friendsNickRemoteList);

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

  const reqRecentSection = document.createElement('div');
  reqRecentSection.className = 'friends-recent-section';
  reqRecentSection.hidden = true;
  const reqRecentTitle = document.createElement('h3');
  reqRecentTitle.className = 'friends-subtitle';
  reqRecentTitle.textContent = '최근 게임 상대';
  const reqRecentList = document.createElement('div');
  reqRecentList.className = 'friends-recent-list';
  reqRecentSection.appendChild(reqRecentTitle);
  reqRecentSection.appendChild(reqRecentList);
  panelReq.appendChild(reqRecentSection);

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

  function openSheet(
    /** @type {{ id: string, nickname: string, duckId: string, online?: boolean }} */ friend,
  ) {
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
    const battleBtn = document.createElement('button');
    battleBtn.type = 'button';
    battleBtn.className = 'app-btn';
    battleBtn.style.marginTop = '8px';
    battleBtn.textContent = '대전 신청';
    if (battleSendPending?.targetUid === friend.id) {
      battleBtn.disabled = true;
      battleBtn.textContent = '신청 중...';
      battleBtn.setAttribute('data-battle-pending-for', friend.id);
    }
    battleBtn.addEventListener('click', () => {
      if (battleSendPending && battleSendPending.targetUid !== friend.id) {
        showAppToast('이미 다른 친구에게 신청 중이에요');
        return;
      }
      if (!friend.online) {
        showAppToast('상대가 오프라인이에요');
        return;
      }
      if (!ensureSocket()) return;
      if (battleSendPending?.tid) clearTimeout(battleSendPending.tid);
      emitSendBattleRequest(friend.id);
      battleBtn.disabled = true;
      battleBtn.textContent = '신청 중...';
      battleBtn.setAttribute('data-battle-pending-for', friend.id);
      battleSendPending = {
        targetUid: friend.id,
        tid: window.setTimeout(() => {
          if (battleSendPending?.targetUid !== friend.id) return;
          showAppToast('응답이 없어요');
          const sk = ensureSocket();
          if (sk?.connected) {
            try {
              sk.emit('cancelBattleRequest', { targetUid: friend.id });
            } catch {
              /* ignore */
            }
          }
          resetBattleSendPending();
        }, 15_000),
      };
    });
    sheetInner.appendChild(battleBtn);
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
    const friendPhoto = typeof f.photoURL === 'string' ? f.photoURL.trim() : '';
    if (friendPhoto) {
      av.className = 'friend-avatar-ph friend-avatar-ph--photo';
      const img = document.createElement('img');
      img.className = 'friend-avatar-img';
      img.src = resolveMediaUrl(friendPhoto);
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.draggable = false;
      img.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openAvatarLightbox(friendPhoto, { displayName: f.nickname });
      });
      av.appendChild(img);
    } else {
      av.className = 'friend-avatar-ph';
      av.textContent = f.nickname.slice(0, 1);
    }

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

  let findNextOffset = 0;
  const FIND_PAGE = 10;
  let findSeq = 0;
  /** @type {boolean} */
  let findLastHadFullPage = false;

  /** @param {boolean} visible */
  function setFindLoadMoreVisible(visible) {
    findLoadMore.hidden = !visible;
  }

  function hasDiscoveryFilter() {
    const cc = String(countrySel.value || '')
      .trim()
      .toUpperCase();
    const hasCountry = cc.length === 2 && /^[A-Z]{2}$/.test(cc);
    const g = String(genderSel.value || '')
      .trim()
      .toUpperCase();
    return hasCountry || g === 'M' || g === 'F';
  }

  /** 필터 미선택일 때만 — 검색 결과(카드)가 있을 때는 호출하지 않음 */
  function showFindNoFilterHint() {
    findNextOffset = 0;
    findLastHadFullPage = false;
    setFindLoadMoreVisible(false);
    findResults.replaceChildren();
    const hint = document.createElement('p');
    hint.className = 'app-muted friends-find-hint-welcome';
    hint.textContent = '국가 또는 성별을 선택하면 자동으로 검색돼요.';
    findResults.appendChild(hint);
  }

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
   * @param {(() => void) | undefined} afterRequest 친구 신청 성공 후 콜백(미지정 시 찾기 탭 검색 새로고침)
   */
  function renderFindUserCard(u, afterRequest) {
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
        if (typeof afterRequest === 'function') {
          afterRequest();
        } else {
          void runDiscoverySearch(true);
          renderReq();
        }
      });
    }

    row.appendChild(btn);
    card.appendChild(row);
    return card;
  }

  /** @type {ReturnType<typeof setTimeout> | null} */
  let nickSearchDebounce = null;

  function getFriendsNickSearchQuery() {
    return String(nickSearchInput.value || '').trim();
  }

  async function runFriendsNicknameSearch() {
    friendsNickRemoteList.replaceChildren();
    if (!uid) {
      friendsNickRemoteTitle.hidden = true;
      friendsNickRemoteList.hidden = true;
      return;
    }
    const q = getFriendsNickSearchQuery();
    if (!q) {
      friendsNickRemoteTitle.hidden = true;
      friendsNickRemoteList.hidden = true;
      return;
    }
    friendsNickRemoteTitle.hidden = false;
    friendsNickRemoteList.hidden = false;
    const loading = document.createElement('p');
    loading.className = 'app-muted';
    loading.textContent = '검색 중…';
    friendsNickRemoteList.appendChild(loading);
    const { ok, users } = await searchUsersDiscoveryV1({
      q,
      offset: 0,
      limit: 20,
    });
    friendsNickRemoteList.replaceChildren();
    if (!ok) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '검색에 실패했어요.';
      friendsNickRemoteList.appendChild(p);
      return;
    }
    if (users.length === 0) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '일치하는 유저가 없어요.';
      friendsNickRemoteList.appendChild(p);
      return;
    }
    const afterNickRequest = () => {
      renderFriends();
      void runFriendsNicknameSearch();
      renderReq();
    };
    for (const u of users) {
      friendsNickRemoteList.appendChild(renderFindUserCard(/** @type {any} */ (u), afterNickRequest));
    }
  }

  nickSearchInput.addEventListener('input', () => {
    renderFriends();
    if (nickSearchDebounce != null) clearTimeout(nickSearchDebounce);
    nickSearchDebounce = setTimeout(() => {
      nickSearchDebounce = null;
      void runFriendsNicknameSearch();
    }, 380);
  });

  /**
   * @param {{ uid: string, nickname: string, language: string, countryCode: string, gender: string | null, isOnline: boolean, isFriend: boolean, isRequested: boolean }} u
   */
  function renderRecentOpponentCard(u) {
    const card = document.createElement('div');
    card.className = 'friends-find-card app-box friends-recent-card';

    const rowTop = document.createElement('div');
    rowTop.className = 'friends-recent-card-top';
    const langEntry = getLanguageByCode(u.language || 'ko');
    const flag = langEntry?.flag ? `${langEntry.flag} ` : '';
    const nick = document.createElement('div');
    nick.className = 'friends-find-card-nick';
    nick.textContent = `${flag}${u.nickname || u.uid}`;
    rowTop.appendChild(nick);
    if (u.isOnline) {
      const dot = document.createElement('span');
      dot.className = 'friend-online-dot';
      dot.title = '온라인';
      rowTop.appendChild(dot);
    }
    card.appendChild(rowTop);

    const row = document.createElement('div');
    row.className = 'friends-find-card-actions';
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
        void refreshRecentOpponents();
        renderReq();
      });
    }
    row.appendChild(btn);
    card.appendChild(row);
    return card;
  }

  async function refreshRecentOpponents() {
    reqRecentList.replaceChildren();
    if (!uid) {
      reqRecentSection.hidden = true;
      return;
    }
    const { ok, users } = await fetchRecentOpponentsV1();
    if (!ok || users.length === 0) {
      reqRecentSection.hidden = true;
      return;
    }
    reqRecentSection.hidden = false;
    for (const u of users) {
      reqRecentList.appendChild(renderRecentOpponentCard(/** @type {any} */ (u)));
    }
  }

  async function runDiscoverySearch(/** @type {boolean} */ resetList) {
    if (!uid) {
      findResults.replaceChildren();
      setFindLoadMoreVisible(false);
      return;
    }
    if (!hasDiscoveryFilter()) {
      showFindNoFilterHint();
      return;
    }

    const seq = (findSeq += 1);
    if (resetList) {
      findNextOffset = 0;
      findResults.replaceChildren();
      setFindLoadMoreVisible(false);
      const loading = document.createElement('p');
      loading.className = 'app-muted';
      loading.textContent = '검색 중…';
      findResults.appendChild(loading);
    }
    const requestOffset = findNextOffset;
    const { ok, users } = await searchUsersDiscoveryV1({
      countryCode: countrySel.value.toUpperCase(),
      gender: genderSel.value,
      offset: requestOffset,
      limit: FIND_PAGE,
    });
    if (seq !== findSeq) return;
    if (resetList) findResults.replaceChildren();
    if (!ok) {
      findNextOffset = requestOffset;
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '검색에 실패했어요.';
      findResults.appendChild(p);
      findLastHadFullPage = false;
      setFindLoadMoreVisible(false);
      return;
    }
    for (const u of users) {
      findResults.appendChild(renderFindUserCard(u));
    }
    if (users.length > 0) {
      findNextOffset = requestOffset + users.length;
    } else if (!resetList) {
      findNextOffset = requestOffset;
    }
    findLastHadFullPage = users.length >= FIND_PAGE;
    if (users.length === 0 && resetList) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '결과가 없어요.';
      findResults.appendChild(p);
    }
    setFindLoadMoreVisible(users.length >= FIND_PAGE);
  }

  function onFindFiltersChanged() {
    void runDiscoverySearch(true);
  }
  countrySel.addEventListener('change', onFindFiltersChanged);
  genderSel.addEventListener('change', onFindFiltersChanged);
  findLoadMore.addEventListener('click', () => {
    if (!findLastHadFullPage || !hasDiscoveryFilter()) return;
    void runDiscoverySearch(false);
  });

  function renderFriends() {
    listFriends.replaceChildren();
    if (!uid) {
      friendsNickSearchWrap.hidden = true;
      friendsNickRemoteTitle.hidden = true;
      friendsNickRemoteList.hidden = true;
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '로그인 후 친구 기능을 이용할 수 있어요.';
      listFriends.appendChild(p);
      return;
    }
    friendsNickSearchWrap.hidden = false;
    const qRaw = getFriendsNickSearchQuery();
    const q = qRaw.toLowerCase();
    const list = getFriendList(uid).filter((f) => {
      if (!q) return true;
      const n = (f.nickname || '').toLowerCase();
      return n.includes(q);
    });
    if (list.length === 0) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = qRaw
        ? '닉네임에 맞는 친구가 없어요. 아래에서 다른 유저를 찾아 보세요.'
        : '아직 친구가 없어요. 찾기 탭에서 요청해 보세요!';
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
    if (!uid) {
      reqRecentSection.hidden = true;
      reqRecentList.replaceChildren();
      return;
    }
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
          void (async () => {
            ensureSocket();
            const ok = await acceptFriendRequest(r.requestId, r.fromId);
            if (!ok) {
              showAppToast('서버에 수락을 반영하지 못했어요. 네트워크를 확인해 주세요.');
              renderReq();
              return;
            }
            const ar = acceptRequest(uid, r.requestId);
            if (!ar.ok) showAppToast('로컬 목록 갱신에 실패했어요.');
            if (ar.ok) renderFriends();
            renderReq();
          })();
        });
        const bNo = document.createElement('button');
        bNo.type = 'button';
        bNo.className = 'app-btn app-btn--inline';
        bNo.textContent = '거절';
        bNo.addEventListener('click', () => {
          void (async () => {
            ensureSocket();
            const ok = await rejectFriendRequest(r.requestId);
            if (ok) rejectIncomingRequestLocalOnly(uid, r.requestId);
            else rejectRequest(uid, r.requestId);
            renderReq();
          })();
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
    void refreshRecentOpponents();
  }

  const onFriendsStorageUpdated = () => {
    renderFriends();
    renderReq();
  };
  /** @param {Event} ev */
  const onFriendBattleClear = (ev) => {
    const ce = /** @type {CustomEvent} */ (ev);
    const d = ce.detail && typeof ce.detail === 'object' ? ce.detail : {};
    const reason = typeof d.reason === 'string' ? d.reason : '';
    const peerUid = typeof d.peerUid === 'string' ? d.peerUid : '';
    const targetUid = typeof d.targetUid === 'string' ? d.targetUid : '';
    if (!battleSendPending) return;
    if (reason === 'accepted') {
      resetBattleSendPending();
      return;
    }
    if (reason === 'declined' && peerUid && battleSendPending.targetUid === peerUid) {
      resetBattleSendPending();
      return;
    }
    if (targetUid && battleSendPending.targetUid === targetUid) resetBattleSendPending();
  };
  window.addEventListener('dallyeori-friends-updated', onFriendsStorageUpdated);
  window.addEventListener('dallyeori-friend-battle-clear', onFriendBattleClear);
  detachFriendsStorageListener = () => {
    window.removeEventListener('dallyeori-friends-updated', onFriendsStorageUpdated);
    window.removeEventListener('dallyeori-friend-battle-clear', onFriendBattleClear);
    resetBattleSendPending();
  };

  function activateFriendsTab(which) {
    tabFriends.classList.toggle('is-active', which === 'friends');
    tabFind.classList.toggle('is-active', which === 'find');
    tabReq.classList.toggle('is-active', which === 'req');
    panelFriends.hidden = which !== 'friends';
    panelFind.hidden = which !== 'find';
    panelReq.hidden = which !== 'req';
    if (which === 'find') {
      if (hasDiscoveryFilter()) void runDiscoverySearch(true);
      else showFindNoFilterHint();
    }
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
