/**
 * 재대전 요청 대기 — 모킹 수락/거절(services/socket.js)
 */

import { startMockRematchRequest } from '../services/socket.js';

const REJECT_TO_LOBBY_MS = 2000;

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountRematchWait(root, api) {
  const oppNick = api.state.lastOpponent?.nickname;
  if (!oppNick) {
    api.navigate('lobby');
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'app-screen rematch-wait-screen';

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '재대전';

  const status = document.createElement('p');
  status.className = 'rematch-wait-status';
  status.textContent = '상대에게 재대전 요청 중…';

  const loading = document.createElement('div');
  loading.className = 'matching-loading';

  const spinner = document.createElement('div');
  spinner.className = 'matching-spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const duckRun = document.createElement('div');
  duckRun.className = 'matching-duck-run';
  duckRun.textContent = '🦆';
  duckRun.setAttribute('aria-hidden', 'true');

  loading.appendChild(spinner);
  loading.appendChild(duckRun);

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'app-btn';
  cancel.textContent = '취소';
  cancel.addEventListener('click', () => api.navigate('lobby'));

  wrap.appendChild(title);
  wrap.appendChild(status);
  wrap.appendChild(loading);
  wrap.appendChild(cancel);
  root.appendChild(wrap);

  const { promise, cancel: abortWait } = startMockRematchRequest();
  api.state._matchingCancel = abortWait;

  promise.then(({ accepted }) => {
    if (api.state.screen !== 'rematchWait') return;
    api.state._matchingCancel = null;

    if (accepted) {
      try {
        api.navigate('race', { opponentName: oppNick });
      } catch (e) {
        console.error('[rematchWait] → race', e);
      }
      return;
    }

    loading.hidden = true;
    cancel.hidden = true;
    status.textContent = '상대가 거절했습니다.';
    status.classList.add('rematch-wait-status--reject');

    api.state._matchingTimer = window.setTimeout(() => {
      api.state._matchingTimer = null;
      if (api.state.screen !== 'rematchWait') return;
      api.navigate('lobby');
    }, REJECT_TO_LOBBY_MS);
  });
}
