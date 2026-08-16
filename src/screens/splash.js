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
import { showAppToast } from '../services/toast.js';

const LOGO_GOOGLE = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const LOGO_KAKAO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="#191600" aria-hidden="true"><path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.79 1.86 5.24 4.65 6.62-.15.53-.97 3.35-1 3.57 0 0-.02.17.09.24.11.06.24.01.24.01.31-.04 3.6-2.36 4.17-2.76.53.08 1.08.12 1.65.12 5.52 0 10-3.54 10-7.9C22 6.54 17.52 3 12 3z"/></svg>';
const LOGO_APPLE = '<svg viewBox="0 0 24 24" width="21" height="21" fill="#fff" aria-hidden="true"><path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-1.73-.92-2.85-.9-1.47.02-2.83.85-3.58 2.17-1.53 2.65-.39 6.57 1.1 8.72.73 1.05 1.6 2.23 2.74 2.19 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.85.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.32-3.49zM14.53 4.5c.61-.74 1.02-1.77.91-2.79-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.7-.93 2.7.98.08 1.98-.5 2.59-1.23z"/></svg>';

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
  sub.style.marginBottom = '16px';
  sub.textContent = '로그인하고 전 세계 친구와 달려보세요';

  let busy = false;
  const makeLoginBtn = (brand, label, logo) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `login-btn login-btn--${brand}`;
    b.innerHTML = `<span class="login-btn__logo">${logo}</span> ${label}`;
    return b;
  };
  const btnGoogle = makeLoginBtn('google', 'Google로 로그인', LOGO_GOOGLE);
  const btnKakao = makeLoginBtn('kakao', '카카오로 로그인', LOGO_KAKAO);
  const btnApple = makeLoginBtn('apple', 'Apple로 로그인', LOGO_APPLE);

  const setDisabled = (v) => {
    btnGoogle.disabled = v;
    btnKakao.disabled = v;
    btnApple.disabled = v;
  };
  const doLogin = async (provider) => {
    if (busy) return;
    busy = true;
    setDisabled(true);
    try {
      await login(provider);
    } catch {
      busy = false;
      setDisabled(false);
    }
  };
  btnGoogle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void doLogin('google');
  });
  btnKakao.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void doLogin('kakao');
  });
  btnApple.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showAppToast('Apple 로그인은 iOS 앱 출시와 함께 제공됩니다');
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

  const sep = document.createTextNode('  ·  ');

  const aTerms = document.createElement('a');
  aTerms.setAttribute('href', '/terms');
  aTerms.setAttribute('target', '_blank');
  aTerms.setAttribute('rel', 'noopener noreferrer');
  aTerms.textContent = '이용약관';

  legal.appendChild(aPrivacy);
  legal.appendChild(sep);
  legal.appendChild(aTerms);

  wrap.appendChild(title);
  wrap.appendChild(sub);
  wrap.appendChild(btnGoogle);
  wrap.appendChild(btnKakao);
  wrap.appendChild(btnApple);
  wrap.appendChild(legal);
  root.appendChild(wrap);
}
