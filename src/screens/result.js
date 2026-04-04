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
import { endGuestQrFlow } from '../services/socket.js';
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

    function removeResultChatPopup() {
      const el = document.getElementById('dallyeori-result-chat-popup');
      if (el) el.remove();
      window.clearTimeout(/** @type {any} */ (globalThis).__dallyeoriResultPopupHideT);
      globalThis.__dallyeoriResultPopupHideT = 0;
    }

    function showResultChatPopup(msg) {
      const raw = (msg.translatedText || msg.text || '').trim();
      const nick = (opp?.nickname || '상대').slice(0, 24);
      const line =
        raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
      console.log('[result] chat popup', { nick, len: raw.length });
      removeResultChatPopup();
      const pop = document.createElement('div');
      pop.id = 'dallyeori-result-chat-popup';
      pop.className = 'result-chat-popup';
      pop.setAttribute('role', 'button');
      pop.tabIndex = 0;
      pop.textContent = `${nick}: ${line}`;
      pop.addEventListener('click', () => {
        if (!peerIdStr) return;
        removeResultChatPopup();
        api.navigate('chatRoom', { peerId: peerIdStr });
      });
      document.body.appendChild(pop);
      globalThis.__dallyeoriResultPopupHideT = window.setTimeout(() => {
        pop.classList.add('result-chat-popup--out');
        const done = () => {
          pop.removeEventListener('animationend', done);
          pop.remove();
        };
        pop.addEventListener('animationend', done, { once: true });
      }, 3000);
    }

    if (uidStr && peerIdStr) {
      globalThis.__onChatReceived = (msg) => {
        console.log('[result] __onChatReceived', msg);
        if (!isChatFromRaceOpponent(msg)) return;
        showResultChatPopup(msg);
      };
      console.log('[result] __onChatRegistered', { uidStr, peerIdStr });
      dispose = () => {
        globalThis.__onChatReceived = null;
        removeResultChatPopup();
      };
    } else {
      console.warn('[result] __onChatReceived not set (uid/peer)', {
        uidStr: uidStr || '(empty)',
        peerIdStr: peerIdStr || '(empty)',
      });
    }

    btnMsg.addEventListener('click', () => {
      if (!peerId) {
        window.alert('상대 정보를 찾을 수 없어요.');
        return;
      }
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

    actions.appendChild(btnRematch);
    actions.appendChild(btnFriend);
    actions.appendChild(btnLike);
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
