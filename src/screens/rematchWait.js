/**
 * 재대전 요청 대기 — 상대 수락 시 서버 matchFound 로 경주 진입
 */

const CANCEL_MS = 120_000;

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
  status.textContent = '상대의 수락을 기다리는 중이에요…';

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

  const tid = window.setTimeout(() => {
    if (api.state.screen !== 'rematchWait') return;
    api.navigate('lobby');
  }, CANCEL_MS);
  api.state._matchingTimer = tid;
}
