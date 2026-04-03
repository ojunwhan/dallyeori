import { getToken, resolvePublicApiUrl } from './auth.js';

/**
 * @param {object} body
 * @returns {Promise<{ matchCode: string, qrUrl: string, guestToken: string }>}
 */
export async function createQrMatchRoom(body) {
  const token = getToken();
  if (!token) throw new Error('not_ready');
  const r = await fetch(resolvePublicApiUrl('/api/qr-match/create'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || String(r.status));
  return j;
}
