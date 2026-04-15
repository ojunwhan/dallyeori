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
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.minHeight = '100%';

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

  const legal = document.createElement('div');
  legal.className = 'app-muted';
  legal.style.marginTop = 'auto';
  legal.style.paddingTop = '28px';
  legal.style.textAlign = 'center';
  legal.style.fontSize = '0.75rem';
  legal.style.lineHeight = '1.6';

  const aPrivacy = document.createElement('a');
  aPrivacy.setAttribute('href', '/privacy');
  aPrivacy.setAttribute('target', '_blank');
  aPrivacy.setAttribute('rel', 'noopener noreferrer');
  aPrivacy.textContent = '개인정보처리방침';
  const privacyPath = document.createElement('span');
  privacyPath.textContent = '(/privacy)';

  const sep = document.createTextNode(' · ');

  const aTerms = document.createElement('a');
  aTerms.setAttribute('href', '/terms');
  aTerms.setAttribute('target', '_blank');
  aTerms.setAttribute('rel', 'noopener noreferrer');
  aTerms.textContent = '이용약관';
  const termsPath = document.createElement('span');
  termsPath.textContent = '(/terms)';

  legal.appendChild(aPrivacy);
  legal.appendChild(privacyPath);
  legal.appendChild(sep);
  legal.appendChild(aTerms);
  legal.appendChild(termsPath);

  wrap.appendChild(title);
  wrap.appendChild(sub);
  wrap.appendChild(btnGoogle);
  wrap.appendChild(btnKakao);
  wrap.appendChild(legal);
  root.appendChild(wrap);
}
