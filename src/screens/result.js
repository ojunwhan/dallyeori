/**
 * 경주 결과 — 승패 강조, 스탯, 상대 요약, 재대전·로비
 */

import { DUCKS_NINE } from '../constants.js';
import { sendRequest, isFriend } from '../services/friends.js';
import { rewardForRace, syncHeartBalanceFromServer } from '../services/hearts.js';
import { canSendHeartToday, isMutualHeart, sendHeart } from '../services/likes.js';
import { MOCK_USERS } from '../services/mockUsers.js';
import { decodeJWT, getToken } from '../services/auth.js';
import { recordRaceOutcome } from '../services/profileViewModel.js';
import { emitFriendRequestSent, emitSendRematch, endGuestQrFlow } from '../services/socket.js';
import { showAppToast } from '../services/toast.js';
import {
  getConversation,
  isBlocked,
  markConversationRead,
  sendMessage,
} from '../services/chat.js';

/** @param {string | null | undefined} id */
function duckById(id) {
  if (!id) return null;
  return DUCKS_NINE.find((d) => d.id === id) ?? null;
}

/** @param {object | null | undefined} opp */
function resolveOpponentUserId(opp) {
  if (opp?.userId) return /** @type {string} */ (opp.userId);
  if (!opp?.nickname) return null;
  return MOCK_USERS.find((m) => m.nickname === opp.nickname)?.id ?? null;
}

/** 결과 화면 채팅 오버레이 제거 + popstate 연동용 */
export function closeResultScreenChatUi() {
  const ov = document.getElementById('dallyeori-result-chat-overlay');
  if (ov && typeof ov._dispose === 'function') {
    try {
      ov._dispose();
    } catch {
      /* ignore */
    }
  }
  ov?.remove();
  globalThis.__dallyeoriResultChatUiOpen = false;
}

function syncResultChatUiOpenFlag() {
  globalThis.__dallyeoriResultChatUiOpen = !!document.getElementById(
    'dallyeori-result-chat-overlay',
  );
}

/**
 * @param {string} uid
 * @param {string} peerId
 * @param {string} peerName
 */
