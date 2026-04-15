/**
 * 시작 화면 — 구글·카카오 OAuth (달려오리 서버)
 */

import { login, getCurrentUser, getToken, decodeJWT } from '../services/auth.js';
import {
  ensureUserFromAuth,
  applyUserRecordToAppState,
  getUserRecord,
  patchUserRecord,
} from '../services/db.js';
import { fetchProfileMeV1 } from '../services/profileApi.js';

/**
 * 로그인 후 프로필 설정 여부에 따라 이동
 * @param {{ navigate: (s: string, p?: object, o?: object) => void, state: object }} api
 * @param {{ replaceHistory?: boolean }} [navOpts]
 */
export async function navigateAfterAuth(api, navOpts = {}) {
  const u = getCurrentUser();
  if (!u) {
    api.navigate('splash', undefined, { ...navOpts, replaceHistory: true });
    return;
  }
  api.state.user = u;
  const token = getToken();
  const raw = token ? decodeJWT(token) : null;
  const jwtIsNewUser =
    raw && typeof raw === 'object' && 'isNewUser' in raw ? raw.isNewUser : undefined;

  if (jwtIsNewUser === false) {
    let record = getUserRecord(u.uid);
    if (!record) {
      record = ensureUserFromAuth(u);
    }
    if (!record.profileSetupComplete) {
      patchUserRecord(u.uid, { profileSetupComplete: true });
      record = getUserRecord(u.uid);
    }
    if (record) applyUserRecordToAppState(api.state, record);
    const me = await fetchProfileMeV1();
    if (me && me.serverProfileComplete === false) {
      api.navigate('profileSetup', undefined, { ...navOpts, replaceHistory: true });
      return;
    }
    api.navigate('lobby', undefined, { ...navOpts, replaceHistory: true });
    return;
  }

  if (jwtIsNewUser === true) {
    const record = ensureUserFromAuth(u);
    applyUserRecordToAppState(api.state, record);
    api.navigate('profileSetup', undefined, { ...navOpts, replaceHistory: true });
    return;
  }

  const record = ensureUserFromAuth(u);
  applyUserRecordToAppState(api.state, record);
  const me = await fetchProfileMeV1();
  if (me && me.serverProfileComplete === false) {
    api.navigate('profileSetup', undefined, { ...navOpts, replaceHistory: true });
    return;
  }
  api.navigate(record.profileSetupComplete ? 'lobby' : 'profileSetup', undefined, {
    ...navOpts,
    replaceHistory: true,
  });
}

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountSplash(root, api) {
  if (getCurrentUser()) {
    void navigateAfterAuth(api, { replaceHistory: true }).catch((e) => {
      console.warn('[splash] navigateAfterAuth', e);
    });
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
