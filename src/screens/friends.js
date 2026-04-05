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
  searchUsers,
  sendRequest,
} from '../services/friends.js';
import {
  canSendHeartToday,
  isMutualHeart,
  markHeartNotificationsSeen,
  sendHeart,
} from '../services/likes.js';

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

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountFriends(root, api) {
  const uid = api.state.user?.uid;
  if (uid) markHeartNotificationsSeen(uid);

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

  const searchWrap = document.createElement('div');
  searchWrap.className = 'friends-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'app-input friends-search';
  searchInput.placeholder = '닉네임 검색';
  searchInput.autocomplete = 'off';
  const searchResults = document.createElement('div');
  searchResults.className = 'friends-search-results app-box';
  searchResults.hidden = true;
  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(searchResults);

  const tabRow = document.createElement('div');
  tabRow.className = 'friends-tabs';
  const tabFriends = document.createElement('button');
  tabFriends.type = 'button';
  tabFriends.className = 'friends-tab is-active';
  tabFriends.textContent = '내 친구';
  const tabReq = document.createElement('button');
  tabReq.type = 'button';
  tabReq.className = 'friends-tab';
  tabReq.textContent = '요청';
  tabRow.appendChild(tabFriends);
  tabRow.appendChild(tabReq);

  const panelFriends = document.createElement('div');
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
  wrap.appendChild(searchWrap);
  wrap.appendChild(tabRow);
  wrap.appendChild(panelFriends);
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
      heartBtn.className = 'app-btn app-btn--inline friend-heart-btn';
      heartBtn.textContent = '♥ 하트 보내기';
      heartBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!canSendHeartToday(uid, f.id)) {
          window.alert('오늘은 이미 하트를 보냈어요.');
          return;
        }
        const r = sendHeart(uid, f.id);
        if (r.ok) playHeartAnim(/** @type {HTMLElement} */ (ev.currentTarget));
        window.alert(r.ok ? '하트를 보냈어요!' : '보낼 수 없어요.');
        renderFriends();
      });
      heartRow.appendChild(heartBtn);
      card.appendChild(heartRow);
    }

    card.addEventListener('click', () => openSheet(f));
    return card;
  }

  function renderSearchResults() {
    if (!uid) {
      searchResults.hidden = true;
      return;
    }
    const found = searchUsers(searchInput.value, uid);
    searchResults.replaceChildren();
    if (!searchInput.value.trim() || found.length === 0) {
      searchResults.hidden = true;
      return;
    }
    searchResults.hidden = false;
    for (const u of found) {
      const rw = document.createElement('div');
      rw.className = 'friends-search-row';
      const meta = document.createElement('span');
      meta.textContent = `${u.nickname} · ${duckLabel(u.duckId)}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-btn app-btn--inline';
      if (isFriend(uid, u.id)) {
        btn.textContent = '친구';
        btn.disabled = true;
      } else {
        btn.textContent = '요청';
        btn.addEventListener('click', () => {
          const r = sendRequest(uid, u.id);
          if (r.ok) window.alert('친구 요청을 보냈어요.');
          else if (r.message) window.alert(r.message);
          else if (r.error === 'pending_out') window.alert('이미 요청 중이에요.');
          else if (r.error === 'pending_in') window.alert('상대가 먼저 요청했다면 요청 탭에서 수락해 주세요.');
          else window.alert('요청할 수 없어요.');
          renderSearchResults();
          renderReq();
        });
      }
      rw.appendChild(meta);
      rw.appendChild(btn);
      searchResults.appendChild(rw);
    }
  }

  searchInput.addEventListener('input', renderSearchResults);

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
      p.textContent = '아직 친구가 없어요. 검색에서 요청해 보세요!';
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
          if (acceptRequest(uid, r.requestId).ok) renderFriends();
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

  tabFriends.addEventListener('click', () => {
    tabFriends.classList.add('is-active');
    tabReq.classList.remove('is-active');
    panelFriends.hidden = false;
    panelReq.hidden = true;
  });
  tabReq.addEventListener('click', () => {
    tabReq.classList.add('is-active');
    tabFriends.classList.remove('is-active');
    panelFriends.hidden = true;
    panelReq.hidden = false;
    renderReq();
  });

  renderFriends();
  renderReq();
}
