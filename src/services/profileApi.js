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
 * @returns {Promise<{
 *   uid: string,
 *   nickname: string,
 *   photoURL: string,
 *   selectedDuckId: string,
 *   countryCode: string,
 *   gender: string | null,
 *   bio: string | null,
 *   language: string,
 *   lastSeenAt: string | null,
 *   profileSetupComplete: boolean,
 *   serverProfileComplete: boolean,
 * } | null>}
 */
export async function fetchProfileMeV1() {
  const t = getToken();
  if (!t) return null;
  const res = await fetch(resolvePublicApiUrl('/api/v1/profile/me'), {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   nickname: string,
 *   photoURL?: string,
 *   language?: string,
 *   selectedDuckId?: string,
 *   countryCode?: string,
 *   gender?: string | null,
 *   bio?: string | null,
 * }} body
 * @returns {Promise<{ ok: true, profile: object } | { ok: false, status: number, error: string }>}
 */
/**
 * 프로필 아바타 이미지 업로드 (multipart, 필드명 avatar)
 * @param {File} file
 * @returns {Promise<{ ok: true, photoURL: string } | { ok: false, status: number, error: string }>}
 */
export async function postProfileAvatar(file) {
  const t = getToken();
  if (!t || !file) return { ok: false, status: 401, error: 'unauthorized' };
  const fd = new FormData();
  fd.append('avatar', file);
  try {
    const res = await fetch(resolvePublicApiUrl('/api/v1/profile/avatar'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
      body: fd,
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
    if (data && data.ok === true && typeof data.photoURL === 'string') {
      return { ok: true, photoURL: data.photoURL };
    }
    return { ok: false, status: res.status, error: 'bad_response' };
  } catch (err) {
    console.error('[profileApi] postProfileAvatar', err);
    return { ok: false, status: 0, error: 'network' };
  }
}

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

/**
 * 친구 찾기 (v1): 필터·페이징·온라인 우선은 서버에서 처리
 * @param {{ q?: string, countryCode?: string, gender?: string, offset?: number, limit?: number }} opts
 */
export async function searchUsersDiscoveryV1(opts = {}) {
  const t = getToken();
  if (!t) return { ok: false, users: [] };
  const params = new URLSearchParams();
  const nickQ = typeof opts.q === 'string' ? opts.q.trim() : '';
  const countryCode = typeof opts.countryCode === 'string' ? opts.countryCode : '';
  const gender = typeof opts.gender === 'string' ? opts.gender : '';
  const offset = Number(opts.offset) || 0;
  const limit = Number(opts.limit) || 10;
  if (nickQ) params.set('q', nickQ);
  if (countryCode) params.set('countryCode', countryCode);
  if (gender) params.set('gender', gender);
  params.set('offset', String(offset));
  params.set('limit', String(limit));
  const res = await fetch(resolvePublicApiUrl(`/api/v1/users/search?${params.toString()}`), {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!res.ok) return { ok: false, users: [] };
  try {
    const data = await res.json();
    const users = Array.isArray(data) ? data : [];
    return { ok: true, users };
  } catch {
    return { ok: false, users: [] };
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

/**
 * POST /api/v1/friends/request/:uid
 * @param {string} targetUid
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string }>}
 */
export async function postFriendRequestV1(targetUid) {
  const t = getToken();
  if (!t || !targetUid) return { ok: false, status: 401, error: 'unauthorized' };
  const res = await fetch(
    resolvePublicApiUrl(`/api/v1/friends/request/${encodeURIComponent(targetUid)}`),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
    },
  );
  if (res.status === 409) {
    try {
      const d = await res.json();
      return { ok: false, status: 409, error: typeof d.error === 'string' ? d.error : 'incoming_pending' };
    } catch {
      return { ok: false, status: 409, error: 'incoming_pending' };
    }
  }
  if (!res.ok) {
    let err = 'request_failed';
    try {
      const d = await res.json();
      if (typeof d.error === 'string') err = d.error;
    } catch {
      /* ignore */
    }
    return { ok: false, status: res.status, error: err };
  }
  try {
    const d = await res.json();
    if (d && d.ok === true) return { ok: true };
  } catch {
    /* ignore */
  }
  return { ok: true };
}

/**
 * POST /api/v1/race/result
 * @param {{
 *   opponentUid: string,
 *   opponentNick?: string,
 *   result: 'win'|'lose'|'draw',
 *   myDistance: number,
 *   opponentDistance: number,
 *   duration: number,
 * }} body
 * @returns {Promise<{ ok: true } | { ok: false }>}
 */
export async function postRaceResultV1(body) {
  const t = getToken();
  if (!t || !body?.opponentUid) return { ok: false };
  try {
    const res = await fetch(resolvePublicApiUrl('/api/v1/race/result'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${t}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false };
    const d = await res.json().catch(() => ({}));
    return d && d.ok === true ? { ok: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * GET /api/v1/friends/recent-opponents
 * @returns {Promise<{ ok: true, users: object[] } | { ok: false, users: [] }>}
 */
export async function fetchRecentOpponentsV1() {
  const t = getToken();
  if (!t) return { ok: false, users: [] };
  try {
    const res = await fetch(resolvePublicApiUrl('/api/v1/friends/recent-opponents'), {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) return { ok: false, users: [] };
    const data = await res.json();
    const users = Array.isArray(data) ? data : [];
    return { ok: true, users };
  } catch {
    return { ok: false, users: [] };
  }
}

/**
 * GET /api/v1/notifications
 * @returns {Promise<{ ok: true, pendingReceived: object[], unreadResults: object[] } | { ok: false, pendingReceived: [], unreadResults: [] }>}
 */
export async function fetchSocialNotificationsV1() {
  const t = getToken();
  if (!t) return { ok: false, pendingReceived: [], unreadResults: [] };
  try {
    const res = await fetch(resolvePublicApiUrl('/api/v1/notifications'), {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) return { ok: false, pendingReceived: [], unreadResults: [] };
    const data = await res.json().catch(() => ({}));
    const pendingReceived = Array.isArray(data.pendingReceived) ? data.pendingReceived : [];
    const unreadResults = Array.isArray(data.unreadResults) ? data.unreadResults : [];
    return { ok: true, pendingReceived, unreadResults };
  } catch {
    return { ok: false, pendingReceived: [], unreadResults: [] };
  }
}

/**
 * POST /api/v1/notifications/mark-read
 * @param {string[]} requestIds
 */
export async function markSocialNotificationsReadV1(requestIds) {
  const t = getToken();
  if (!t || !Array.isArray(requestIds) || requestIds.length === 0) return { ok: false };
  try {
    const res = await fetch(resolvePublicApiUrl('/api/v1/notifications/mark-read'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${t}`,
      },
      body: JSON.stringify({ requestIds }),
    });
    if (!res.ok) return { ok: false };
    const d = await res.json().catch(() => ({}));
    return d && d.ok === true ? { ok: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}