function openResultChatComposeOverlay(uid, peerId, peerName) {
  if (!uid || !peerId) return;
  const existing = document.getElementById('dallyeori-result-chat-overlay');
  if (existing && typeof existing._refreshChat === 'function') {
    existing._refreshChat();
    existing.querySelector('.result-chat-overlay-input')?.focus();
    return;
  }

  markConversationRead(uid, peerId);

  const backdrop = document.createElement('div');
  backdrop.id = 'dallyeori-result-chat-overlay';
  backdrop.className = 'result-chat-overlay';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', '메시지');

  const panel = document.createElement('div');
  panel.className = 'result-chat-overlay-panel app-box';

  const head = document.createElement('div');
  head.className = 'result-chat-overlay-head';
  const title = document.createElement('div');
  title.className = 'result-chat-overlay-title';
  title.textContent = peerName.slice(0, 32) || '상대';
  const btnClose = document.createElement('button');
  btnClose.type = 'button';
  btnClose.className = 'result-chat-overlay-close';
  btnClose.textContent = '✕';
  btnClose.setAttribute('aria-label', '닫기');
  head.appendChild(title);
  head.appendChild(btnClose);

  const blockedBanner = document.createElement('div');
  blockedBanner.className = 'chat-blocked-banner';
  blockedBanner.hidden = !isBlocked(uid, peerId);
  blockedBanner.textContent = '차단한 유저입니다. 메시지를 보낼 수 없어요.';

  const scroll = document.createElement('div');
  scroll.id = 'result-chat-messages';
  scroll.className = 'chat-scroll result-chat-overlay-scroll';

  const inputRow = document.createElement('div');
  inputRow.className = 'chat-input-row';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'app-input chat-input result-chat-overlay-input';
  inp.placeholder = '메시지 입력';

  const btnSend = document.createElement('button');
  btnSend.type = 'button';
  btnSend.className = 'app-btn app-btn--primary';
  btnSend.textContent = '전송';

  inputRow.appendChild(inp);
  inputRow.appendChild(btnSend);

  panel.appendChild(head);
  panel.appendChild(blockedBanner);
  panel.appendChild(scroll);
  panel.appendChild(inputRow);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  syncResultChatUiOpenFlag();

  const bubbleBaseStyle =
    'min-width:48px;max-width:80%;width:fit-content;word-break:keep-all;overflow-wrap:break-word;box-sizing:border-box;';

  function scrollBottom() {
    scroll.scrollTop = scroll.scrollHeight;
  }

  function renderMsgs() {
    scroll.replaceChildren();
    const msgs = getConversation(uid, peerId);
    for (const m of msgs) {
      const row = document.createElement('div');
      row.className =
        'chat-msg-row ' + (m.fromId === uid ? 'chat-msg--mine' : 'chat-msg--theirs');
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.style.cssText = bubbleBaseStyle;
      const original = m.originalText != null ? m.originalText : m.text;
      if (m.translatedText) {
        let showingOriginal = false;
        bubble.textContent = m.translatedText;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'chat-bubble-toggle app-muted';
        toggle.textContent = '(원문 보기)';
        toggle.style.cssText =
          'display:block;width:100%;margin-top:4px;padding:0;border:none;background:none;font:inherit;font-size:11px;color:#888;cursor:pointer;text-align:inherit;touch-action:manipulation;';
        toggle.addEventListener('click', (e) => {
          e.preventDefault();
          showingOriginal = !showingOriginal;
          bubble.textContent = showingOriginal ? original : m.translatedText;
          toggle.textContent = showingOriginal ? '(번역 보기)' : '(원문 보기)';
        });
        const w = document.createElement('div');
        w.className = 'chat-msg-bubble-stack';
        w.appendChild(bubble);
        w.appendChild(toggle);
        row.appendChild(w);
      } else {
        bubble.textContent = original;
        row.appendChild(bubble);
      }
      const meta = document.createElement('div');
      meta.className = 'chat-msg-meta';
      meta.textContent = new Date(m.ts).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      row.appendChild(meta);
      scroll.appendChild(row);
    }
    scrollBottom();
  }

  function syncBlockUi() {
    const blocked = isBlocked(uid, peerId);
    blockedBanner.hidden = !blocked;
    inp.disabled = blocked;
    btnSend.disabled = blocked;
  }

  function refreshChat() {
    markConversationRead(uid, peerId);
    renderMsgs();
  }

  function tearDown() {
    window.removeEventListener('dallyeori-chat-update', onChatUpdate);
    if (backdrop.parentNode) backdrop.remove();
    syncResultChatUiOpenFlag();
  }

  /** @param {CustomEvent} ev */
  function onChatUpdate(ev) {
    if (ev.detail?.peerId === peerId) {
      refreshChat();
    }
  }

  backdrop._dispose = tearDown;
  /** 수신 시 동일 오버레이에서 목록만 갱신 (socket __onChatReceived 용) */
  backdrop._refreshChat = refreshChat;
  window.addEventListener('dallyeori-chat-update', /** @type {any} */ (onChatUpdate));

  function trySend() {
    const t = inp.value.trim();
    if (!t || inp.disabled) return;
    btnSend.disabled = true;
    inp.disabled = true;
    try {
      const r = sendMessage(uid, peerId, t);
      if (!r.ok) {
        showAppToast(r.error === 'blocked' ? '차단 상태에서는 보낼 수 없어요.' : '전송 실패');
        return;
      }
      inp.value = '';
      renderMsgs();
    } finally {
      btnSend.disabled = false;
      syncBlockUi();
    }
  }

  btnClose.addEventListener('click', (e) => {
    e.preventDefault();
    tearDown();
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) tearDown();
  });
  btnSend.addEventListener('click', () => trySend());
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') trySend();
  });

  syncBlockUi();
  renderMsgs();
  inp.focus();
}

/** @param {HTMLElement} el */
function playHeartBurst(el) {
  el.classList.remove('heart-burst');
  void el.offsetWidth;
  el.classList.add('heart-burst');
}

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 * @returns {() => void}
 */
