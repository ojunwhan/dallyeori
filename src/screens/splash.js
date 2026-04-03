/**
 * 시작 화면 — 구글·카카오 OAuth (달려오리 서버)
 */

import { login, getCurrentUser } from '../services/auth.js';
import { ensureUserFromAuth, applyUserRecordToAppState } from '../services/db.js';

/**
 * 로그인 후 프로필 설정 여부에 따라 이동
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function navigateAfterAuth(api) {
  const u = getCurrentUser();
  if (!u) {
    api.navigate('splash');
    return;
  }
  api.state.user = u;
  const record = ensureUserFromAuth(u);
  applyUserRecordToAppState(api.state, record);
  api.navigate(record.profileSetupComplete ? 'lobby' : 'profileSetup');
}

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountSplash(root, api) {
  if (getCurrentUser()) {
    navigateAfterAuth(api);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'app-screen';

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '달려오리 DALLYEORI';

  const sub = document.createElement('p');
  sub.className = 'app-muted';
  sub.textContent = '구글 또는 카카오로 로그인하세요';

  const btnGoogle = document.createElement('button');
  btnGoogle.type = 'button';
  btnGoogle.className = 'app-btn app-btn--primary';
  btnGoogle.textContent = '구글로 로그인';
  btnGoogle.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    btnGoogle.disabled = true;
    btnKakao.disabled = true;
    try {
      await login('google');
    } catch {
      btnGoogle.disabled = false;
      btnKakao.disabled = false;
    }
  });

  const btnKakao = document.createElement('button');
  btnKakao.type = 'button';
  btnKakao.className = 'app-btn';
  btnKakao.style.marginTop = '10px';
  btnKakao.textContent = '카카오로 로그인';
  btnKakao.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    btnGoogle.disabled = true;
    btnKakao.disabled = true;
    try {
      await login('kakao');
    } catch {
      btnGoogle.disabled = false;
      btnKakao.disabled = false;
    }
  });

  wrap.appendChild(title);
  wrap.appendChild(sub);
  wrap.appendChild(btnGoogle);
  wrap.appendChild(btnKakao);
  root.appendChild(wrap);
}
