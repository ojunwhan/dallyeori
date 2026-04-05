/**
 * QR 대전 호스트 — 방 생성, QR 표시, 링크 복사/공유, 남은 시간, 상대 입장 시 경주
 */

import QRCode from 'qrcode';
import { createQrMatchRoom } from '../services/qrMatchApi.js';
import { ensureSocket, getGameSocket } from '../services/socket.js';
import { getBalance } from '../services/hearts.js';
import { showAppToast } from '../services/toast.js';

const QR_TIMEOUT_SEC = 180; // 서버 QR_PENDING_MS 와 동기화 (3분)

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountQrMatchHost(root, api) {
  const wrap = document.createElement('div');
  wrap.className = 'app-screen qr-match-screen';

  /* ── 타이틀 ── */
  const title = document.createElement('div');
  title.className = 'app-title qr-match-title';
  title.textContent = 'QR / 링크 대전';

  const hint = document.createElement('p');
  hint.className = 'app-muted qr-match-hint';
  hint.textContent = 'QR을 보여주거나, 링크를 보내세요. 상대가 열면 바로 경주!';

  /* ── QR 이미지 ── */
  const qrWrap = document.createElement('div');
  qrWrap.className = 'qr-match-qr-wrap';

  const img = document.createElement('img');
  img.className = 'qr-match-img';
  img.alt = 'QR 코드';

  qrWrap.appendChild(img);

  /* ── 남은 시간 ── */
  const timerEl = document.createElement('div');
  timerEl.className = 'qr-match-timer app-muted';

  /* ── 상태 텍스트 ── */
  const status = document.createElement('p');
  status.className = 'qr-match-status';
  status.textContent = '준비 중…';

  /* ── 링크 복사 버튼 ── */
  const btnCopy = document.createElement('button');
  btnCopy.type = 'button';
  btnCopy.className = 'app-btn app-btn--primary qr-match-copy-btn';
  btnCopy.textContent = '링크 복사';
  btnCopy.disabled = true;

  /* ── 공유 버튼 (Web Share API) ── */
  const btnShare = document.createElement('button');
  btnShare.type = 'button';
  btnShare.className = 'app-btn qr-match-share-btn';
  btnShare.textContent = '카톡 · 메시지로 공유';
  btnShare.disabled = true;
  if (!navigator.share) btnShare.hidden = true;

  /* ── 취소 ── */
  const btnCancel = document.createElement('button');
  btnCancel.type = 'button';
  btnCancel.className = 'app-btn qr-match-cancel-btn';
  btnCancel.textContent = '취소';

  /* ── 소켓 확인 ── */
  let disposed = false;
  const s = ensureSocket();
  if (!s) {
    status.textContent = '로그인이 필요해요.';
    wrap.append(title, status);
    root.appendChild(wrap);
    return;
  }
  const sock = getGameSocket();
  if (!sock) {
    status.textContent = '소켓을 연결할 수 없어요.';
    wrap.append(title, status);
    root.appendChild(wrap);
    return;
  }

  /* ── 타이머 ── */
  let remainSec = QR_TIMEOUT_SEC;
  let timerInterval = null;

  function updateTimer() {
    const m = Math.floor(remainSec / 60);
    const sec = remainSec % 60;
    timerEl.textContent = `남은 시간  ${m}:${String(sec).padStart(2, '0')}`;
    if (remainSec <= 30) timerEl.classList.add('qr-match-timer--warn');
    else timerEl.classList.remove('qr-match-timer--warn');
  }

  function startTimer() {
    updateTimer();
    timerInterval = setInterval(() => {
      remainSec -= 1;
      if (remainSec <= 0) {
        remainSec = 0;
        if (timerInterval) clearInterval(timerInterval);
      }
      updateTimer();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  /* ── QR URL 저장 ── */
  let qrUrl = '';

  /* ── 소켓 이벤트 ── */
  const onFound = (data) => {
    if (disposed) return;
    stopTimer();
    const opp = data.opponent || {};
    const mp = globalThis.__dallyeoriMatchProfile || {};
    const myDuck = data.myDuckId || mp.duckId || 'bori';
    globalThis.__dallyeoriTerrain = data.terrain || api.state.terrain || 'normal';
    globalThis.__dallyeoriPendingRace = {
      socket: sock,
      roomId: data.roomId,
      slot: data.slot,
      terrain: data.terrain,
      myDuckId: myDuck,
      oppDuckId: opp.duckId || 'bori',
      oppDuckName: opp.duckName || '',
    };
    api.state.terrain = data.terrain || api.state.terrain || 'normal';
    api.state.lastOpponent = {
      userId: opp.userId,
      nickname: opp.nickname,
      profilePhotoURL: opp.profilePhotoURL ?? '',
      duckId: opp.duckId,
      duckName: opp.duckName,
      duckColor: opp.duckColor,
      wins: opp.wins ?? 0,
      losses: opp.losses ?? 0,
      draws: opp.draws ?? 0,
    };
    disposed = true;
    sock.off('matchFound', onFound);
    sock.off('qrMatchExpired', onExpired);
    window.removeEventListener('dallyeori-match-error', onMatchErrorHost);
    api.navigate('race');
  };

  const onExpired = () => {
    if (disposed) return;
    stopTimer();
    showAppToast('대기 시간이 지났어요. 다시 시도해 주세요.');
    disposed = true;
    sock.off('matchFound', onFound);
    sock.off('qrMatchExpired', onExpired);
    window.removeEventListener('dallyeori-match-error', onMatchErrorHost);
    api.navigate('lobby');
  };

  sock.on('matchFound', onFound);
  sock.on('qrMatchExpired', onExpired);

  const onMatchErrorHost = (ev) => {
    const d = ev.detail;
    if (disposed) return;
    if (!d || d.reason !== 'noHearts') return;
    disposed = true;
    stopTimer();
    try {
      pendingConnectCleanup?.();
    } catch {
      /* ignore */
    }
    pendingConnectCleanup = null;
    sock.off('matchFound', onFound);
    sock.off('qrMatchExpired', onExpired);
    window.removeEventListener('dallyeori-match-error', onMatchErrorHost);
    sock.emit('qrMatchCancel');
    window.alert(
      '하트가 부족합니다! 광고를 보거나 친구에게 하트를 요청하세요',
    );
    api.navigate('lobby');
  };
  window.addEventListener('dallyeori-match-error', onMatchErrorHost);

  /** 소켓 연결 대기 중 취소·타임아웃 시 정리 */
  let pendingConnectCleanup = null;

  function waitForSocketConnected() {
    return new Promise((resolve, reject) => {
      if (disposed) {
        reject(new Error('disposed'));
        return;
      }
      if (sock.connected) {
        resolve();
        return;
      }
      status.textContent = '서버 연결 중…';
      const to = setTimeout(() => {
        sock.off('connect', onConnect);
        pendingConnectCleanup = null;
        reject(new Error('SOCKET_CONNECT_TIMEOUT'));
      }, 20_000);
      function onConnect() {
        clearTimeout(to);
        sock.off('connect', onConnect);
        pendingConnectCleanup = null;
        if (disposed) {
          reject(new Error('disposed'));
          return;
        }
        resolve();
      }
      pendingConnectCleanup = () => {
        clearTimeout(to);
        sock.off('connect', onConnect);
        pendingConnectCleanup = null;
        reject(new Error('disposed'));
      };
      sock.once('connect', onConnect);
    });
  }

  /* ── 버튼 핸들러 ── */
  btnCopy.addEventListener('click', async () => {
    if (!qrUrl) return;
    try {
      await navigator.clipboard.writeText(qrUrl);
      showAppToast('링크가 복사됐어요!');
      btnCopy.textContent = '복사 완료 ✓';
      setTimeout(() => {
        btnCopy.textContent = '링크 복사';
      }, 2000);
    } catch {
      prompt('이 링크를 복사하세요:', qrUrl);
    }
  });

  btnShare.addEventListener('click', async () => {
    if (!qrUrl) return;
    try {
      await navigator.share({
        title: '달려오리 — 같이 경주하자!',
        text: '지금 바로 오리 경주 한 판?',
        url: qrUrl,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      showAppToast('공유에 실패했어요.');
    }
  });

  btnCancel.addEventListener('click', () => {
    if (disposed) return;
    disposed = true;
    try {
      pendingConnectCleanup?.();
    } catch {
      /* ignore */
    }
    pendingConnectCleanup = null;
    stopTimer();
    sock.off('matchFound', onFound);
    sock.off('qrMatchExpired', onExpired);
    window.removeEventListener('dallyeori-match-error', onMatchErrorHost);
    sock.emit('qrMatchCancel');
    api.navigate('lobby');
  });

  /* ── 소켓 연결 확인 → 하트 차감 → API → QR ── */
  (async () => {
    try {
      await waitForSocketConnected();
      if (disposed) return;

      const terrain = api.state.terrain || 'normal';
      if (getBalance(api.state) < 1) {
        showAppToast('하트가 부족해요.');
        disposed = true;
        sock.off('matchFound', onFound);
        sock.off('qrMatchExpired', onExpired);
        window.removeEventListener('dallyeori-match-error', onMatchErrorHost);
        api.navigate('lobby');
        return;
      }

      const j = await createQrMatchRoom({
        terrain,
        nickname: api.state.nickname,
        photoURL: api.state.profilePhotoURL,
        duckId: api.state.selectedDuckId,
        wins: api.state.wins,
        losses: api.state.losses,
        draws: api.state.draws,
      });
      if (disposed) return;

      qrUrl = j.qrUrl;

      const dataUrl = await QRCode.toDataURL(qrUrl, {
        margin: 2,
        width: 240,
        color: { dark: '#ffffffFF', light: '#000000FF' },
      });
      img.src = dataUrl;

      btnCopy.disabled = false;
      btnShare.disabled = false;

      status.textContent = '상대를 기다리는 중…';
      startTimer();
    } catch (e) {
      console.error('[qrMatchHost]', e);
      if (e instanceof Error && e.message === 'disposed') return;
      if (e instanceof Error && e.message === 'SOCKET_CONNECT_TIMEOUT') {
        showAppToast('게임 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
      } else {
        showAppToast('QR 방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
      disposed = true;
      sock.off('matchFound', onFound);
      sock.off('qrMatchExpired', onExpired);
      window.removeEventListener('dallyeori-match-error', onMatchErrorHost);
      api.navigate('lobby');
    }
  })();

  /* ── DOM 조립 ── */
  wrap.appendChild(title);
  wrap.appendChild(hint);
  wrap.appendChild(qrWrap);
  wrap.appendChild(timerEl);
  wrap.appendChild(status);
  wrap.appendChild(btnCopy);
  if (!btnShare.hidden) wrap.appendChild(btnShare);
  wrap.appendChild(btnCancel);
  root.appendChild(wrap);
}
