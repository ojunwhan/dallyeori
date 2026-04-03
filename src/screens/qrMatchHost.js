/**
 * QR 대전 호스트 — 방 생성, QR 표시, 상대 입장 시 경주로 이동
 */

import QRCode from 'qrcode';
import { createQrMatchRoom } from '../services/qrMatchApi.js';
import { ensureSocket, getGameSocket } from '../services/socket.js';
import { earn, spend } from '../services/hearts.js';
import { showAppToast } from '../services/toast.js';

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountQrMatchHost(root, api) {
  const wrap = document.createElement('div');
  wrap.className = 'app-screen qr-match-screen';

  const title = document.createElement('div');
  title.className = 'app-screen-title';
  title.textContent = 'QR 대전';

  const hint = document.createElement('p');
  hint.className = 'app-muted qr-match-hint';
  hint.textContent = '상대가 QR을 스캔하면 바로 경주가 시작돼요.';

  const qrWrap = document.createElement('div');
  qrWrap.className = 'qr-match-qr-wrap';

  const img = document.createElement('img');
  img.className = 'qr-match-img';
  img.alt = 'QR 코드';

  const status = document.createElement('p');
  status.className = 'qr-match-status';
  status.textContent = '준비 중…';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'app-btn';
  cancel.textContent = '취소';

  let disposed = false;
  const s = ensureSocket();
  if (!s) {
    status.textContent = '로그인이 필요해요.';
    wrap.appendChild(title);
    wrap.appendChild(status);
    root.appendChild(wrap);
    return;
  }

  const sock = getGameSocket();
  if (!sock) {
    status.textContent = '소켓을 연결할 수 없어요.';
    wrap.appendChild(title);
    wrap.appendChild(status);
    root.appendChild(wrap);
    return;
  }

  /** @param {object} data */
  const onFound = (data) => {
    if (disposed) return;
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
    api.navigate('race');
  };

  const onExpired = () => {
    if (disposed) return;
    showAppToast('대기 시간이 지났어요.');
    disposed = true;
    sock.off('matchFound', onFound);
    sock.off('qrMatchExpired', onExpired);
    api.navigate('lobby');
  };

  sock.on('matchFound', onFound);
  sock.on('qrMatchExpired', onExpired);

  cancel.addEventListener('click', () => {
    disposed = true;
    sock.off('matchFound', onFound);
    sock.off('qrMatchExpired', onExpired);
    sock.emit('qrMatchCancel');
    api.navigate('lobby');
  });

  (async () => {
    try {
      const terrain = api.state.terrain || 'normal';
      const charged = spend(api.state, 1, 'qr_match_host', { terrain });
      if (!charged) {
        showAppToast('하트가 부족해요.');
        disposed = true;
        sock.off('matchFound', onFound);
        sock.off('qrMatchExpired', onExpired);
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
      const dataUrl = await QRCode.toDataURL(j.qrUrl, { margin: 2, width: 240 });
      img.src = dataUrl;
      status.textContent = '상대를 기다리는 중…';
    } catch (e) {
      console.error('[qrMatchHost]', e);
      earn(api.state, 1, 'qr_refund', { reason: 'create_failed' });
      showAppToast('QR 방을 만들지 못했어요. 하트는 돌려드렸어요.');
      disposed = true;
      sock.off('matchFound', onFound);
      sock.off('qrMatchExpired', onExpired);
      api.navigate('lobby');
    }
  })();

  qrWrap.appendChild(img);
  wrap.appendChild(title);
  wrap.appendChild(hint);
  wrap.appendChild(qrWrap);
  wrap.appendChild(status);
  wrap.appendChild(cancel);
  root.appendChild(wrap);
}
