/**
 * 경주 결과 — 승패 강조, 스탯, 상대 요약, 재대전·로비
 */

import { DUCKS_NINE } from '../constants.js';
import { sendRequest, isFriend } from '../services/friends.js';
import { rewardForRace } from '../services/hearts.js';
import { canSendLikeToday, isMutualLike, sendLike } from '../services/likes.js';
import { MOCK_USERS } from '../services/mockUsers.js';
import { decodeJWT, getToken } from '../services/auth.js';
import { recordRaceOutcome } from '../services/profileViewModel.js';
import { endGuestQrFlow, getGameSocket } from '../services/socket.js';
import { showAppToast } from '../services/toast.js';

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

/** @param {HTMLElement} el */
function playLikeBurst(el) {
  el.classList.remove('like-burst');
  void el.offsetWidth;
  el.classList.add('like-burst');
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
    if (!isQrGuest && uid && peerId && isMutualLike(uid, peerId)) {
      const mb = document.createElement('div');
      mb.className = 'result-mutual-badge';
      mb.textContent = '💕 서로 호감';
      oppCard.appendChild(mb);
    }

    if (res === 'win' || res === 'lose' || res === 'draw') {
      if (!isQrGuest) {
        recordRaceOutcome(api.state, res);
        const n = rewardForRace(api.state, res === 'win');
        heartRewardEl = document.createElement('div');
        heartRewardEl.className = 'result-heart-reward';
        heartRewardEl.textContent = `+${n}♥`;
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
    const btnRematch = document.createElement('button');
    btnRematch.type = 'button';
    btnRematch.className = 'app-btn app-btn--primary result-btn-rematch';
    btnRematch.textContent = '한판 더';
    if (last && opp?.nickname) {
      btnRematch.addEventListener('click', () => {
        api.navigate('rematchWait');
      });
    } else {
      btnRematch.disabled = true;
      btnRematch.title = '재대전할 상대 정보가 없습니다.';
    }

    const peerId = resolveOpponentUserId(opp);
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
      if (r.ok) window.alert('친구 요청을 보냈어요.');
      else if (r.error === 'pending_out') window.alert('이미 요청 중이에요.');
      else if (r.error === 'pending_in') window.alert('상대가 먼저 요청했어요. 친구 탭에서 수락해 주세요.');
      else window.alert('요청할 수 없어요.');
    });

    const btnLike = document.createElement('button');
    btnLike.type = 'button';
    btnLike.className = 'app-btn result-btn-secondary result-like-btn';
    btnLike.textContent = '♥ 호감';
    btnLike.addEventListener('click', () => {
      if (!uid) {
        showAppToast('로그인이 필요해요.');
        return;
      }
      if (!peerId) {
        window.alert('상대 정보를 찾을 수 없어요.');
        return;
      }
      if (!canSendLikeToday(uid, peerId)) {
        window.alert('오늘은 이미 호감을 보냈어요.');
        return;
      }
      const r = sendLike(uid, peerId);
      if (r.ok) playLikeBurst(btnLike);
      window.alert(r.ok ? '호감을 보냈어요!' : '보낼 수 없어요.');
    });

    const msgWrap = document.createElement('div');
    msgWrap.className = 'result-msg-btn-wrap';

    const btnMsg = document.createElement('button');
    btnMsg.type = 'button';
    btnMsg.className = 'app-btn result-btn-secondary';
    btnMsg.textContent = '메시지 보내기';

    const msgBadge = document.createElement('span');
    msgBadge.className = 'result-msg-badge';
    msgBadge.setAttribute('aria-hidden', 'true');
    msgBadge.hidden = true;

    const msgPreview = document.createElement('p');
    msgPreview.className = 'result-msg-preview app-muted';
    msgPreview.hidden = true;

    let unreadMsgCount = 0;

    function triggerMsgBtnShake() {
      msgWrap.classList.remove('result-msg-btn-wrap--shake');
      void msgWrap.offsetWidth;
      msgWrap.classList.add('result-msg-btn-wrap--shake');
      window.clearTimeout(/** @type {any} */ (msgWrap)._shakeT);
      msgWrap._shakeT = window.setTimeout(() => {
        msgWrap.classList.remove('result-msg-btn-wrap--shake');
      }, 600);
    }

    function applyMsgNotifyUI() {
      if (unreadMsgCount <= 0) {
        msgBadge.hidden = true;
        msgBadge.textContent = '';
        btnMsg.textContent = '메시지 보내기';
        msgPreview.textContent = '';
        msgPreview.hidden = true;
        return;
      }
      msgBadge.hidden = false;
      msgBadge.textContent = unreadMsgCount > 99 ? '99+' : String(unreadMsgCount);
      btnMsg.textContent = `메시지 보내기 (${unreadMsgCount})`;
    }

    const uidStr = uid ? String(uid) : jwtUidRaw;
    const peerIdStr = peerId ? String(peerId) : '';

    function isChatFromRaceOpponent(msg) {
      if (!msg || typeof msg !== 'object') return false;
      if (!msg.fromId || !msg.toId) return false;
      const textOk = typeof msg.text === 'string' && msg.text.length > 0;
      if (!textOk) {
        console.log('[result] receiveChat skip: no text', msg);
        return false;
      }
      const fromOk = String(msg.fromId) === peerIdStr;
      const toOk = String(msg.toId) === uidStr || (jwtUidRaw && String(msg.toId) === jwtUidRaw);
      if (!fromOk || !toOk) {
        console.log('[result] receiveChat peer/uid mismatch', {
          fromId: msg.fromId,
          toId: msg.toId,
          expectFrom: peerIdStr,
          expectTo: uidStr,
          jwtUid: jwtUidRaw || null,
        });
        return false;
      }
      return true;
    }

    function applyIncomingChatNotify(msg) {
      const raw = (msg.translatedText || msg.text || '').trim();
      const short = raw.length > 52 ? `${raw.slice(0, 49)}…` : raw;
      unreadMsgCount += 1;
      console.log('[result] notify applied, unread=', unreadMsgCount);
      applyMsgNotifyUI();
      if (short) {
        const nick = (opp?.nickname || '상대').slice(0, 16);
        msgPreview.textContent = `${nick}: ${short}`;
        msgPreview.hidden = false;
      }
      triggerMsgBtnShake();
      const toastNick = (opp?.nickname || '상대').slice(0, 12);
      showAppToast(short ? `${toastNick}: ${short}` : `${toastNick}: 새 메시지`);
    }

    const onReceiveChatWindow = (ev) => {
      const msg = /** @type {CustomEvent} */ (ev).detail;
      console.log('[result] dallyeori-receiveChat event', msg);
      if (!isChatFromRaceOpponent(msg)) return;
      applyIncomingChatNotify(msg);
    };

    const onReceiveChatSocket = (msg) => {
      console.log('[result] socket receiveChat', msg);
      if (!isChatFromRaceOpponent(msg)) return;
      applyIncomingChatNotify(msg);
    };

    if (uidStr && peerIdStr) {
      const sock = getGameSocket();
      if (sock) {
        sock.on('receiveChat', onReceiveChatSocket);
        console.log('[result] receiveChat: socket listener', { uidStr, peerIdStr });
      } else {
        window.addEventListener('dallyeori-receiveChat', onReceiveChatWindow);
        console.warn('[result] receiveChat: window fallback (no game socket)', { uidStr, peerIdStr });
      }
      dispose = () => {
        window.removeEventListener('dallyeori-receiveChat', onReceiveChatWindow);
        const s = getGameSocket();
        if (s) s.off('receiveChat', onReceiveChatSocket);
        window.clearTimeout(/** @type {any} */ (msgWrap)._shakeT);
      };
    } else {
      console.warn('[result] receiveChat listeners NOT registered', {
        uidStr: uidStr || '(empty)',
        peerIdStr: peerIdStr || '(empty)',
      });
    }

    btnMsg.addEventListener('click', () => {
      if (!peerId) {
        window.alert('상대 정보를 찾을 수 없어요.');
        return;
      }
      unreadMsgCount = 0;
      applyMsgNotifyUI();
      api.navigate('chatRoom', { peerId });
    });

    if (!peerId) {
      btnFriend.disabled = true;
      btnLike.disabled = true;
      btnMsg.disabled = true;
      btnFriend.title = btnLike.title = btnMsg.title = '매칭 상대 정보가 없어요.';
    }

    const btnLobby = document.createElement('button');
    btnLobby.type = 'button';
    btnLobby.className = 'app-btn';
    btnLobby.textContent = '로비로';
    btnLobby.addEventListener('click', () => api.navigate('lobby'));

    msgWrap.appendChild(btnMsg);
    msgWrap.appendChild(msgBadge);

    actions.appendChild(btnRematch);
    actions.appendChild(btnFriend);
    actions.appendChild(btnLike);
    actions.appendChild(msgWrap);
    actions.appendChild(msgPreview);
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