export function mountResult(root, api) {
  let dispose = () => {};

  const last = api.state.lastRaceResult;
  const opp = api.state.lastOpponent;
  const isQrGuest = Boolean(api.state.qrGuestOneShot);

  const jwtUidRaw = (() => {
    const t = getToken();
    const p = t ? decodeJWT(t) : null;
    return p && typeof p.uid === 'string' ? String(p.uid) : '';
  })();
  console.log('[result] mountResult', {
    isQrGuest,
    oppUserId: opp?.userId,
    jwtUid: jwtUidRaw || null,
    appUid: api.state.user?.uid ?? null,
  });

  const wrap = document.createElement('div');
  wrap.className = 'app-screen result-screen';

  const outcome = document.createElement('div');
  outcome.className = 'result-outcome';
  outcome.setAttribute('role', 'status');

  const statsBox = document.createElement('div');
  statsBox.className = 'app-box result-stats';

  const oppCard = document.createElement('div');
  oppCard.className = 'app-box result-opponent-card';

  /** @type {HTMLElement | null} */
  let heartRewardEl = null;

  if (last) {
    const res = last.result;
    const resLabel =
      res === 'win' ? '승리' : res === 'lose' ? '패배' : res === 'draw' ? '무승부' : '결과';
    outcome.textContent = resLabel;
    outcome.classList.add(
      res === 'win' ? 'result-outcome--win' : res === 'lose' ? 'result-outcome--lose' : 'result-outcome--draw',
    );

    const my = last.myDistance ?? last.distance;
    const oppD = last.oppDistance ?? last.opponentDistance;
    const myN = Number(my);
    const oppN = Number(oppD);

    const myDuckName = duckById(api.state.selectedDuckId)?.name ?? '오리';
    const theirDuckName = opp?.duckName ?? '상대 오리';

    const timeRow = document.createElement('div');
    timeRow.className = 'result-stat-row';
    const timeLbl = document.createElement('span');
    timeLbl.className = 'result-stat-label';
    timeLbl.textContent = '시간';
    const timeVal = document.createElement('span');
    timeVal.className = 'result-stat-value';
    timeVal.textContent = `${Number(last.time).toFixed(1)}초`;
    timeRow.appendChild(timeLbl);
    timeRow.appendChild(timeVal);

    const tapRow = document.createElement('div');
    tapRow.className = 'result-stat-row';
    const tapLbl = document.createElement('span');
    tapLbl.className = 'result-stat-label';
    tapLbl.textContent = '탭 수';
    const tapVal = document.createElement('span');
    tapVal.className = 'result-stat-value';
    tapVal.textContent = String(last.taps);
    tapRow.appendChild(tapLbl);
    tapRow.appendChild(tapVal);

    const distRow = document.createElement('div');
    distRow.className = 'result-stat-row result-stat-row--dist';
    if (Number.isFinite(myN) && Number.isFinite(oppN)) {
      distRow.textContent = `${myDuckName} ${myN.toFixed(4)}m vs ${theirDuckName} ${oppN.toFixed(4)}m`;
    } else if (Number.isFinite(Number(last.distance))) {
      distRow.textContent = `거리 ${Number(last.distance).toFixed(4)}m`;
    } else {
      distRow.textContent = '거리 —';
    }

    statsBox.appendChild(timeRow);
    statsBox.appendChild(tapRow);
    statsBox.appendChild(distRow);

    const oppLabel = document.createElement('div');
    oppLabel.className = 'result-opponent-label app-muted';
    oppLabel.textContent = '상대';
    oppCard.appendChild(oppLabel);

    const oppNick = document.createElement('div');
    oppNick.className = 'result-opponent-nick';
    oppNick.textContent = opp?.nickname ?? '—';

    const duckRow = document.createElement('div');
    duckRow.className = 'result-opponent-duck';

    const circle = document.createElement('div');
    circle.className = 'duck-circle result-opponent-duck-circle';
    if (opp?.duckColor) {
      circle.style.backgroundColor = opp.duckColor;
      if (opp.duckId === 'duri') circle.classList.add('duck-circle--dark');
      if (opp.duckId === 'ari') circle.classList.add('duck-circle--light');
    } else {
      circle.classList.add('result-opponent-duck-circle--empty');
    }

    const dName = document.createElement('span');
    dName.className = 'result-opponent-duck-name';
    dName.textContent = opp?.duckName ?? '—';

    duckRow.appendChild(circle);
    duckRow.appendChild(dName);
    oppCard.appendChild(oppNick);
    oppCard.appendChild(duckRow);

    const uid = api.state.user?.uid;
    const peerId = resolveOpponentUserId(opp);
    if (!isQrGuest && uid && peerId && isMutualHeart(uid, peerId)) {
      const mb = document.createElement('div');
      mb.className = 'result-mutual-badge';
      mb.textContent = '💕 서로 하트';
      oppCard.appendChild(mb);
    }

    if (res === 'win' || res === 'lose' || res === 'draw') {
      if (!isQrGuest) {
        recordRaceOutcome(api.state, res);
        const uid = api.state.user?.uid;
        const lr = api.state.lastRaceResult;
        const serverBal =
          uid && lr && lr.hearts && typeof lr.hearts === 'object'
            ? lr.hearts[uid]
            : undefined;
        heartRewardEl = document.createElement('div');
        heartRewardEl.className = 'result-heart-reward';
        if (typeof serverBal === 'number' && Number.isFinite(serverBal)) {
          syncHeartBalanceFromServer(api.state, serverBal);
          heartRewardEl.textContent = `보유 ♥ ${serverBal}`;
        } else {
          const n = rewardForRace(api.state, res === 'win');
          heartRewardEl.textContent = `+${n}♥`;
        }
      }
    }
  } else {
    outcome.textContent = '결과 없음';
    outcome.classList.add('result-outcome--draw');
    statsBox.textContent = '표시할 경기 데이터가 없습니다.';
    oppCard.textContent = '상대 정보 없음';
  }

  const actions = document.createElement('div');
  actions.className = 'result-actions';

  if (isQrGuest) {
    const tip = document.createElement('p');
    tip.className = 'app-muted result-qr-guest-tip';
    tip.textContent =
      '앱을 설치하고 로그인하면 친구·메시지·랭킹과 더 많은 경주를 즐길 수 있어요.';

    const btnInstall = document.createElement('button');
    btnInstall.type = 'button';
    btnInstall.className = 'app-btn app-btn--primary';
    btnInstall.textContent = '앱 홈으로';
    btnInstall.addEventListener('click', () => {
      endGuestQrFlow();
      api.state.qrGuestOneShot = false;
      api.state.user = null;
      window.location.reload();
    });

    actions.appendChild(tip);
    actions.appendChild(btnInstall);
  } else {
    const peerId = resolveOpponentUserId(opp);

    const btnRematch = document.createElement('button');
    btnRematch.type = 'button';
    btnRematch.className = 'app-btn app-btn--primary result-btn-rematch';
    btnRematch.textContent = '한판 더';
    if (last && opp?.nickname) {
      btnRematch.addEventListener('click', () => {
        if (peerId) emitSendRematch(peerId);
        api.navigate('rematchWait');
      });
    } else {
      btnRematch.disabled = true;
      btnRematch.title = '재대전할 상대 정보가 없습니다.';
    }
    const uid = api.state.user?.uid;

    const btnFriend = document.createElement('button');
    btnFriend.type = 'button';
    btnFriend.className = 'app-btn result-btn-secondary';
    btnFriend.textContent = '친구 추가';
    btnFriend.addEventListener('click', () => {
      if (!uid) {
        showAppToast('로그인이 필요해요.');
        return;
      }
      if (!peerId) {
        window.alert('상대 정보를 찾을 수 없어요.');
        return;
      }
      if (isFriend(uid, peerId)) {
        window.alert('이미 친구예요.');
        return;
      }
      const r = sendRequest(uid, peerId);
      if (r.ok && r.requestId) emitFriendRequestSent(peerId, r.requestId);
      if (r.ok) window.alert('친구 요청을 보냈어요.');
      else if (r.error === 'pending_out') window.alert('이미 요청 중이에요.');
      else if (r.error === 'pending_in') window.alert('상대가 먼저 요청했어요. 친구 탭에서 수락해 주세요.');
      else window.alert('요청할 수 없어요.');
    });

    const btnHeart = document.createElement('button');
    btnHeart.type = 'button';
    btnHeart.className = 'app-btn result-btn-secondary result-heart-btn';
    btnHeart.textContent = '♥ 하트 보내기';
    btnHeart.addEventListener('click', () => {
      if (!uid) {
        showAppToast('로그인이 필요해요.');
        return;
      }
      if (!peerId) {
        window.alert('상대 정보를 찾을 수 없어요.');
        return;
      }
      if (!canSendHeartToday(uid, peerId)) {
        window.alert('오늘은 이미 하트를 보냈어요.');
        return;
      }
      const r = sendHeart(uid, peerId);
      if (r.ok) playHeartBurst(btnHeart);
      window.alert(r.ok ? '하트를 보냈어요!' : '보낼 수 없어요.');
    });

    const btnMsg = document.createElement('button');
    btnMsg.type = 'button';
    btnMsg.className = 'app-btn result-btn-secondary';
    btnMsg.textContent = '메시지 보내기';

    const uidStr = uid ? String(uid) : jwtUidRaw;
    const peerIdStr = peerId ? String(peerId) : '';

    function isChatFromRaceOpponent(msg) {
      if (!msg || typeof msg !== 'object') return false;
      if (!msg.fromId || !msg.toId) return false;
      const textOk = typeof msg.text === 'string' && msg.text.length > 0;
      if (!textOk) return false;
      const fromOk = String(msg.fromId) === peerIdStr;
      const toOk = String(msg.toId) === uidStr || (jwtUidRaw && String(msg.toId) === jwtUidRaw);
      return fromOk && toOk;
    }

    /** receiveChat → socket.js → __onChatReceived (대화는 chat.js가 먼저 저장) */
    const myUidForChat = uid ? String(uid) : jwtUidRaw;

    if (uidStr && peerIdStr) {
      globalThis.__onChatReceived = (msg) => {
        console.log('[result] __onChatReceived', msg);
        if (!isChatFromRaceOpponent(msg)) return;
        globalThis.__dallyeoriSuppressResultPopstateUntil = Date.now() + 3000;
        const overlay = document.getElementById('dallyeori-result-chat-overlay');
        if (overlay && typeof overlay._refreshChat === 'function') {
          overlay._refreshChat();
          overlay.querySelector('.result-chat-overlay-input')?.focus();
          return;
        }
        if (!myUidForChat) {
          console.warn('[result] chat receive: no uid for overlay');
          return;
        }
        openResultChatComposeOverlay(myUidForChat, peerIdStr, opp?.nickname || '상대');
      };
      console.log('[result] __onChatRegistered', { uidStr, peerIdStr });
    } else {
      console.warn('[result] __onChatReceived not set (uid/peer)', {
        uidStr: uidStr || '(empty)',
        peerIdStr: peerIdStr || '(empty)',
      });
    }

    dispose = () => {
      globalThis.__onChatReceived = null;
      closeResultScreenChatUi();
    };

    btnMsg.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!peerId) {
        window.alert('상대 정보를 찾을 수 없어요.');
        return;
      }
      if (!uid) {
        showAppToast('로그인이 필요해요.');
        return;
      }
      /** history.pushState 없음 — 결과 화면 유지, sendChat 그대로 사용 */
      openResultChatComposeOverlay(String(uid), peerIdStr, opp?.nickname || '상대');
    });

    if (!peerId) {
      btnFriend.disabled = true;
      btnHeart.disabled = true;
      btnMsg.disabled = true;
      btnFriend.title = btnHeart.title = btnMsg.title = '매칭 상대 정보가 없어요.';
    }

    const btnLobby = document.createElement('button');
    btnLobby.type = 'button';
    btnLobby.className = 'app-btn';
    btnLobby.textContent = '로비로';
    btnLobby.addEventListener('click', () => api.navigate('lobby'));

    actions.appendChild(btnRematch);
    actions.appendChild(btnFriend);
    actions.appendChild(btnHeart);
    actions.appendChild(btnMsg);
    actions.appendChild(btnLobby);
  }

  wrap.appendChild(outcome);
  if (heartRewardEl) wrap.appendChild(heartRewardEl);
  wrap.appendChild(statsBox);
  wrap.appendChild(oppCard);
  wrap.appendChild(actions);
  root.appendChild(wrap);
  return dispose;
}
