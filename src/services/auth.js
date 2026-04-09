/**
 * MONO 스타일 OAuth + JWT (달려오리 서버 /api/auth)
 * {@link ./interfaces/auth.contract.js IAuthService}
 */

import { showAppToast } from './toast.js';

/** @typedef {import('./interfaces/auth.contract.js').AuthUser} AuthUser */

/**
 * @param {string} token
 * @returns {Record<string, unknown> | null}
 */
export function decodeJWT(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

const JWT_KEY = 'dallyeori.auth.jwt';

/**
 * API 베이스 URL. 비우면 동일 출처(nginx → dallyeori-server).
 * @returns {string}
 */
export function apiBase() {
  const b = import.meta.env.VITE_API_BASE_URL;
  if (b === undefined || b === null) return '';
  return String(b).replace(/\/$/, '');
}

/**
 * fetch / 리다이렉트용 절대 경로 URL
 * @param {string} path '/api/...' 형태
 */
export function resolvePublicApiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = apiBase();
  return base ? `${base}${p}` : p;
}

/**
 * OAuth 리다이렉트 후 URL 해시에서 JWT 저장
 * @returns {boolean} 토큰을 소비했으면 true
 */
const QR_GUEST_PENDING_KEY = 'dallyeori_qr_pending';

/**
 * QR 게스트 진입 (?qr=코드&t=JWT) — 읽은 뒤 주소창에서 쿼리 제거
 * 인앱 브라우저 이탈 직전 URL 이 잘리면 sessionStorage 백업에서 복구 (index.html)
 * @returns {{ code: string, token: string } | null}
 */
export function consumeQrGuestParams() {
  const p = new URLSearchParams(window.location.search);
  let code = p.get('qr');
  let t = p.get('t');
  if (code && t) {
    try {
      sessionStorage.removeItem(QR_GUEST_PENDING_KEY);
    } catch (e) {
      /* ignore */
    }
  } else {
    try {
      const raw = sessionStorage.getItem(QR_GUEST_PENDING_KEY);
      if (raw) {
        sessionStorage.removeItem(QR_GUEST_PENDING_KEY);
        const o = JSON.parse(raw);
        if (o && typeof o.code === 'string' && typeof o.token === 'string') {
          code = o.code;
          t = o.token;
        }
      }
    } catch (e) {
      /* ignore */
    }
  }
  if (!code || !t) return null;
  const path = window.location.pathname || '/';
  window.history.replaceState(null, '', path);
  return { code, token: t };
}

export function consumeOAuthReturn() {
  const h = window.location.hash || '';
  if (!h.includes('dallyeori_token=')) return false;
  const m = h.match(/dallyeori_token=([^&]+)/);
  if (!m?.[1]) return false;
  try {
    const token = decodeURIComponent(m[1]);
    localStorage.setItem(JWT_KEY, token);
  } catch {
    showAppToast('로그인 토큰을 저장하지 못했어요.');
    return false;
  }
  const path = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', path);
  return true;
}

/**
 * @param {string} [provider] 'google' | 'kakao'
 * @returns {Promise<AuthUser>}
 */
export async function login(provider = 'google') {
  const p = provider === 'kakao' ? 'kakao' : 'google';
  window.location.href = resolvePublicApiUrl(`/api/auth/${p}`);
  return new Promise(() => {
    /* 리다이렉트로 페이지 이탈 — 이행 안 됨 */
  });
}

export function logout() {
  localStorage.removeItem(JWT_KEY);
}

/**
 * @returns {string | null}
 */
export function getToken() {
  const t = localStorage.getItem(JWT_KEY);
  return t && t.length > 0 ? t : null;
}

/**
 * @returns {AuthUser | null}
 */
export function getCurrentUser() {
  const t = getToken();
  if (!t) return null;
  const raw = decodeJWT(t);
  if (!raw || typeof raw !== 'object') return null;
  const p = /** @type {{ uid?: string, displayName?: string, email?: string, photoURL?: string, exp?: number }} */ (
    raw
  );
  if (p.exp != null && p.exp * 1000 < Date.now()) {
    localStorage.removeItem(JWT_KEY);
    return null;
  }
  if (!p.uid || typeof p.uid !== 'string') return null;
  return {
    uid: p.uid,
    displayName: p.displayName ?? '',
    email: p.email ?? '',
    photoURL: p.photoURL ?? '',
  };
}

/**
 * @type {import('./interfaces/auth.contract.js').IAuthService & { getToken: typeof getToken }}
 */
export const authService = {
  login,
  logout,
  getCurrentUser,
  getToken,
};

/** @deprecated login() 사용 */
export const signInWithMock = login;

/** @deprecated logout() 사용 */
export const signOutMock = logout;
