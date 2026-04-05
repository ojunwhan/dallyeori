/**
 * 서버 프로필 API (닉네임 저장·검색)
 */

import { getToken, resolvePublicApiUrl } from './auth.js';

/**
 * @param {string} nickname
 * @returns {{ ok: true, nickname: string } | { ok: false }}
 */
export function validateNicknameLocal(nickname) {
  const n = typeof nickname === 'string' ? nickname.trim() : '';
  if (n.length < 2 || n.length > 12) return { ok: false };
  if (!/^[\uAC00-\uD7A3a-zA-Z0-9]+$/.test(n)) return { ok: false };
  return { ok: true, nickname: n };
}

/**
 * @param {{ nickname: string, photoURL?: string, language?: string, selectedDuckId?: string }} body
 * @returns {Promise<{ ok: true, profile: object } | { ok: false, status: number, error: string }>}
 */
export async function postProfile(body) {
  const t = getToken();
  if (!t) return { ok: false, status: 401, error: 'unauthorized' };
  const res = await fetch(resolvePublicApiUrl('/api/profile'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${t}`,
    },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof data.error === 'string' ? data.error : 'unknown',
    };
  }
  return { ok: true, profile: data.profile ?? {} };
}

/**
 * @param {string} query
 * @returns {Promise<{ ok: boolean, users: { uid: string, nickname: string, photoURL: string, selectedDuckId: string }[] }>}
 */
/**
 * @param {string} peerUid
 * @returns {Promise<{ uid: string, nickname: string, photoURL: string, language: string, selectedDuckId: string } | null>}
 */
export async function fetchProfileByUid(peerUid) {
  if (!peerUid) return null;
  const t = getToken();
  if (!t) return null;
  const res = await fetch(
    resolvePublicApiUrl(`/api/profile/${encodeURIComponent(peerUid)}`),
    { headers: { Authorization: `Bearer ${t}` } },
  );
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function searchUsersOnServer(query) {
  const t = getToken();
  if (!t) return { ok: false, users: [] };
  const q = encodeURIComponent(query.trim());
  const res = await fetch(resolvePublicApiUrl(`/api/users/search?q=${q}`), {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!res.ok) return { ok: false, users: [] };
  try {
    const data = await res.json();
    const users = Array.isArray(data.users) ? data.users : [];
    return { ok: true, users };
  } catch {
    return { ok: false, users: [] };
  }
}
